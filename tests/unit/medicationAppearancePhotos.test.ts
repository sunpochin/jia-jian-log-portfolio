/*
檔案用途：驗證藥品外觀照片上傳的壓縮、Storage 路徑與 public URL 邊界。
所在層：tests/unit；以假的 canvas、createImageBitmap 與 Supabase Storage 取代瀏覽器與遠端服務。
主要關聯：src/lib/medicationAppearancePhotos.ts、medication-appearance-photos public bucket。
*/
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

type UploadCall = { path: string; contentType: string }
const uploads: UploadCall[] = []
let uploadError: unknown = null

const storage = {
  from: (bucket: string) => {
    expect(bucket).toBe('medication-appearance-photos')
    return {
      upload: async (path: string, _blob: Blob, options: { contentType: string }) => {
        uploads.push({ path, contentType: options.contentType })
        return { data: null, error: uploadError }
      },
      getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.test/medication-appearance-photos/${path}` } }),
    }
  },
}

mock.module('../../src/lib/supabase', () => ({ supabase: { storage } }))

const { uploadMedicationAppearancePhoto } = await import('../../src/lib/medicationAppearancePhotos')

const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
const previousCreateImageBitmap = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap')

/** 產生一個永遠回傳指定 mime 與大小的假 canvas document。 */
function fakeDocument(options: { encodeType?: (requested: string) => string } = {}) {
  return {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({ drawImage() {} }),
      toBlob: (callback: (blob: Blob | null) => void, type: string) => {
        const resolvedType = options.encodeType ? options.encodeType(type) : type
        callback(new Blob([new Uint8Array(16)], { type: resolvedType }))
      },
    }),
  }
}

const photoFile = () => new File([new Uint8Array(8)], 'photo.jpg', { type: 'image/jpeg' })

beforeEach(() => {
  uploads.length = 0
  uploadError = null
  Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, writable: true, value: async () => ({ width: 1200, height: 900, close() {} }) })
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: fakeDocument() })
})

afterEach(() => {
  for (const [name, descriptor] of [['document', previousDocument], ['createImageBitmap', previousCreateImageBitmap]] as const) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  }
})

describe('uploadMedicationAppearancePhoto', () => {
  test('refuses a file that is not an image', async () => {
    await expect(uploadMedicationAppearancePhoto(new File(['x'], 'note.txt', { type: 'text/plain' }))).rejects.toThrow('photo_type_not_supported')
    expect(uploads).toHaveLength(0)
  })

  test('compresses to WebP, uploads under photos/ and returns a public URL', async () => {
    const url = await uploadMedicationAppearancePhoto(photoFile())
    expect(uploads).toHaveLength(1)
    expect(uploads[0]?.path).toMatch(/^photos\/[0-9a-f-]+\.webp$/)
    expect(uploads[0]?.contentType).toBe('image/webp')
    expect(url).toBe(`https://storage.test/medication-appearance-photos/${uploads[0]?.path}`)
  })

  test('falls back to JPEG when the browser cannot encode WebP', async () => {
    Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: fakeDocument({ encodeType: requested => (requested === 'image/webp' ? 'image/png' : requested) }) })
    const url = await uploadMedicationAppearancePhoto(photoFile())
    expect(uploads[0]?.path).toMatch(/\.jpg$/)
    expect(uploads[0]?.contentType).toBe('image/jpeg')
    expect(url).toContain('.jpg')
  })

  test('surfaces a Storage upload failure instead of returning a broken URL', async () => {
    uploadError = new Error('storage rejected')
    await expect(uploadMedicationAppearancePhoto(photoFile())).rejects.toThrow('storage rejected')
  })
})

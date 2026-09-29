/*
檔案用途：驗證藥品外觀照片上傳的壓縮、Storage 路徑與簽名網址邊界。
所在層：tests/unit；以假的 canvas、createImageBitmap 與 Supabase Storage 取代瀏覽器與遠端服務。
主要關聯：src/lib/medication/medicationAppearancePhotos.ts、private medication-appearance-photos bucket。
*/
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

type UploadCall = { path: string; contentType: string }
const uploads: UploadCall[] = []
let uploadError: unknown = null
let signedUrlError: unknown = null

const storage = {
  from: (bucket: string) => {
    expect(bucket).toBe('medication-appearance-photos')
    return {
      upload: async (path: string, _blob: Blob, options: { contentType: string }) => {
        uploads.push({ path, contentType: options.contentType })
        return { data: null, error: uploadError }
      },
      createSignedUrl: async (path: string, expiresInSeconds: number) => {
        if (signedUrlError) return { data: null, error: signedUrlError }
        return { data: { signedUrl: `https://storage.test/signed/${path}?ttl=${expiresInSeconds}` }, error: null }
      },
    }
  },
}

mock.module('../../src/lib/supabase', () => ({ supabase: { storage } }))

const { extractMedicationAppearancePhotoStoragePath, isMedicationAppearancePhotoPath, signMedicationAppearancePhotoPath, uploadMedicationAppearancePhoto } = await import('../../src/lib/medication/medicationAppearancePhotos')

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
  signedUrlError = null
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

  test('compresses to WebP, uploads under photos/ and returns the bare storage path', async () => {
    const path = await uploadMedicationAppearancePhoto(photoFile())
    expect(uploads).toHaveLength(1)
    expect(uploads[0]?.path).toMatch(/^photos\/[0-9a-f-]+\.webp$/)
    expect(uploads[0]?.contentType).toBe('image/webp')
    expect(path).toBe(uploads[0]?.path)
  })

  test('falls back to JPEG when the browser cannot encode WebP', async () => {
    Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: fakeDocument({ encodeType: requested => (requested === 'image/webp' ? 'image/png' : requested) }) })
    const path = await uploadMedicationAppearancePhoto(photoFile())
    expect(uploads[0]?.path).toMatch(/\.jpg$/)
    expect(uploads[0]?.contentType).toBe('image/jpeg')
    expect(path).toContain('.jpg')
  })

  test('surfaces a Storage upload failure instead of returning a broken path', async () => {
    uploadError = new Error('storage rejected')
    await expect(uploadMedicationAppearancePhoto(photoFile())).rejects.toThrow('storage rejected')
  })
})

describe('isMedicationAppearancePhotoPath', () => {
  test('only accepts our own photos/ bucket path shape', () => {
    expect(isMedicationAppearancePhotoPath('photos/abc-123.webp')).toBe(true)
    expect(isMedicationAppearancePhotoPath('photos/abc-123.jpg')).toBe(true)
    expect(isMedicationAppearancePhotoPath('https://mcp.fda.gov.tw/shape/a.jpg')).toBe(false)
    expect(isMedicationAppearancePhotoPath('photos/../secrets.webp')).toBe(false)
    expect(isMedicationAppearancePhotoPath('photos/a//b.webp')).toBe(false)
    expect(isMedicationAppearancePhotoPath('photos/a.png')).toBe(false)
  })
})

describe('extractMedicationAppearancePhotoStoragePath', () => {
  test('passes a bare path through unchanged', () => {
    expect(extractMedicationAppearancePhotoStoragePath('photos/abc-123.webp')).toBe('photos/abc-123.webp')
  })

  test('recovers the path from a legacy public URL left by a stale client during rollout', () => {
    expect(extractMedicationAppearancePhotoStoragePath('https://nhdmksmcsvkfadgafooh.supabase.co/storage/v1/object/public/medication-appearance-photos/photos/abc-123.webp')).toBe('photos/abc-123.webp')
  })

  test('rejects unrelated external URLs and traversal attempts', () => {
    expect(extractMedicationAppearancePhotoStoragePath('https://example.com/medicine.jpg')).toBeNull()
    expect(extractMedicationAppearancePhotoStoragePath('https://x.supabase.co/storage/v1/object/public/medication-appearance-photos/photos/../secrets.webp')).toBeNull()
  })

  test('returns null instead of throwing when the matched segment has malformed percent-encoding', () => {
    expect(extractMedicationAppearancePhotoStoragePath('https://x.supabase.co/storage/v1/object/public/medication-appearance-photos/photos/%E0%A4%A.webp')).toBeNull()
  })
})

describe('signMedicationAppearancePhotoPath', () => {
  test('signs a safe path and returns the signed URL', async () => {
    const url = await signMedicationAppearancePhotoPath('photos/abc-123.webp')
    expect(url).toBe('https://storage.test/signed/photos/abc-123.webp?ttl=3600')
  })

  test('signs a legacy public URL written by a stale client during the rollout window', async () => {
    const url = await signMedicationAppearancePhotoPath('https://nhdmksmcsvkfadgafooh.supabase.co/storage/v1/object/public/medication-appearance-photos/photos/abc-123.webp')
    expect(url).toBe('https://storage.test/signed/photos/abc-123.webp?ttl=3600')
  })

  test('refuses to sign a path that is not ours, without calling Storage', async () => {
    expect(await signMedicationAppearancePhotoPath('https://example.com/pill.jpg')).toBeNull()
  })

  test('surfaces a Storage signing failure', async () => {
    signedUrlError = new Error('signing rejected')
    await expect(signMedicationAppearancePhotoPath('photos/abc-123.webp')).rejects.toThrow('signing rejected')
  })
})

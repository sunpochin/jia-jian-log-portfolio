/*
檔案用途：驗證照護大事記照片的解碼退路、壓縮上限、Storage 上傳失敗清理與 signed URL 邊界。
所在層：tests/unit；以假的 canvas、Image 與 Supabase Storage 取代瀏覽器與遠端服務。
主要關聯：src/lib/careEventPhotos.ts、care-event-photos private bucket 與 CareTimeline 照片輸入。
*/
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

type UploadCall = { path: string; contentType: string }
type SignedResult = { data?: unknown; error?: unknown }
const uploads: UploadCall[] = []
const removals: string[][] = []
const signedCalls: string[][] = []
const directSignedCalls: string[] = []
let uploadError: (path: string) => unknown = () => null
let removeError: unknown = null
let signedResult: SignedResult | ((paths: string[]) => SignedResult) = { data: [], error: null }
let directSignedResult: SignedResult | ((path: string) => SignedResult) = { data: null, error: null }

const storage = {
  from: (bucket: string) => {
    expect(bucket).toBe('care-event-photos')
    return {
      upload: async (path: string, _blob: Blob, options: { contentType: string }) => {
        uploads.push({ path, contentType: options.contentType })
        return { data: null, error: uploadError(path) }
      },
      remove: async (paths: string[]) => {
        removals.push(paths)
        return { data: null, error: removeError }
      },
      createSignedUrls: async (paths: string[]) => {
        signedCalls.push(paths)
        return typeof signedResult === 'function' ? signedResult(paths) : signedResult
      },
      createSignedUrl: async (path: string) => {
        directSignedCalls.push(path)
        return typeof directSignedResult === 'function' ? directSignedResult(path) : directSignedResult
      },
    }
  },
}

mock.module('../../src/lib/supabase', () => ({ supabase: { storage } }))

const {
  prepareCareEventPhoto,
  removeCareEventPhotoPaths,
  signCareEventPhotoPaths,
  signCareEventPhotoPathsBestEffort,
  uploadCareEventPhotos,
} = await import('../../src/lib/careEventPhotos')

const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
const previousCreateImageBitmap = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap')
const previousImage = Object.getOwnPropertyDescriptor(globalThis, 'Image')
const previousUrl = Object.getOwnPropertyDescriptor(globalThis, 'URL')

/** 產生一個永遠回傳指定 mime 與大小的假 canvas document。 */
function fakeDocument(options: { encodeType?: (requested: string) => string; size?: number; failToBlob?: boolean } = {}) {
  return {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({ drawImage() {} }),
      toBlob: (callback: (blob: Blob | null) => void, type: string) => {
        if (options.failToBlob) { callback(null); return }
        const resolvedType = options.encodeType ? options.encodeType(type) : type
        callback(new Blob([new Uint8Array(options.size ?? 16)], { type: resolvedType }))
      },
    }),
  }
}

function useDocument(value: unknown) {
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value })
}

function useCreateImageBitmap(value: unknown) {
  Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, writable: true, value })
}

const photoFile = () => new File([new Uint8Array(8)], 'photo.jpg', { type: 'image/jpeg' })

beforeEach(() => {
  uploads.length = 0
  removals.length = 0
  signedCalls.length = 0
  directSignedCalls.length = 0
  uploadError = () => null
  removeError = null
  signedResult = { data: [], error: null }
  directSignedResult = { data: null, error: null }
  useCreateImageBitmap(async () => ({ width: 1800, height: 1200, close() {} }))
  useDocument(fakeDocument())
})

afterEach(() => {
  for (const [name, descriptor] of [['document', previousDocument], ['createImageBitmap', previousCreateImageBitmap], ['Image', previousImage], ['URL', previousUrl]] as const) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  }
})

describe('photo decoding fallbacks', () => {
  test('falls back to an Image element when createImageBitmap rejects the EXIF option', async () => {
    // 部分 Safari 版本有 createImageBitmap 但不接受 imageOrientation；退路必須仍能完成壓縮。
    useCreateImageBitmap(async () => { throw new Error('option not supported') })
    let revoked = 0
    Object.defineProperty(globalThis, 'URL', {
      configurable: true,
      writable: true,
      value: { createObjectURL: () => 'blob:photo', revokeObjectURL: () => { revoked += 1 } },
    })
    Object.defineProperty(globalThis, 'Image', {
      configurable: true,
      writable: true,
      value: class {
        decoding = ''
        naturalWidth = 800
        naturalHeight = 600
        onload: (() => void) | null = null
        onerror: (() => void) | null = null
        set src(_value: string) { queueMicrotask(() => this.onload?.()) }
      },
    })

    const prepared = await prepareCareEventPhoto(photoFile())
    expect(prepared.extension).toBe('webp')
    expect(revoked).toBe(1)
  })

  test('reports a photo the browser cannot decode at all', async () => {
    useCreateImageBitmap(undefined)
    let revoked = 0
    Object.defineProperty(globalThis, 'URL', {
      configurable: true,
      writable: true,
      value: { createObjectURL: () => 'blob:photo', revokeObjectURL: () => { revoked += 1 } },
    })
    Object.defineProperty(globalThis, 'Image', {
      configurable: true,
      writable: true,
      value: class {
        decoding = ''
        onload: (() => void) | null = null
        onerror: (() => void) | null = null
        set src(_value: string) { queueMicrotask(() => this.onerror?.()) }
      },
    })

    await expect(prepareCareEventPhoto(photoFile())).rejects.toThrow('photo_decode_failed')
    // 解碼失敗仍要釋放 object URL，否則長時間使用會累積記憶體。
    expect(revoked).toBe(1)
  })

  test('refuses a file that is not an image', async () => {
    await expect(prepareCareEventPhoto(new File(['x'], 'note.txt', { type: 'text/plain' }))).rejects.toThrow('photo_type_not_supported')
  })
})

describe('photo encoding limits', () => {
  test('falls back to JPEG when the browser cannot encode WebP', async () => {
    useDocument(fakeDocument({ encodeType: requested => (requested === 'image/webp' ? 'image/png' : requested) }))
    const prepared = await prepareCareEventPhoto(photoFile())
    expect(prepared.extension).toBe('jpg')
    expect(prepared.contentType).toBe('image/jpeg')
  })

  test('treats a canvas that cannot encode at all as no WebP support', async () => {
    useDocument(fakeDocument({ failToBlob: true }))
    await expect(prepareCareEventPhoto(photoFile())).rejects.toThrow('image_encode_failed')
  })

  test('gives up rather than uploading a photo that never fits the Storage cap', async () => {
    // 一直壓不到上限時必須明確失敗，不能把超標 Blob 丟給上傳層才報錯。
    useDocument(fakeDocument({ size: 2 * 1024 * 1024 }))
    await expect(prepareCareEventPhoto(photoFile())).rejects.toThrow('photo_size_limit_exceeded')
  })
})

describe('uploading care event photos', () => {
  test('does nothing for an empty selection and refuses more than the limit', async () => {
    await expect(uploadCareEventPhotos('patient-1', 'event-1', [])).resolves.toEqual([])
    await expect(uploadCareEventPhotos('patient-1', 'event-1', [photoFile(), photoFile(), photoFile(), photoFile(), photoFile()]))
      .rejects.toThrow('photo_limit_exceeded')
    expect(uploads).toHaveLength(0)
  })

  test('stores each photo as a patient-scoped original and thumbnail pair', async () => {
    const stored = await uploadCareEventPhotos('patient-1', 'event-1', [photoFile()])
    expect(stored).toHaveLength(1)
    expect(stored[0]?.path.startsWith('patients/patient-1/events/event-1/')).toBe(true)
    expect(stored[0]?.thumbnail_path.endsWith('-thumb.webp')).toBe(true)
    expect(uploads.map(upload => upload.contentType)).toEqual(['image/webp', 'image/webp'])
  })

  test('cleans up the files it already uploaded when a later upload fails', async () => {
    uploadError = path => (path.endsWith('-thumb.webp') ? new Error('storage rejected') : null)
    await expect(uploadCareEventPhotos('patient-1', 'event-1', [photoFile()])).rejects.toThrow('storage rejected')
    // Storage 沒有和資料表共用 transaction；失敗時必須盡力刪掉本次已上傳的孤兒檔案。
    expect(removals[0]).toHaveLength(2)
  })

  test('still reports the original failure when the cleanup itself fails', async () => {
    uploadError = () => new Error('storage rejected')
    removeError = new Error('cleanup denied')
    await expect(uploadCareEventPhotos('patient-1', 'event-1', [photoFile()])).rejects.toThrow('storage rejected')
  })
})

describe('storage path safety', () => {
  test('never sends a path outside the patient photo tree to Storage', async () => {
    await removeCareEventPhotoPaths(['../../etc/passwd', 'https://example.test/a.webp', 'patients/p/events/e/a.txt'])
    expect(removals).toHaveLength(0)

    await removeCareEventPhotoPaths(['patients/p/events/e/a.webp', 'patients/p/events/e/a-thumb.webp'])
    expect(removals[0]).toEqual(['patients/p/events/e/a.webp', 'patients/p/events/e/a-thumb.webp'])
  })

  test('surfaces a failed deletion so orphaned files are not silently kept', async () => {
    removeError = new Error('delete denied')
    await expect(removeCareEventPhotoPaths(['patients/p/events/e/a.webp'])).rejects.toThrow('delete denied')
  })

  test('signs each distinct safe path once and skips entries without a URL', async () => {
    signedResult = {
      data: [
        { path: 'patients/p/events/e/a.webp', signedUrl: 'https://signed.test/a' },
        { path: 'patients/p/events/e/b.webp', signedUrl: null },
      ],
      error: null,
    }
    await expect(signCareEventPhotoPaths([
      'patients/p/events/e/a.webp',
      'patients/p/events/e/a.webp',
      'patients/p/events/e/b.webp',
      '../secret.webp',
    ])).resolves.toEqual({ 'patients/p/events/e/a.webp': 'https://signed.test/a' })
  })

  test('returns nothing to sign when every path was rejected, and surfaces sign failures', async () => {
    await expect(signCareEventPhotoPaths(['../secret.webp'])).resolves.toEqual({})
    signedResult = { data: null, error: new Error('sign denied') }
    await expect(signCareEventPhotoPaths(['patients/p/events/e/a.webp'])).rejects.toThrow('sign denied')
  })

  test('recovers valid paths when one stale object breaks the batch request', async () => {
    const workingPath = 'patients/p/events/e/working.webp'
    const stalePath = 'patients/p/events/e/stale.webp'
    signedResult = { data: null, error: new Error('stale object') }
    directSignedResult = path => path === workingPath
      ? { data: { signedUrl: 'https://signed.test/working' }, error: null }
      : { data: { signedUrl: null }, error: null }

    await expect(signCareEventPhotoPathsBestEffort([workingPath, stalePath])).resolves.toEqual({
      [workingPath]: 'https://signed.test/working',
    })
    // 批次失敗時，第一張新照片要改走單檔 endpoint；不能把同一個失敗的批次請求重試兩次。
    expect(signedCalls).toEqual([[workingPath, stalePath]])
    expect(directSignedCalls).toEqual([workingPath, stalePath])
  })

  test('fills a missing URL from a successful batch response with the direct endpoint', async () => {
    const freshPath = 'patients/p/events/e/fresh.webp'
    const missingPath = 'patients/p/events/e/missing.webp'
    signedResult = {
      data: [{ path: freshPath, signedUrl: 'https://signed.test/fresh' }, { path: missingPath, signedUrl: null }],
      error: null,
    }
    directSignedResult = { data: { signedUrl: 'https://signed.test/missing' }, error: null }

    await expect(signCareEventPhotoPathsBestEffort([freshPath, missingPath])).resolves.toEqual({
      [freshPath]: 'https://signed.test/fresh',
      [missingPath]: 'https://signed.test/missing',
    })
    expect(directSignedCalls).toEqual([missingPath])
  })

  test('uses the direct endpoint for a single newly uploaded photo', async () => {
    const newPhotoPath = 'patients/p/events/e/new-photo-thumb.webp'
    directSignedResult = { data: { signedUrl: 'https://signed.test/new-photo' }, error: null }

    await expect(signCareEventPhotoPathsBestEffort([newPhotoPath])).resolves.toEqual({
      [newPhotoPath]: 'https://signed.test/new-photo',
    })
    // 第一張照片不應先繞批次 endpoint；單檔簽署能在上傳後立即取得正確 URL。
    expect(signedCalls).toEqual([])
    expect(directSignedCalls).toEqual([newPhotoPath])
  })
})

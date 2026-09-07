/*
檔案用途：驗證照護事件照片的 path 邊界與 JSONB metadata 正規化。
所在層：tests/unit；不建立瀏覽器畫布或連線真實 Storage。
主要關聯：src/lib/careEventPhotos.ts、CareTimeline 與照片 migration。
*/
import { describe, expect, test } from 'bun:test'
import { buildCareEventPhotoPaths, createCareTimelineEntryId, normalizeCareEventPhotoPaths, prepareCareEventPhoto, serializeCareEventPhotoPaths } from '../../src/lib/careEventPhotos'

describe('care event photo metadata', () => {
  test('builds patient-scoped original and thumbnail paths', () => {
    expect(buildCareEventPhotoPaths('patient-1', 'event-1', 'photo-1')).toEqual({
      path: 'patients/patient-1/events/event-1/photo-1.webp',
      thumbnail_path: 'patients/patient-1/events/event-1/photo-1-thumb.webp',
    })
  })

  test('creates an id accepted by PostgreSQL UUID columns', () => {
    expect(createCareTimelineEntryId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })

  test('keeps the UUID shape when randomUUID is unavailable', () => {
    const previousCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { getRandomValues: (bytes: Uint8Array) => bytes.fill(7) },
    })
    try {
      expect(createCareTimelineEntryId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    } finally {
      if (previousCrypto) Object.defineProperty(globalThis, 'crypto', previousCrypto)
      else Reflect.deleteProperty(globalThis, 'crypto')
    }
  })

  test('still produces a valid UUID shape without any Web Crypto API at all', () => {
    // 沒有 randomUUID 也沒有 getRandomValues 時，仍不能讓上傳成功後 insert 因型別錯誤而回滾。
    const previousCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined })
    try {
      const id = createCareTimelineEntryId()
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
      expect(createCareTimelineEntryId()).not.toBe(id)
    } finally {
      if (previousCrypto) Object.defineProperty(globalThis, 'crypto', previousCrypto)
      else Reflect.deleteProperty(globalThis, 'crypto')
    }
  })

  test('keeps both encoded blobs under their Storage byte caps', async () => {
    const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
    const previousCreateImageBitmap = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap')
    Object.defineProperty(globalThis, 'createImageBitmap', {
      configurable: true,
      value: async () => ({ width: 1800, height: 1200, close() {} }),
    })
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        createElement: () => {
          const canvas = {
            width: 0,
            height: 0,
            getContext: () => ({ drawImage() {} }),
            toBlob: (callback: (blob: Blob | null) => void) => {
              // 以像素數模擬高細節照片；只有真的縮小畫布才會通過上限。
              callback(new Blob([new Uint8Array(Math.max(1, canvas.width * canvas.height))], { type: 'image/webp' }))
            },
          }
          return canvas
        },
      },
    })

    try {
      const prepared = await prepareCareEventPhoto(new File(['photo'], 'photo.jpg', { type: 'image/jpeg' }))
      expect(prepared.original.size).toBeLessThanOrEqual(600 * 1024)
      expect(prepared.thumbnail.size).toBeLessThanOrEqual(120 * 1024)
    } finally {
      if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument)
      else Reflect.deleteProperty(globalThis, 'document')
      if (previousCreateImageBitmap) Object.defineProperty(globalThis, 'createImageBitmap', previousCreateImageBitmap)
      else Reflect.deleteProperty(globalThis, 'createImageBitmap')
    }
  })

  test('falls back to JPEG when the browser silently downgrades WebP encoding to PNG', async () => {
    // 部分瀏覽器（例如較舊的 Safari）canvas.toBlob 要求 image/webp 時會悄悄退回 image/png；
    // 這曾經讓照片永遠上傳失敗，因為 Storage bucket 只允許 image/webp。
    const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
    const previousCreateImageBitmap = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap')
    Object.defineProperty(globalThis, 'createImageBitmap', {
      configurable: true,
      value: async () => ({ width: 1800, height: 1200, close() {} }),
    })
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        createElement: () => {
          const canvas = {
            width: 0,
            height: 0,
            getContext: () => ({ drawImage() {} }),
            toBlob: (callback: (blob: Blob | null) => void, type: string) => {
              const actualType = type === 'image/webp' ? 'image/png' : type
              callback(new Blob([new Uint8Array(Math.max(1, canvas.width * canvas.height))], { type: actualType }))
            },
          }
          return canvas
        },
      },
    })

    try {
      const prepared = await prepareCareEventPhoto(new File(['photo'], 'photo.jpg', { type: 'image/jpeg' }))
      expect(prepared.extension).toBe('jpg')
      expect(prepared.contentType).toBe('image/jpeg')
      expect(prepared.original.type).toBe('image/jpeg')
      expect(prepared.thumbnail.type).toBe('image/jpeg')
      expect(buildCareEventPhotoPaths('patient-1', 'event-1', 'photo-1', prepared.extension)).toEqual({
        path: 'patients/patient-1/events/event-1/photo-1.jpg',
        thumbnail_path: 'patients/patient-1/events/event-1/photo-1-thumb.jpg',
      })
    } finally {
      if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument)
      else Reflect.deleteProperty(globalThis, 'document')
      if (previousCreateImageBitmap) Object.defineProperty(globalThis, 'createImageBitmap', previousCreateImageBitmap)
      else Reflect.deleteProperty(globalThis, 'createImageBitmap')
    }
  })

  test('normalizes legacy strings and keeps only safe webp paths', () => {
    expect(normalizeCareEventPhotoPaths([
      'patients/patient-1/events/event-1/photo-1.webp',
      { path: 'patients/patient-1/events/event-1/photo-2.webp', thumbnail_path: 'patients/patient-1/events/event-1/photo-2-thumb.webp', thumbnailUrl: 'https://signed.example/thumb' },
      { path: '../other-patient/photo.webp', thumbnail_path: '../other-patient/photo-thumb.webp' },
      { path: 'https://example.com/photo.webp', thumbnail_path: 'https://example.com/thumb.webp' },
    ])).toEqual([
      { path: 'patients/patient-1/events/event-1/photo-1.webp', thumbnail_path: 'patients/patient-1/events/event-1/photo-1.webp' },
      { path: 'patients/patient-1/events/event-1/photo-2.webp', thumbnail_path: 'patients/patient-1/events/event-1/photo-2-thumb.webp' },
    ])
    expect(normalizeCareEventPhotoPaths([
      { path: 'patients/patient-1/events/event-1/photo-2.webp', thumbnail_path: 'patients/patient-1/events/event-1/photo-2-thumb.webp', thumbnailUrl: 'https://signed.example/thumb' },
    ], true)[0]?.thumbnailUrl).toBe('https://signed.example/thumb')
  })

  test('serializes metadata without short-lived signed URLs', () => {
    expect(serializeCareEventPhotoPaths([
      { path: 'patients/patient-1/events/event-1/photo.webp', thumbnail_path: 'patients/patient-1/events/event-1/photo-thumb.webp', thumbnailUrl: 'https://signed.example/thumb' },
    ])).toEqual([{ path: 'patients/patient-1/events/event-1/photo.webp', thumbnail_path: 'patients/patient-1/events/event-1/photo-thumb.webp' }])
  })
})

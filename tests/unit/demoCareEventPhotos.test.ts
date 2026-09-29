/*
檔案用途：驗證展示模式的照片壓縮輸出是 data URI（不是 Storage 相對路徑），且受檔數上限保護。
所在層：tests/unit；用假 canvas／FileReader 模擬瀏覽器圖片壓縮，不連線真實 Storage。
主要關聯：src/lib/demoCareEventPhotos.ts，重用 src/lib/careEventPhotos.ts 既有的壓縮流程。
*/
import { describe, expect, test } from 'bun:test'
import { prepareDemoCareEventPhotoUrls } from '../../src/lib/demoCareEventPhotos'
import { CARE_EVENT_PHOTO_LIMIT } from '../../src/lib/careEventPhotos'

function withBrowserImageMocks<T>(run: () => Promise<T>): Promise<T> {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const previousCreateImageBitmap = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap')
  const previousFileReader = Object.getOwnPropertyDescriptor(globalThis, 'FileReader')
  Object.defineProperty(globalThis, 'createImageBitmap', {
    configurable: true,
    value: async () => ({ width: 800, height: 600, close() {} }),
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
            callback(new Blob([new Uint8Array(Math.max(1, canvas.width * canvas.height))], { type: 'image/webp' }))
          },
        }
        return canvas
      },
    },
  })
  // bun 的測試環境沒有 FileReader；用最小可用的假實作把 Blob 轉成 base64 data URI。
  Object.defineProperty(globalThis, 'FileReader', {
    configurable: true,
    value: class {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      result: string | null = null
      readAsDataURL(blob: Blob) {
        void blob.arrayBuffer().then(buffer => {
          this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`
          this.onload?.()
        })
      }
    },
  })

  return run().finally(() => {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument)
    else Reflect.deleteProperty(globalThis, 'document')
    if (previousCreateImageBitmap) Object.defineProperty(globalThis, 'createImageBitmap', previousCreateImageBitmap)
    else Reflect.deleteProperty(globalThis, 'createImageBitmap')
    if (previousFileReader) Object.defineProperty(globalThis, 'FileReader', previousFileReader)
    else Reflect.deleteProperty(globalThis, 'FileReader')
  })
}

describe('demo care event photo urls', () => {
  test('returns an empty array without touching any browser API', async () => {
    expect(await prepareDemoCareEventPhotoUrls([])).toEqual([])
  })

  test('compresses each file into a data URI usable directly as an <img src>', async () => {
    const urls = await withBrowserImageMocks(() =>
      prepareDemoCareEventPhotoUrls([
        new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
        new File(['b'], 'b.jpg', { type: 'image/jpeg' }),
      ]))
    expect(urls).toHaveLength(2)
    for (const url of urls) expect(url.startsWith('data:image/webp;base64,')).toBe(true)
  })

  test('rejects more files than the shared care-event photo limit', async () => {
    const tooMany = Array.from({ length: CARE_EVENT_PHOTO_LIMIT + 1 }, (_, index) => new File(['x'], `${index}.jpg`, { type: 'image/jpeg' }))
    await expect(prepareDemoCareEventPhotoUrls(tooMany)).rejects.toThrow('photo_limit_exceeded')
  })
})

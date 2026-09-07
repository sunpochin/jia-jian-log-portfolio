/*
檔案用途：瀏覽器端圖片解碼與壓縮共用邏輯（EXIF 方向、WebP 偵測、依尺寸與檔案大小上限重新編碼）。
所在層：src/lib；不含任何 Storage 或表單邏輯，純粹處理 File → 壓縮後 Blob。
主要關聯：由 careEventPhotos.ts（照護大事記照片）與 medicationAppearancePhotos.ts（藥品外觀照片）共用。
*/

export type ImageExtension = 'webp' | 'jpg'
const WEBP_CONTENT_TYPE = 'image/webp'
const JPEG_CONTENT_TYPE = 'image/jpeg'
export const IMAGE_CONTENT_TYPE_BY_EXTENSION: Record<ImageExtension, string> = { webp: WEBP_CONTENT_TYPE, jpg: JPEG_CONTENT_TYPE }

export type DecodedImage = {
  source: CanvasImageSource
  width: number
  height: number
  cleanup: () => void
}

export async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof globalThis.createImageBitmap === 'function') {
    try {
      const bitmap = await globalThis.createImageBitmap(file, { imageOrientation: 'from-image' })
      return { source: bitmap, width: bitmap.width, height: bitmap.height, cleanup: () => bitmap.close() }
    } catch {
      // 某些 Safari 版本有 createImageBitmap 但不接受 EXIF 選項，退回 Image 仍可完成一般照片壓縮。
    }
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.decoding = 'async'
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('photo_decode_failed'))
      element.src = objectUrl
    })
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, cleanup: () => URL.revokeObjectURL(objectUrl) }
  } catch (error) {
    URL.revokeObjectURL(objectUrl)
    throw error
  }
}

export function canvasToBlob(canvas: HTMLCanvasElement, contentType: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('image_encode_failed'))
    }, contentType, quality)
  })
}

// 以 document 物件本身當 cache key（而非單一全域變數），單一分頁內是同一顆 document 天然只探測一次；
// 測試裡替換 globalThis.document 模擬不同瀏覽器時，也會各自拿到獨立的探測結果。
const webpEncodeSupportByDocument = new WeakMap<object, Promise<boolean>>()

/** 部分瀏覽器（如較舊的 Safari）不支援把 canvas 編碼成 WebP，會悄悄退回 PNG；此結果與檔案上限、Storage 允許的 mime type 都不合，之前造成照片永遠上傳失敗且訊息看不出原因。先探測一次並快取，避免每張照片都重新試探。 */
export async function detectWebpEncodeSupport(): Promise<boolean> {
  const cached = webpEncodeSupportByDocument.get(document)
  if (cached) return cached
  const detection = (async () => {
    try {
      const canvas = document.createElement('canvas')
      canvas.width = 1
      canvas.height = 1
      const blob = await canvasToBlob(canvas, WEBP_CONTENT_TYPE, 0.8)
      return blob.type === WEBP_CONTENT_TYPE
    } catch {
      return false
    }
  })()
  webpEncodeSupportByDocument.set(document, detection)
  return detection
}

export async function renderCompressedImage(source: CanvasImageSource, sourceWidth: number, sourceHeight: number, maxDimension: number, maxBytes: number, initialQuality: number, contentType: string) {
  const sourceDimension = Math.max(sourceWidth, sourceHeight)
  let dimension = Math.min(maxDimension, sourceDimension)
  const qualities = [initialQuality, 0.72, 0.64, 0.56, 0.48]

  while (dimension >= 1) {
    const scale = Math.min(1, dimension / sourceDimension)
    const width = Math.max(1, Math.round(sourceWidth * scale))
    const height = Math.max(1, Math.round(sourceHeight * scale))
    for (const quality of qualities) {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('canvas_context_unavailable')
      // 重點是可辨識細節；先縮長邊，再降品質，避免直接用品質換取過度模糊的影像。
      context.drawImage(source, 0, 0, width, height)
      const blob = await canvasToBlob(canvas, contentType, quality)
      // 瀏覽器不支援要求的格式時，toBlob 會悄悄退回其他格式而不是報錯；必須自行核對才抓得到。
      if (blob.type !== contentType) throw new Error('image_encode_type_mismatch')
      if (blob.size <= maxBytes) return blob
    }

    // 固定品質嘗試仍可能超過上限；繼續縮小畫布，不能把超標 Blob 交給上傳層才失敗。
    if (dimension === 1) break
    dimension = Math.max(1, Math.floor(dimension * 0.85))
  }

  throw new Error('photo_size_limit_exceeded')
}

/*
檔案用途：處理照護大事記照片的瀏覽器壓縮、Storage path 與 signed URL。
所在層：src/lib；作為 CareTimeline UI 與 Supabase Storage 之間的薄轉接層。
主要關聯：CareTimeline、care_timeline_entries.photo_paths 與 private Storage bucket。
prepareSingleCompressedImage 是從既有壓縮流程抽出的單張圖片版本，也供
MedicationPhotoOcrSection（藥袋 OCR）重用，避免另外寫一份壓縮邏輯；
它產生的 Blob 不會被存進這裡的任何 bucket，上傳目的地由呼叫端決定。
*/
import { supabase } from './supabase'
import { decodeImage, detectWebpEncodeSupport, IMAGE_CONTENT_TYPE_BY_EXTENSION, renderCompressedImage, type ImageExtension } from './imageCompression'
import { randomId } from './randomId'
import type { CareEventPhotoAttachment, StoredCareEventPhoto } from '../types/database'

export const CARE_EVENT_PHOTO_BUCKET = 'care-event-photos'
export const CARE_EVENT_PHOTO_LIMIT = 4
export const CARE_EVENT_PHOTO_MAX_DIMENSION = 1800
export const CARE_EVENT_PHOTO_THUMBNAIL_DIMENSION = 480
const CARE_EVENT_PHOTO_MAX_BYTES = 600 * 1024
const CARE_EVENT_PHOTO_THUMBNAIL_MAX_BYTES = 120 * 1024
export type CareEventPhotoExtension = ImageExtension

export type { CareEventPhotoAttachment, StoredCareEventPhoto } from '../types/database'

export interface PreparedCareEventPhoto {
  original: Blob
  thumbnail: Blob
  extension: CareEventPhotoExtension
  contentType: string
}
export function createCareTimelineEntryId() {
  return randomId()
}

export function buildCareEventPhotoPaths(patientId: string, eventId: string, photoId = randomId(), extension: CareEventPhotoExtension = 'webp'): StoredCareEventPhoto {
  const base = `patients/${patientId}/events/${eventId}/${photoId}`
  return { path: `${base}.${extension}`, thumbnail_path: `${base}-thumb.${extension}` }
}

function isSafeStoredPhotoPath(value: unknown): value is string {
  return typeof value === 'string'
    && value.startsWith('patients/')
    && !value.includes('..')
    && !value.includes('//')
    && (value.endsWith('.webp') || value.endsWith('.jpg'))
}

/** 將 JSONB 舊資料與目前物件格式統一；壞 path 直接丟掉，避免 UI 嘗試簽署任意外部路徑。 */
export function normalizeCareEventPhotoPaths(value: unknown, preserveSignedUrls = false): CareEventPhotoAttachment[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, CARE_EVENT_PHOTO_LIMIT).flatMap(item => {
    if (typeof item === 'string') {
      return isSafeStoredPhotoPath(item) ? [{ path: item, thumbnail_path: item }] : []
    }
    if (!item || typeof item !== 'object') return []
    const candidate = item as Record<string, unknown>
    const path = candidate.path
    const thumbnailPath = candidate.thumbnail_path ?? candidate.thumbnailPath ?? path
    if (!isSafeStoredPhotoPath(path) || !isSafeStoredPhotoPath(thumbnailPath)) return []
    const thumbnailUrl = preserveSignedUrls && typeof candidate.thumbnailUrl === 'string' ? candidate.thumbnailUrl : undefined
    return [{ path, thumbnail_path: thumbnailPath, ...(thumbnailUrl ? { thumbnailUrl } : {}) }]
  })
}

export function serializeCareEventPhotoPaths(photos: CareEventPhotoAttachment[]): StoredCareEventPhoto[] {
  return normalizeCareEventPhotoPaths(photos).map(({ path, thumbnail_path }) => ({ path, thumbnail_path }))
}

/** 只壓一張圖、不產生縮圖；給不需要縮圖、也不進 care-event-photos bucket 的呼叫端使用。 */
export async function prepareSingleCompressedImage(file: File, maxDimension: number, maxBytes: number): Promise<{ blob: Blob; contentType: string }> {
  if (!file.type.startsWith('image/')) throw new Error('photo_type_not_supported')
  const decoded = await decodeImage(file)
  try {
    const extension: CareEventPhotoExtension = await detectWebpEncodeSupport() ? 'webp' : 'jpg'
    const contentType = IMAGE_CONTENT_TYPE_BY_EXTENSION[extension]
    const blob = await renderCompressedImage(decoded.source, decoded.width, decoded.height, maxDimension, maxBytes, 0.78, contentType)
    return { blob, contentType }
  } finally {
    decoded.cleanup()
  }
}

export async function prepareCareEventPhoto(file: File): Promise<PreparedCareEventPhoto> {
  if (!file.type.startsWith('image/')) throw new Error('photo_type_not_supported')
  const decoded = await decodeImage(file)
  try {
    const extension: CareEventPhotoExtension = await detectWebpEncodeSupport() ? 'webp' : 'jpg'
    const contentType = IMAGE_CONTENT_TYPE_BY_EXTENSION[extension]
    const [original, thumbnail] = await Promise.all([
      renderCompressedImage(decoded.source, decoded.width, decoded.height, CARE_EVENT_PHOTO_MAX_DIMENSION, CARE_EVENT_PHOTO_MAX_BYTES, 0.78, contentType),
      renderCompressedImage(decoded.source, decoded.width, decoded.height, CARE_EVENT_PHOTO_THUMBNAIL_DIMENSION, CARE_EVENT_PHOTO_THUMBNAIL_MAX_BYTES, 0.72, contentType),
    ])
    return { original, thumbnail, extension, contentType }
  } finally {
    decoded.cleanup()
  }
}

export async function uploadCareEventPhotos(patientId: string, eventId: string, files: File[]): Promise<StoredCareEventPhoto[]> {
  if (files.length === 0) return []
  if (files.length > CARE_EVENT_PHOTO_LIMIT) throw new Error('photo_limit_exceeded')

  const uploadedPaths: string[] = []
  const storedPhotos: StoredCareEventPhoto[] = []
  try {
    for (const file of files) {
      const prepared = await prepareCareEventPhoto(file)
      const paths = buildCareEventPhotoPaths(patientId, eventId, undefined, prepared.extension)

      // 原圖與縮圖共用同一個 photo id，之後可藉 path 成對清理，不必再靠資料庫猜檔名。
      uploadedPaths.push(paths.path)
      const originalUpload = await supabase.storage.from(CARE_EVENT_PHOTO_BUCKET).upload(paths.path, prepared.original, { contentType: prepared.contentType, cacheControl: '3600', upsert: false })
      if (originalUpload.error) throw originalUpload.error

      uploadedPaths.push(paths.thumbnail_path)
      const thumbnailUpload = await supabase.storage.from(CARE_EVENT_PHOTO_BUCKET).upload(paths.thumbnail_path, prepared.thumbnail, { contentType: prepared.contentType, cacheControl: '3600', upsert: false })
      if (thumbnailUpload.error) throw thumbnailUpload.error
      storedPhotos.push(paths)
    }
    return storedPhotos
  } catch (error) {
    // Storage 沒有和資料表共用 transaction；失敗時盡力刪除本次已上傳檔案，避免留下孤兒照片。
    try {
      await removeCareEventPhotoPaths(uploadedPaths)
    } catch (cleanupError) {
      console.error('[care event photo cleanup error]', cleanupError)
    }
    throw error
  }
}

export async function removeCareEventPhotoPaths(paths: string[]) {
  const safePaths = paths.filter(isSafeStoredPhotoPath)
  if (safePaths.length === 0) return
  const { error } = await supabase.storage.from(CARE_EVENT_PHOTO_BUCKET).remove(safePaths)
  if (error) throw error
}

export async function signCareEventPhotoPaths(paths: string[], expiresInSeconds = 3600): Promise<Record<string, string>> {
  const safePaths = [...new Set(paths.filter(isSafeStoredPhotoPath))]
  if (safePaths.length === 0) return {}
  const { data, error } = await supabase.storage.from(CARE_EVENT_PHOTO_BUCKET).createSignedUrls(safePaths, expiresInSeconds)
  if (error) throw error
  return Object.fromEntries((data ?? []).flatMap(item => item.signedUrl ? [[item.path, item.signedUrl] as const] : []))
}

async function signCareEventPhotoPath(path: string, expiresInSeconds: number): Promise<Record<string, string>> {
  if (!isSafeStoredPhotoPath(path)) return {}
  // 新上傳的第一張照片若尚未被批次 endpoint 正確回傳，單檔 endpoint 能直接取得該物件的 signed URL。
  const { data, error } = await supabase.storage.from(CARE_EVENT_PHOTO_BUCKET).createSignedUrl(path, expiresInSeconds)
  if (error) throw error
  return data?.signedUrl ? { [path]: data.signedUrl } : {}
}

export async function signCareEventPhotoPathsBestEffort(paths: string[], expiresInSeconds = 3600): Promise<Record<string, string>> {
  const safePaths = [...new Set(paths.filter(isSafeStoredPhotoPath))]
  if (safePaths.length === 0) return {}
  // 單張照片通常就是剛上傳的第一張；直接走單檔 endpoint，避開批次 API 的回應延遲或缺項。
  if (safePaths.length === 1) return signCareEventPhotoPath(safePaths[0], expiresInSeconds)

  let batchUrls: Record<string, string> = {}
  let batchError: unknown = null
  try {
    batchUrls = await signCareEventPhotoPaths(safePaths, expiresInSeconds)
  } catch (error) {
    batchError = error
  }

  const missingPaths = safePaths.filter(path => !batchUrls[path])
  if (missingPaths.length === 0) return batchUrls

  // 批次回應可能只遺漏剛上傳或已失效的部分；逐張改用單檔 API，避免一張壞 path 讓第一張新照片也沒有 URL。
  const recovered = await Promise.all(missingPaths.map(async path => {
    try {
      return await signCareEventPhotoPath(path, expiresInSeconds)
    } catch {
      return {}
    }
  }))
  const urls = Object.assign({}, batchUrls, ...recovered)
  // 網路或 session 整體失效時保留批次錯誤，讓呼叫端顯示一般失敗狀態，不把空結果誤當成「沒有照片」。
  if (Object.keys(urls).length === 0 && batchError) throw batchError
  return urls
}

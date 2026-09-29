/*
檔案用途：處理藥品外觀照片的瀏覽器壓縮、上傳與簽名網址，取代原本要求手動貼 HTTPS 網址的做法。
所在層：src/lib；作為 MedicationAdminSection 表單與 Supabase Storage 之間的薄轉接層。
主要關聯：MedicationAdminSection、medications.appearance_photo_url 與 private Storage bucket。
*/
import { supabase } from '../supabase'
import { decodeImage, detectWebpEncodeSupport, IMAGE_CONTENT_TYPE_BY_EXTENSION, renderCompressedImage } from '../imageCompression'
import { randomId } from '../randomId'

export const MEDICATION_APPEARANCE_PHOTO_BUCKET = 'medication-appearance-photos'
// bucket 是 private；appearance_photo_url 只存 bucket 內的 bare path，渲染前一律要向 Storage 換一次簽名網址，
// 沿用既有 appearance_photo_url 欄位，只是驗證規則從 https:// 改成這個 path 格式（見對應 migration）。
const MEDICATION_APPEARANCE_PHOTO_MAX_DIMENSION = 1200
const MEDICATION_APPEARANCE_PHOTO_MAX_BYTES = 500 * 1024
const MEDICATION_APPEARANCE_PHOTO_PATH_PATTERN = /^photos\/[^/]+\.(webp|jpg)$/
const MEDICATION_APPEARANCE_PHOTO_PUBLIC_URL_PATTERN = /\/storage\/v1\/object\/public\/medication-appearance-photos\/(.+)$/

/** 判斷欄位值是不是我們自己上傳產生的 bucket path；官方 TFDA 圖片存的是完整 https:// 網址，不會符合這個格式。 */
export function isMedicationAppearancePhotoPath(value: string): boolean {
  return MEDICATION_APPEARANCE_PHOTO_PATH_PATTERN.test(value) && !value.includes('..') && !value.includes('//')
}

/**
 * 從 bare path 或（rollout 過渡期間舊版前端仍可能寫入的）完整 public URL 找出可簽名的 path。
 * bucket 改成 private 後，還沒更新到新版的舊前端仍會呼叫 getPublicUrl() 存回完整網址；
 * 讀取路徑也認得出來，才不會讓那段過渡期間上傳的照片變成孤兒連結。
 */
export function extractMedicationAppearancePhotoStoragePath(value: string): string | null {
  if (isMedicationAppearancePhotoPath(value)) return value

  const match = value.match(MEDICATION_APPEARANCE_PHOTO_PUBLIC_URL_PATTERN)
  if (!match) return null
  try {
    const path = decodeURIComponent(match[1])
    return isMedicationAppearancePhotoPath(path) ? path : null
  } catch {
    return null
  }
}

/** 藥品照片只有一張、也沒有時段/病人邊界，用隨機 id 命名即可，不必比照照護大事記把病人與事件 id 編進路徑。 */
export async function uploadMedicationAppearancePhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('photo_type_not_supported')
  const decoded = await decodeImage(file)
  let blob: Blob
  let extension: 'webp' | 'jpg'
  let contentType: string
  try {
    extension = await detectWebpEncodeSupport() ? 'webp' : 'jpg'
    contentType = IMAGE_CONTENT_TYPE_BY_EXTENSION[extension]
    blob = await renderCompressedImage(decoded.source, decoded.width, decoded.height, MEDICATION_APPEARANCE_PHOTO_MAX_DIMENSION, MEDICATION_APPEARANCE_PHOTO_MAX_BYTES, 0.78, contentType)
  } finally {
    decoded.cleanup()
  }

  const path = `photos/${randomId()}.${extension}`
  const { error } = await supabase.storage.from(MEDICATION_APPEARANCE_PHOTO_BUCKET).upload(path, blob, { contentType, cacheControl: '3600', upsert: false })
  if (error) throw error

  return path
}

/**
 * 私有 bucket 沒有公開網址；渲染前才換簽名網址，避免長期有效、任何人都能存取的連結。
 * 也接受 rollout 過渡期間舊前端寫入的完整 public URL（見 extractMedicationAppearancePhotoStoragePath）；
 * 都不是的壞值直接回傳 null，不呼叫 Storage API。
 */
export async function signMedicationAppearancePhotoPath(value: string, expiresInSeconds = 3600): Promise<string | null> {
  const path = extractMedicationAppearancePhotoStoragePath(value)
  if (!path) return null
  const { data, error } = await supabase.storage.from(MEDICATION_APPEARANCE_PHOTO_BUCKET).createSignedUrl(path, expiresInSeconds)
  if (error) throw error
  return data?.signedUrl ?? null
}

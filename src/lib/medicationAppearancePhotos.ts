/*
檔案用途：處理藥品外觀照片的瀏覽器壓縮與上傳，取代原本要求手動貼 HTTPS 網址的做法。
所在層：src/lib；作為 MedicationAdminSection 表單與 Supabase Storage 之間的薄轉接層。
主要關聯：MedicationAdminSection、medications.appearance_photo_url 與 public Storage bucket。
*/
import { supabase } from './supabase'
import { decodeImage, detectWebpEncodeSupport, IMAGE_CONTENT_TYPE_BY_EXTENSION, renderCompressedImage } from './imageCompression'
import { randomId } from './randomId'

export const MEDICATION_APPEARANCE_PHOTO_BUCKET = 'medication-appearance-photos'
// 藥品外觀是全體照護者共用的目錄資料（不是私人病歷），與照護大事記的私有照片不同，這個 bucket 明確是公開讀取，
// 上傳成功後直接存公開網址即可，沿用既有的 appearance_photo_url 欄位與 https:// 驗證規則。
const MEDICATION_APPEARANCE_PHOTO_MAX_DIMENSION = 1200
const MEDICATION_APPEARANCE_PHOTO_MAX_BYTES = 500 * 1024

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

  const { data } = supabase.storage.from(MEDICATION_APPEARANCE_PHOTO_BUCKET).getPublicUrl(path)
  return data.publicUrl
}

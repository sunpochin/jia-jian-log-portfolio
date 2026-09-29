/*
檔案用途：讓 /demo 事件照片上傳走本機 data URI，不打 Supabase Storage 或寫入正式 bucket。
所在層：src/lib；demoStorage 的照片專用轉接層，只服務展示模式，正式流程完全不會載入這個檔案。
主要關聯：CareTimeline（isDemoPatientId 分支呼叫）、careEventPhotos 既有的單張圖片壓縮流程
（重用 prepareSingleCompressedImage，不重寫一份解碼／縮放邏輯）、demoStorage（實際存放結果）。
*/
import { CARE_EVENT_PHOTO_LIMIT, prepareSingleCompressedImage } from './careEventPhotos'

// 這兩個檔案上限刻意比正式 Storage 的縮圖預算（120KB）更小：展示資料整包塞在 localStorage，
// 同一個瀏覽器裡還有血壓、藥單等其他試用資料共用同一份容量，4 張照片就可能吃掉可觀的空間。
// 展示模式不需要真的保留「縮圖／原圖」兩種解析度，這裡只產生一種，同時當縮圖與原圖使用。
const DEMO_PHOTO_MAX_DIMENSION = 480
const DEMO_PHOTO_MAX_BYTES = 100 * 1024

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('demo_photo_read_error'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(blob)
  })
}

/**
 * 把使用者在展示模式選取的照片壓成小尺寸 data URI，直接可以當 <img src> 使用，
 * 不經過任何網路請求。呼叫端負責把回傳的網址存進 demoStorage 的 careTimelineEntries。
 */
export async function prepareDemoCareEventPhotoUrls(files: File[]): Promise<string[]> {
  if (files.length === 0) return []
  if (files.length > CARE_EVENT_PHOTO_LIMIT) throw new Error('photo_limit_exceeded')
  const urls: string[] = []
  for (const file of files) {
    // 刻意逐一等待而非 Promise.all：手機瀏覽器同時解碼多張大圖容易撞到記憶體上限，
    // 展示模式每次最多 4 張，循序處理的延遲可以接受。
    const { blob } = await prepareSingleCompressedImage(file, DEMO_PHOTO_MAX_DIMENSION, DEMO_PHOTO_MAX_BYTES)
    urls.push(await blobToDataUri(blob))
  }
  return urls
}

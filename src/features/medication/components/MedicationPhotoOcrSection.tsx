/*
檔案用途：拍藥袋照片 → 呼叫 medication-ocr Edge Function → 列出候選品名，供照護者挑一個
帶進既有的「加入或調整藥品」搜尋流程；本身不寫入任何藥單資料。
所在層：src/features/medication/components；掛在 MedicationAdminSection 上方，只負責預填搜尋字。
主要關聯：supabase/functions/medication-ocr、lib/careEventPhotos.ts 的 prepareSingleCompressedImage、
MedicationAdminSection 的 externalCatalogQuery/onExternalCatalogQueryConsumed。
*/
import { useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { prepareSingleCompressedImage } from '../../../lib/careEventPhotos'
import { type LocalizedText, useI18n } from '../../../lib/i18n'

// 跟 care_event_photos 用同一組壓縮預算，不需要縮圖，因為這張照片辨識完就丟，不會被瀏覽。
const OCR_PHOTO_MAX_DIMENSION = 1800
const OCR_PHOTO_MAX_BYTES = 600 * 1024

interface OcrCandidate {
  sourceLine: string
  nameGuess: string
  doseGuess?: string
  frequencyGuess?: string
  matches: Array<{ source: 'tfda' | 'nhi_tcm' | 'moa_animal'; id: string; nameZh: string }>
}

// 為什麼三種語言要在同一個物件補齊：OCR 可能在按鈕、錯誤與空結果路徑出現，不能讓切換語言後漏出另一語言或空白。
const ERROR_MESSAGES: Record<string, LocalizedText> = {
  ocr_not_configured: { id: 'Pemindaian belum aktif, silakan gunakan input manual.', zh: 'OCR 尚未開通，請改用手動輸入。', en: 'Scanning is not enabled yet. Please enter the medicine manually.' },
  daily_medication_ocr_limit: { id: 'Batas pemindaian hari ini sudah tercapai, silakan gunakan input manual.', zh: '今天的辨識次數已用完，請改用手動輸入。', en: 'Today’s scan limit has been reached. Please enter the medicine manually.' },
  'not authorized for this patient': { id: 'Anda tidak berwenang mengelola obat untuk orang ini.', zh: '您沒有權限為這位病人管理藥單。', en: 'You are not authorized to manage medicines for this patient.' },
}

export function MedicationPhotoOcrSection({ patientId, onPickCandidate }: { patientId: string; onPickCandidate: (nameGuess: string) => void }) {
  const { text } = useI18n()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [candidates, setCandidates] = useState<OcrCandidate[] | null>(null)
  const [error, setError] = useState<LocalizedText | null>(null)

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setIsProcessing(true)
    setError(null)
    setCandidates(null)
    try {
      const { blob, contentType } = await prepareSingleCompressedImage(file, OCR_PHOTO_MAX_DIMENSION, OCR_PHOTO_MAX_BYTES)
      const { data, error: invokeError } = await supabase.functions.invoke('medication-ocr', {
        body: blob,
        headers: { 'x-patient-id': patientId, 'content-type': contentType },
      })
      if (invokeError) {
        // 為什麼要試著解析回應內容：Edge Function 回傳 4xx/5xx 時 supabase-js 只給我們一個泛用錯誤物件，
        // 真正的錯誤代碼與雙語訊息在 response body 裡，要自己再讀一次才拿得到。
        const context = (invokeError as { context?: Response }).context
        const body = context ? await context.json().catch(() => null) : null
        const code = body?.error as string | undefined
        throw new Error(code ?? 'medication_ocr_failed')
      }
      setCandidates((data?.items ?? []) as OcrCandidate[])
    } catch (cause) {
      console.error('[medication ocr error]', cause)
      const code = cause instanceof Error ? cause.message : 'medication_ocr_failed'
      setError(ERROR_MESSAGES[code] ?? { id: 'Pemindaian gagal, silakan gunakan input manual.', zh: '辨識失敗，請改用手動輸入。', en: 'Scanning failed. Please enter the medicine manually.' })
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <section className="mb-4 space-y-3 rounded-3xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm">
      <div>
        <h2 className="text-lg font-black text-indigo-950">{text({ id: 'Pindai kemasan obat (percobaan)', zh: '拍藥袋辨識（實驗功能）', en: 'Scan medicine package (experimental)' })}</h2>
        <p className="mt-1 text-sm leading-6 text-indigo-900">{text({ id: 'Ambil foto kemasan obat untuk mendapatkan saran nama obat. Hasilnya tetap harus Anda periksa dan pilih sendiri di bawah — tidak langsung disimpan.', zh: '拍藥袋照片可以幫忙猜品名；結果仍需您在下方親自核對與選擇，不會自動存檔。', en: 'Take a photo of the medicine package to get name suggestions. You must review and choose a result below; nothing is saved automatically.' })}</p>
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={event => void handleFileChange(event)} />
      <button type="button" disabled={isProcessing} onClick={() => fileInputRef.current?.click()} className="min-h-11 rounded-xl border border-indigo-700 bg-white px-4 py-2 font-bold text-indigo-800 transition-colors hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 disabled:opacity-50">
        {isProcessing ? text({ id: 'Sedang memindai…', zh: '辨識中…', en: 'Scanning…' }) : text({ id: '📷 Pindai kemasan obat', zh: '📷 拍藥袋', en: '📷 Scan medicine package' })}
      </button>
      {error && <div role="alert" className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">
        {text(error)}
      </div>}
      {candidates && candidates.length === 0 && <p role="status" className="rounded-xl border border-dashed border-indigo-300 bg-white p-3 text-xs text-indigo-900">{text({ id: 'Tidak ada teks yang bisa dikenali. Silakan gunakan input manual.', zh: '沒有辨識出可用的文字，請改用手動輸入。', en: 'No readable text was found. Please enter the medicine manually.' })}</p>}
      {candidates && candidates.length > 0 && <div className="space-y-2">
        <p className="text-xs font-bold text-indigo-900">{text({ id: 'Pilih salah satu untuk mencari di daftar obat di bawah:', zh: '選一個帶入下方藥品搜尋：', en: 'Choose one to search the medicine list below:' })}</p>
        {candidates.map((candidate, index) => <button
          key={`${candidate.sourceLine}-${index}`}
          type="button"
          onClick={() => onPickCandidate(candidate.nameGuess)}
          className="block w-full min-h-11 rounded-xl border border-indigo-200 bg-white p-3 text-left text-xs text-indigo-950 transition-colors hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2"
        >
          <b>{candidate.nameGuess}</b>
          {(candidate.doseGuess || candidate.frequencyGuess) && <span className="ml-2 text-indigo-700">{[candidate.doseGuess, candidate.frequencyGuess].filter(Boolean).join(' · ')}</span>}
          {candidate.matches.length > 0 && <p className="mt-1 text-emerald-800">{text({ id: 'Kemungkinan cocok: ', zh: '可能符合：', en: 'Possible matches: ' })}{candidate.matches.map(match => match.nameZh).join('、')}</p>}
        </button>)}
      </div>}
    </section>
  )
}

/*
檔案用途：點擊「本週藥單」單一藥品時彈出的詳情視窗，集中呈現目前系統已確認的藥品資料（外觀、劑量、主要功能、官方許可證字號）。
所在層：src/features/medication/components；由 MedicationPage 的每週藥單分頁呼叫。
主要關聯：讀取 MedicationPlanView（lib/medications），外觀呈現沿用 MedicationAppearance，避免另外重寫色塊／照片邏輯。
*/
import { useEffect, useRef } from 'react'
import type { MedicationPlanView } from '../../../lib/medications'
import { formatDoseAmountLocalized, formatMedicationLabel } from '../../../lib/medications'
import { medicationSlotText } from '../../../lib/medicationSchedule'
import type { Locale } from '../../../lib/i18n'
import { useI18n } from '../../../lib/i18n'
import { MedicationAppearance } from './MedicationAppearance'
import { MedicationNameHeading } from './MedicationNameHeading'

// 官方查詢系統只是一般搜尋入口，不支援用許可證字號直接帶出單一藥品頁，因此把字號印出來讓照護者自己貼上查詢，
// 不假裝這是能直接連到那顆藥仿單的深連結。
const TFDA_LICENSE_QUERY_URL = 'https://info.fda.gov.tw/MLMS/H0001.aspx'

// 只帶查詢關鍵字，不能照抄使用者自己瀏覽器產生的搜尋網址——那種網址常帶 rlz／oq／gs_lcrp 等個人帳號與
// session 追蹤參數，寫進程式碼等於把別人的個資到處散布。英文商品名（brand_name）是包裝上最先認得出的字，
// 搜尋這個名字＋「仿單」比搜中文譯名更容易先命中官方或藥廠頁面。
const buildDrugSearchUrl = (brandName: string) => `https://www.google.com/search?q=${encodeURIComponent(`${brandName} 仿單`)}`

export function MedicationDetailDialog({ plan, locale, nameEnglishFirst, onClose }: {
  plan: MedicationPlanView | null
  locale: Locale
  nameEnglishFirst: boolean
  onClose: () => void
}) {
  const { text } = useI18n()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (plan) {
      if (!dialog.open) dialog.showModal()
      closeButtonRef.current?.focus()
    } else if (dialog.open) {
      dialog.close()
    }
  }, [plan])

  const medication = plan?.medication
  // 適應症／副作用／衛教屬於未來才會逐步人工補齊的欄位；資料庫尚未有這些欄位前一律不顯示，
  // 避免用還沒做的功能誤導照護者以為系統已經有藥師核對過的內容。
  const verification = medication?.verification_status === 'official'
    ? text({ id: 'Data resmi terverifikasi', zh: '官方已驗證資料' ,en: "Data official terverifikasi" })
    : medication?.verification_status === 'manually_verified'
      ? text({ id: 'Sudah diperiksa manual', zh: '已人工核對' ,en: "Already diperiksa manual" })
      : text({ id: '⚠ Belum diverifikasi', zh: '⚠ 未驗證' ,en: "⚠ Not yet diverifikasi" })

  return (
    <dialog
      ref={dialogRef}
      onCancel={event => {
        event.preventDefault()
        onClose()
      }}
      onClick={event => {
        // 點背景（dialog 本身的 padding 區）等同關閉，跟其餘照護對話框的手感一致。
        if (event.target === dialogRef.current) onClose()
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-3xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/55"
      aria-labelledby="medication-detail-title"
    >
      {plan && medication && <div className="max-h-[85vh] overflow-y-auto p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 id="medication-detail-title" className="sr-only">{text({ id: 'Detail obat', zh: '藥品詳情' ,en: "Detail medication" })}</h2>
          <MedicationNameHeading medication={medication} locale={locale} englishFirst={nameEnglishFirst} size="lg" />
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={text({ id: 'Tutup', zh: '關閉' ,en: "Close" })}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xl font-black text-slate-600 active:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2"
          >
            ×
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <MedicationAppearance medication={medication} showAppearanceNote showCategory={false} />
        </div>

        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex items-start justify-between gap-3">
            <dt className="font-bold text-slate-500">{text({ id: 'Dosis & waktu', zh: '劑量與時段' ,en: "Dose & time" })}</dt>
            <dd className="text-right font-semibold text-slate-800">
              {formatMedicationLabel(medication.brand_name, medication.strength_mg, medication.strength_label)}
              <br />
              {formatDoseAmountLocalized(plan.dose_amount, medication.dosage_form, locale)}
              {plan.dose_count > 1 ? ` · ${text({ id: `${plan.dose_count} pil setiap kali`, zh: `每次 ${plan.dose_count} 顆` ,en: `${plan.dose_count} pil each kali` })}` : ''}
              {' · '}
              {plan.as_needed ? text({ id: 'Bila perlu (PRN)', zh: '需要時服用（PRN）' ,en: "Bila perlu (PRN)" }) : text(medicationSlotText(plan.schedule_slot))}
            </dd>
          </div>
          <div className="flex items-start justify-between gap-3">
            <dt className="font-bold text-slate-500">{text({ id: 'Nama generik', zh: '學名成分' ,en: "Name generik" })}</dt>
            <dd className="text-right font-semibold text-slate-800">{medication.generic_name}</dd>
          </div>
          <div className="flex items-start justify-between gap-3">
            <dt className="font-bold text-slate-500">{text({ id: 'Status data', zh: '資料狀態' ,en: "Status data" })}</dt>
            <dd className={`text-right font-semibold ${medication.verification_status === 'unverified' ? 'text-amber-700' : 'text-emerald-700'}`}>{verification}</dd>
          </div>
          {medication.tfda_license_number && <div className="flex items-start justify-between gap-3">
            <dt className="font-bold text-slate-500">{text({ id: 'No. izin edar TFDA', zh: 'TFDA 許可證字號' ,en: "No. izin edar TFDA" })}</dt>
            <dd className="text-right font-semibold tabular-nums text-slate-800 select-all">{medication.tfda_license_number}</dd>
          </div>}
        </dl>

        {/* 用途、副作用、相關衛教是照護者最常在藥袋／出院衛教單上看到的內容；TFDA 公開資料集（藥證主檔、外觀、ATC 分類）
            都不包含這類完整衛教文字，貿然用 AI 生成或網路爬來的內容顯示，等於把沒藥師核對過的用藥資訊當成事實呈現給照護者，
            風險比「暫時沒有這項資訊」更高。這裡明講目前沒有，並提供官方查詢入口讓照護者自己核對仿單，而不是編造內容。 */}
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-bold text-amber-900">{text({ id: 'Kegunaan, efek samping, dan edukasi pasien', zh: '用途、副作用與相關衛教' ,en: "Kegunaan, efek samping, and edukasi pasien" })}</p>
          <p className="mt-1.5 text-sm font-medium leading-6 text-amber-900">
            {text({
              id: 'Sistem ini belum memiliki informasi tersebut yang sudah diperiksa apoteker. Data resmi TFDA saat ini hanya mencakup nama, kekuatan, bentuk, dan penampilan obat — bukan teks edukasi lengkap.',
              zh: '目前系統還沒有經藥師核對過的用途／副作用／衛教說明。TFDA 公開資料只涵蓋藥名、劑量、劑型與外觀，並不包含完整衛教文字，因此這裡不顯示未經核對的內容，避免誤導。', en: "Sistem this not yet memiliki informasi tersebut that already diperiksa apotetor. Data official TFDA when this only mencakup name, tokuatan, shape, and penampilan medication — bukan teks edukasi lengkap.",
            })}
          </p>
          <p className="mt-2 text-sm font-medium leading-6 text-amber-900">
            {text({
              id: 'Untuk info lengkap, periksa selebaran obat dari apotek, tanya apoteker, atau cari nomor izin edar di sistem resmi TFDA di bawah.',
              zh: '如需完整資訊，請直接查看藥袋附的仿單、詢問藥師，或用上方許可證字號到下方官方系統查詢。', en: "Untuk info lengkap, periksa selebaran medication from apotek, tanya apotetor, or cari nomor izin edar in sistem official TFDA in bawah.",
            })}
          </p>
          <div className="mt-3 flex flex-col items-start gap-2">
            {medication.tfda_license_number && <a
              href={TFDA_LICENSE_QUERY_URL}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-black text-amber-900 underline underline-offset-2"
            >
              {text({ id: 'Buka sistem pencarian izin edar TFDA ↗', zh: '前往 TFDA 許可證查詢系統 ↗' ,en: "Open sistem pencarian izin edar TFDA ↗" })}
            </a>}
            {/* Google 搜尋不是官方資料來源，搜尋結果品質不受我們控制，只當作「還有其他管道可以查」的備援連結。 */}
            <a
              href={buildDrugSearchUrl(medication.brand_name)}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-black text-amber-900 underline underline-offset-2"
            >
              {text({ id: `Cari "${medication.brand_name} 仿單" di Google ↗`, zh: `用 Google 搜尋「${medication.brand_name} 仿單」↗` ,en: `Cari "${medication.brand_name} 仿單" in Google ↗` })}
            </a>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 min-h-12 w-full rounded-2xl bg-slate-800 px-4 text-base font-black text-white shadow-sm active:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2"
        >
          {text({ id: 'Tutup', zh: '關閉' ,en: "Close" })}
        </button>
      </div>}
    </dialog>
  )
}

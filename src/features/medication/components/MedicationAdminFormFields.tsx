/*
檔案用途：MedicationAdminSection 拆分後，ExistingPlanForm 與 NewMedicationForm 共用的純展示元件。
所在層：src/features/medication/components；不持有狀態，全部透過 props 接收資料與 callback。
主要關聯：由 ExistingPlanForm.tsx、NewMedicationForm.tsx 匯入；資料型別來自 lib/medicationAdmin、lib/medicationCatalog。
*/
import { useRef, useState } from 'react'
import type { MedicationOption } from '../../../lib/medicationAdmin'
import type { MedicationCatalogResult } from '../../../lib/medicationCatalog'
import { doseAmountFieldLabel, formatMedicationLabel } from '../../../lib/medications'
import { MEDICATION_SLOTS, medicationSlotText } from '../../../lib/medicationSchedule'
import { type LocalizedText, useI18n } from '../../../lib/i18n'
import { uploadMedicationAppearancePhoto } from '../../../lib/medicationAppearancePhotos'
import { MedicationAppearance } from './MedicationAppearance'

const DOSE_STEP = 0.5
const MAX_DOSE_AMOUNT = 9
const DOSE_OPTIONS = Array.from({ length: MAX_DOSE_AMOUNT / DOSE_STEP }, (_, index) => (index + 1) * DOSE_STEP)

export function doseOptionLabel(amount: number) {
  return amount % 1 === 0.5 ? `${Math.floor(amount) || ''}½` : String(amount)
}

export function AppearancePhotoField({ value, onChange, disabled }: { value: string; onChange: (url: string) => void; disabled: boolean }) {
  const { text } = useI18n()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<LocalizedText | null>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const libraryInputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      onChange(await uploadMedicationAppearancePhoto(file))
    } catch (uploadError) {
      console.error('[medication appearance photo upload error]', uploadError)
      setError({ id: 'Foto gagal diunggah. Periksa internet lalu coba lagi.', zh: '照片上傳失敗，請確認網路後再試。' ,en: "Photo failed diunggah. Check your internet connection and try again." })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="col-span-2">
      <p className="block text-xs font-bold text-emerald-900">{text({ id: 'Foto asli obat ini (opsional)', zh: '實拍照片（可不填）' ,en: "Photo original medication this (opsional)" })}</p>
      {/* 為什麼要提醒：medication-appearance-photos 是全體使用者共用的公開 bucket（見該 migration 的 why-comment），
          這張照片不是私人病歷；拍藥袋時容易連藥局標籤一起入鏡，那上面通常有姓名、就診日期等個資，
          所以要在拍照前先讓使用者知道這張照片會公開，而不是事後才發現。 */}
      <p className="mt-1 text-[11px] leading-4 text-emerald-700">{text({ id: 'Foto ini akan menjadi gambar bersama untuk semua pengguna, jangan sertakan nama atau info rekam medis (mis. label apotek).', zh: '這張照片會成為所有使用者共用的藥品目錄圖，請避免拍到姓名或病歷資訊（例如藥局標籤）。' ,en: 'This photo becomes a shared image for all users; avoid capturing names or medical record info (e.g. pharmacy labels).' })}</p>
      {value && <img src={value} alt="" className="mt-2 h-20 w-20 rounded-lg border border-emerald-200 object-cover" />}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" disabled={disabled || uploading} onClick={() => cameraInputRef.current?.click()} className="min-h-11 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-bold text-emerald-800 disabled:opacity-50">📷 {text({ id: 'Ambil foto', zh: '拍照' ,en: "Ambil photo" })}</button>
        <button type="button" disabled={disabled || uploading} onClick={() => libraryInputRef.current?.click()} className="min-h-11 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-bold text-emerald-800 disabled:opacity-50">🖼️ {text({ id: 'Pilih dari galeri', zh: '從相簿選取' ,en: "Select from galeri" })}</button>
      </div>
      {/* iOS Safari 對同一個 input 同時使用 capture 與不加 capture 的行為不一致；拆成兩個入口才能明確保留拍照與相簿選取。 */}
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" disabled={disabled || uploading} onChange={handleFile} className="sr-only" />
      <input ref={libraryInputRef} type="file" accept="image/*" disabled={disabled || uploading} onChange={handleFile} className="sr-only" />
      {uploading && <p role="status" className="mt-1 text-xs font-semibold text-emerald-700">{text({ id: 'Sedang mengunggah foto…', zh: '照片上傳中…' ,en: "Seandg mengunggah photo…" })}</p>}
      {value && !uploading && <button type="button" onClick={() => onChange('')} className="mt-1 min-h-11 text-xs font-semibold text-red-700 underline">{text({ id: 'Hapus foto', zh: '移除照片' ,en: "Delete photo" })}</button>}
      {error && <p role="status" className="mt-1 text-xs font-semibold text-red-700">{text(error)}</p>}
    </div>
  )
}

export function MedicationChoice({ medication, selected, onSelect }: { medication: MedicationOption; selected: boolean; onSelect: () => void }) {
  const { text } = useI18n()
  const verification = medication.verification_status === 'official' ? text({ id: 'Data resmi', zh: '官方資料' ,en: 'Official' }) : medication.verification_status === 'manually_verified' ? text({ id: 'Sudah diperiksa manual', zh: '已人工核對' ,en: 'Manually checked' }) : text({ id: '⚠ Belum diverifikasi', zh: '⚠ 未驗證' ,en: 'Unverified' })
  const categoryLabel = medication.medication_category === 'animal'
    ? text({ id: 'Obat Hewan (Kementan)', zh: '🐾 動物用藥（農業部）' ,en: 'Medication Hewan (Kementan)' })
    : medication.medication_category === 'dual'
      ? text({ id: 'Penggunaan Manusia & Hewan', zh: '👩🐾 人寵共用' ,en: 'Penggunaan Manusia & Hewan' })
      : text({ id: 'Obat Manusia (TFDA)', zh: '👩 人類用藥（TFDA）' ,en: 'Medication Manusia (TFDA)' })

  // 顯示適用與禁用物種標籤；bird 不能退回 other，否則 Pickle 的藥品適用範圍會被誤讀。
  const speciesTags = (medication.applicable_species ?? ['human']).map(s => {
    if (s === 'dog') return text({ id: '🐶 Anjing', zh: '🐶 狗' ,en: '🐶 Dog' })
    if (s === 'cat') return text({ id: '🐱 Kucing', zh: '🐱 貓' ,en: '🐱 Cat' })
    if (s === 'bird') return text({ id: '🐦 Burung', zh: '🐦 鳥' ,en: "🐦 Bird" })
    if (s === 'rabbit') return text({ id: '🐰 Kelinci', zh: '🐰 兔' ,en: '🐰 Kelinci' })
    if (s === 'human') return text({ id: '👩 Manusia', zh: '👩 人' ,en: '👩 Manusia' })
    return text({ id: '🐾 Lainnya', zh: '🐾 其他' ,en: '🐾 Other' })
  }).join(' ')

  const contraTags = (medication.contraindicated_species ?? []).map(s => {
    if (s === 'cat') return text({ id: '🐱 Dilarang untuk Kucing', zh: '🐱 貓禁用' ,en: '🐱 Not allowed for Cat' })
    if (s === 'dog') return text({ id: '🐶 Dilarang untuk Anjing', zh: '🐶 狗禁用' ,en: '🐶 Not allowed for Dog' })
    if (s === 'bird') return text({ id: '🐦 Dilarang untuk Burung', zh: '🐦 鳥禁用' ,en: "🐦 Dilarang for Bird" })
    if (s === 'rabbit') return text({ id: '🐰 Dilarang untuk Kelinci', zh: '🐰 兔禁用' ,en: '🐰 Not allowed for Kelinci' })
    return text({ id: 'Dilarang', zh: '禁用' ,en: 'Not allowed' })
  }).join(' ')

  return <button type="button" aria-pressed={selected} onClick={onSelect} className={`min-h-11 break-all rounded-xl border p-3 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 ${selected ? 'border-emerald-700 bg-emerald-50 text-emerald-950' : 'border-emerald-200 text-gray-700'}`}>
    <div className="flex flex-wrap items-center justify-between gap-1">
      <b>{medication.brand_name_zh || text({ id: 'Nama merek Mandarin belum tercatat', zh: '中文商品名未登錄' ,en: 'Chinese trade name not logged in' })} · {formatMedicationLabel(medication.brand_name, medication.strength_mg, medication.strength_label)}</b>
      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-900">{categoryLabel}</span>
    </div>
    <p className="mt-0.5 text-gray-600">{medication.generic_name}</p>
    {medication.indications && <p className="mt-0.5 text-indigo-900 font-medium">{text({ id: 'Indikasi: ', zh: '適應症：' ,en: 'Indikasi:' })}{medication.indications}</p>}
    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-800">{speciesTags}</span>
      {contraTags && <span className="rounded bg-red-100 px-1.5 py-0.5 font-bold text-red-800">⚠️ {contraTags}</span>}
    </div>
    <div className="mt-1"><MedicationAppearance medication={medication} compact /></div>
    <span className={medication.verification_status === 'unverified' ? 'text-amber-800' : 'text-emerald-800'}>{verification}{medication.tfda_license_number ? ` · ${medication.tfda_license_number}` : ''}{medication.animal_drug_license_number ? ` · ${text({ id: 'Izin obat hewan: ', zh: '動物藥證: ' ,en: 'Pharmacopoeia:' })}${medication.animal_drug_license_number}` : ''}</span>
  </button>
}

export function RegistryMedicationChoice({ product, selected, onSelect }: { product: MedicationCatalogResult; selected: boolean; onSelect: () => void }) {
  const { text } = useI18n()
  
  let sourceLabel = { id: 'Katalog', zh: '藥品目錄' ,en: 'Katalog' }
  if (product.source === 'tfda') sourceLabel = { id: 'Katalog TFDA', zh: '西藥 (TFDA)' ,en: 'Katalog TFDA' }
  if (product.source === 'nhi_tcm') sourceLabel = { id: 'Katalog TCM', zh: '中藥 (健保)' ,en: 'Traditional Chinese medicine (health care)' }
  if (product.source === 'moa_animal') sourceLabel = { id: 'Katalog Hewan', zh: '動物用藥 (農業部)' ,en: 'Veterinary Medicine (Ministry of Agriculture)' }

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`min-h-11 break-all rounded-xl border p-3 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 ${
        selected ? 'border-emerald-700 bg-emerald-50 text-emerald-950' : 'border-emerald-200 text-gray-700'
      }`}
    >
      <div className="flex items-center justify-between gap-1">
        <b>{product.nameZh}</b>
        <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
          {text(sourceLabel)}
        </span>
      </div>
      {product.nameEn && <p className="mt-0.5 text-gray-600">{product.nameEn}</p>}
      {product.ingredient && <p className="mt-0.5 text-gray-500">{text({ id: 'Bahan: ', zh: '成分：' ,en: 'INGREDIENTS:' })}{product.ingredient}</p>}
      <span className="mt-1 block text-emerald-800">
        {product.sourceId} {product.manufacturer ? `· ${product.manufacturer}` : ''}
      </span>
    </button>
  )
}


export function PlanFields({ scheduleSlot, setScheduleSlot, doseAmount, setDoseAmount, asNeeded, setAsNeeded, occupiedSlots, dosageForm = 'tablet' }: { scheduleSlot: string; setScheduleSlot: (value: string) => void; doseAmount: string; setDoseAmount: (value: string) => void; asNeeded: boolean; setAsNeeded: (value: boolean) => void; occupiedSlots?: Set<string>; dosageForm?: string }) {
  // 調藥表單也跟著語系切換，避免照護者在同一時段名稱讀到兩種語言。
  const { text } = useI18n()
  // 舊資料與 PRN 可能存著 anytime／morning／after_meal 這類已不在選單裡的時段。少了這個選項，
  // 瀏覽器會顯示第一個選項（早餐前），但實際狀態仍是舊時段——照護者看到的和送出的會是兩回事。
  const legacySlot = MEDICATION_SLOTS.some(([value]) => value === scheduleSlot) ? '' : scheduleSlot
  return (
    <>
      <label className="block text-sm font-bold text-emerald-900">
        {text({ id: 'Waktu minum', zh: '服用時段' ,en: 'Consumption period' })}
        <select
          value={scheduleSlot}
          onChange={e => setScheduleSlot(e.target.value)}
          className="mt-1 min-h-11 w-full rounded-xl border border-emerald-200 p-2 text-sm font-normal focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
        >
          {legacySlot && <option value={legacySlot}>{text(medicationSlotText(legacySlot))}{text({ id: '（jadwal lama）', zh: '（原本時段）' ,en: '（schedule lama）' })}</option>}
          {/* 已被同一顆藥佔用的時段要先標出來，選到它代表覆蓋既有醫囑，不是單純多加一次服用。 */}
          {MEDICATION_SLOTS.map(([value]) => (
            <option key={value} value={value}>{text(medicationSlotText(value))}{occupiedSlots?.has(value) ? text({ id: '（sudah ada resep）', zh: '（已有醫囑）' ,en: '(Already has prescription)' }) : ''}</option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-bold text-emerald-900">
        {text(doseAmountFieldLabel(dosageForm))}
        <select
          value={doseAmount}
          onChange={e => setDoseAmount(e.target.value)}
          className="mt-1 min-h-11 w-full rounded-xl border border-emerald-200 bg-white p-2 font-bold focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
        >
          {/* 用選單直接呈現半顆，避免手機數字鍵盤讓照護者誤輸成 5 或漏掉小數點。 */}
          {DOSE_OPTIONS.map(amount => <option key={amount} value={amount}>{doseOptionLabel(amount)}</option>)}
        </select>
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm font-bold text-emerald-900">
        <input
          type="checkbox"
          checked={asNeeded}
          onChange={e => setAsNeeded(e.target.checked)}
          className="h-5 w-5 accent-emerald-700"
        />
        {text({ id: 'Bila perlu / PRN', zh: '需要時 / PRN' ,en: 'Bila perlu / PRN' })}
      </label>
    </>
  )
}

export function ChangeReasonField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { text } = useI18n()
  return <label className="block text-sm font-bold text-emerald-900">
    {text({ id: 'Alasan perubahan (opsional)', zh: '調整原因（可不填）' ,en: 'Reason changes (optional)' })}
    <textarea value={value} onChange={event => onChange(event.target.value)} maxLength={280} rows={2} placeholder={text({ id: 'Contoh: sesuai resep kontrol 20/7', zh: '例如：依 7/20 回診醫囑調整' ,en: 'Example: 7/20 Visit Order Adjustment' })} className="mt-1 w-full rounded-xl border border-emerald-200 p-2 text-sm font-normal focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
  </label>
}

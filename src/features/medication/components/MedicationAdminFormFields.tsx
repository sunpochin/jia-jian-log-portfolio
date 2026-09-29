/*
檔案用途：MedicationAdminSection 拆分後，ExistingPlanForm 與 NewMedicationForm 共用的純展示元件。
所在層：src/features/medication/components；不持有狀態，全部透過 props 接收資料與 callback。
主要關聯：由 ExistingPlanForm.tsx、NewMedicationForm.tsx 匯入；資料型別來自 lib/medication/medicationAdmin、lib/medication/medicationCatalog。
*/
import { useEffect, useRef, useState } from 'react'
import type { MedicationOption } from '../../../lib/medication/medicationAdmin'
import type { MedicationCatalogResult } from '../../../lib/medication/medicationCatalog'
import { doseAmountFieldLabel, formatMedicationLabel } from '../../../lib/medication/medications'
import { MEDICATION_SLOTS, medicationSlotText } from '../../../lib/medication/medicationSchedule'
import { TAIWAN_MEDICATION_FREQUENCY_PRESETS, findMatchingPresetBySlots } from '../../../lib/medication/medicationFrequencyPresets'
import { type LocalizedText, useI18n } from '../../../lib/i18n'
import { signMedicationAppearancePhotoPath, uploadMedicationAppearancePhoto } from '../../../lib/medication/medicationAppearancePhotos'
import { MedicationAppearance } from './MedicationAppearance'
import { MedicationInstructionEditor } from './MedicationInstructionEditor'

// 步距改成 0.25：媽媽正在減藥，選單要能選 1/4、3/4 這種更細的單次劑量，不能只到半顆。
const DOSE_STEP = 0.25
const MAX_DOSE_AMOUNT = 9
const DOSE_OPTIONS = Array.from({ length: MAX_DOSE_AMOUNT / DOSE_STEP }, (_, index) => (index + 1) * DOSE_STEP)

const FRACTION_SUFFIXES: Record<number, string> = { 0.25: '¼', 0.5: '½', 0.75: '¾' }

export function doseOptionLabel(amount: number) {
  const whole = Math.floor(amount)
  const fraction = FRACTION_SUFFIXES[Math.round((amount - whole) * 100) / 100]
  return fraction ? `${whole || ''}${fraction}` : String(amount)
}

export function AppearancePhotoField({ value, onChange, disabled }: { value: string; onChange: (url: string) => void; disabled: boolean }) {
  const { text } = useI18n()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<LocalizedText | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const libraryInputRef = useRef<HTMLInputElement>(null)
  const objectUrlRef = useRef<string | null>(null)

  const clearLocalPreview = () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    objectUrlRef.current = null
  }

  useEffect(() => () => clearLocalPreview(), [])

  // bucket 是 private，value 存的是 bare path 而不是能直接當 <img src> 的網址；剛上傳完那一刻用本機
  // object URL 立即預覽，換藥或重新載入既有值時才向 Storage 換簽名網址（見 medicationAppearancePhotos.ts）。
  useEffect(() => {
    if (objectUrlRef.current) return
    setPreviewUrl(null)
    if (!value) return
    let cancelled = false
    signMedicationAppearancePhotoPath(value)
      .then(url => { if (!cancelled) setPreviewUrl(url) })
      .catch(() => { /* 簽名失敗只讓縮圖顯示不出來，不擋表單其餘操作 */ })
    return () => { cancelled = true }
  }, [value])

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setUploading(true)
    setError(null)
    clearLocalPreview()
    const objectUrl = URL.createObjectURL(file)
    objectUrlRef.current = objectUrl
    setPreviewUrl(objectUrl)
    try {
      onChange(await uploadMedicationAppearancePhoto(file))
    } catch (uploadError) {
      console.error('[medication appearance photo upload error]', uploadError)
      setError({ id: 'Foto gagal diunggah. Periksa internet lalu coba lagi.', zh: '照片上傳失敗，請確認網路後再試。' ,en: "Failed to upload photo. Please check your internet connection and try again." })
      clearLocalPreview()
      setPreviewUrl(null)
    } finally {
      setUploading(false)
    }
  }

  const handleRemove = () => {
    clearLocalPreview()
    setPreviewUrl(null)
    onChange('')
  }

  return (
    <div className="col-span-2">
      <p className="block text-xs font-bold text-emerald-900">{text({ id: 'Foto asli obat ini (opsional)', zh: '實拍照片（可不填）' ,en: "Actual medication photo (optional)" })}</p>
      {/* 為什麼要提醒：medication-appearance-photos 是全體照護者共用的目錄照片（見該 migration 的 why-comment），
          這張照片不是私人病歷；拍藥袋時容易連藥局標籤一起入鏡，那上面通常有姓名、就診日期等個資，
          所以要在拍照前先讓使用者知道這張照片會共用，而不是事後才發現。 */}
      <p className="mt-1 text-[11px] leading-4 text-emerald-700">{text({ id: 'Foto ini akan menjadi gambar bersama untuk semua pengguna, jangan sertakan nama atau info rekam medis (mis. label apotek).', zh: '這張照片會成為所有使用者共用的藥品目錄圖，請避免拍到姓名或病歷資訊（例如藥局標籤）。' ,en: 'This photo becomes a shared image for all users; avoid capturing names or medical record info (e.g. pharmacy labels).' })}</p>
      {value && previewUrl && <img src={previewUrl} alt="" className="mt-2 h-20 w-20 rounded-lg border border-emerald-200 object-cover" />}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" disabled={disabled || uploading} onClick={() => cameraInputRef.current?.click()} className="min-h-11 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-bold text-emerald-800 disabled:opacity-50">📷 {text({ id: 'Ambil foto', zh: '拍照' ,en: "Take photo" })}</button>
        <button type="button" disabled={disabled || uploading} onClick={() => libraryInputRef.current?.click()} className="min-h-11 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-bold text-emerald-800 disabled:opacity-50">🖼️ {text({ id: 'Pilih dari galeri', zh: '從相簿選取' ,en: "Choose from album" })}</button>
      </div>
      {/* iOS Safari 對同一個 input 同時使用 capture 與不加 capture 的行為不一致；拆成兩個入口才能明確保留拍照與相簿選取。 */}
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" disabled={disabled || uploading} onChange={handleFile} className="sr-only" />
      <input ref={libraryInputRef} type="file" accept="image/*" disabled={disabled || uploading} onChange={handleFile} className="sr-only" />
      {uploading && <p role="status" className="mt-1 text-xs font-semibold text-emerald-700">{text({ id: 'Sedang mengunggah foto…', zh: '照片上傳中…' ,en: "Uploading photo…" })}</p>}
      {value && !uploading && <button type="button" onClick={handleRemove} className="mt-1 min-h-11 text-xs font-semibold text-red-700 underline">{text({ id: 'Hapus foto', zh: '移除照片' ,en: "Delete photo" })}</button>}
      {error && <p role="status" className="mt-1 text-xs font-semibold text-red-700">{text(error)}</p>}
    </div>
  )
}

export function MedicationChoice({ medication, selected, onSelect }: { medication: MedicationOption; selected: boolean; onSelect: () => void }) {
  const { text } = useI18n()
  const verification = medication.verification_status === 'official' ? text({ id: 'Data resmi', zh: '官方資料' ,en: 'Official' }) : medication.verification_status === 'manually_verified' ? text({ id: 'Sudah diperiksa manual', zh: '已人工核對' ,en: 'Manually checked' }) : text({ id: '⚠ Belum diverifikasi', zh: '⚠ 未驗證' ,en: 'Unverified' })
  const categoryLabel = medication.medication_category === 'animal'
    ? text({ id: 'Obat Hewan (Kementan)', zh: '🐾 動物用藥（農業部）' ,en: '🐾 Veterinary Medicine (MOA)' })
    : medication.medication_category === 'dual'
      ? text({ id: 'Penggunaan Manusia & Hewan', zh: '👩🐾 人寵共用' ,en: '👩🐾 Human & Pet Use' })
      : text({ id: 'Obat Manusia (TFDA)', zh: '👩 人類用藥（TFDA）' ,en: '👩 Human Medicine (TFDA)' })

  // 顯示適用與禁用物種標籤；bird 不能退回 other，否則 Pickle 的藥品適用範圍會被誤讀。
  const speciesTags = (medication.applicable_species ?? ['human']).map(s => {
    if (s === 'dog') return text({ id: '🐶 Anjing', zh: '🐶 狗' ,en: '🐶 Dog' })
    if (s === 'cat') return text({ id: '🐱 Kucing', zh: '🐱 貓' ,en: '🐱 Cat' })
    if (s === 'bird') return text({ id: '🐦 Burung', zh: '🐦 鳥' ,en: "🐦 Bird" })
    if (s === 'rabbit') return text({ id: '🐰 Kelinci', zh: '🐰 兔' ,en: '🐰 Rabbit' })
    if (s === 'human') return text({ id: '👩 Manusia', zh: '👩 人' ,en: '👩 Human' })
    return text({ id: '🐾 Lainnya', zh: '🐾 其他' ,en: '🐾 Other' })
  }).join(' ')

  const contraTags = (medication.contraindicated_species ?? []).map(s => {
    if (s === 'cat') return text({ id: '🐱 Dilarang untuk Kucing', zh: '🐱 貓禁用' ,en: '🐱 Contraindicated for Cats' })
    if (s === 'dog') return text({ id: '🐶 Dilarang untuk Anjing', zh: '🐶 狗禁用' ,en: '🐶 Contraindicated for Dogs' })
    if (s === 'bird') return text({ id: '🐦 Dilarang untuk Burung', zh: '🐦 鳥禁用' ,en: "🐦 Contraindicated for Birds" })
    if (s === 'rabbit') return text({ id: '🐰 Dilarang untuk Kelinci', zh: '🐰 兔禁用' ,en: '🐰 Contraindicated for Rabbits' })
    return text({ id: 'Dilarang', zh: '禁用' ,en: 'Contraindicated' })
  }).join(' ')

  return <button type="button" aria-pressed={selected} onClick={onSelect} className={`min-h-11 break-all rounded-xl border p-3 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 ${selected ? 'border-emerald-700 bg-emerald-50 text-emerald-950' : 'border-emerald-200 text-gray-700'}`}>
    <div className="flex flex-wrap items-center justify-between gap-1">
      <b>{medication.brand_name_zh || text({ id: 'Nama merek Mandarin belum tercatat', zh: '中文商品名未登錄' ,en: 'Chinese brand name not recorded' })} · {formatMedicationLabel(medication.brand_name, medication.strength_mg, medication.strength_label)}</b>
      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-900">{categoryLabel}</span>
    </div>
    <p className="mt-0.5 text-gray-600">{medication.generic_name}</p>
    {medication.indications && <p className="mt-0.5 text-indigo-900 font-medium">{text({ id: 'Indikasi: ', zh: '適應症：' ,en: 'Indications: ' })}{medication.indications}</p>}
    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-800">{speciesTags}</span>
      {contraTags && <span className="rounded bg-red-100 px-1.5 py-0.5 font-bold text-red-800">⚠️ {contraTags}</span>}
    </div>
    <div className="mt-1"><MedicationAppearance medication={medication} compact /></div>
    <span className={medication.verification_status === 'unverified' ? 'text-amber-800' : 'text-emerald-800'}>{verification}{medication.tfda_license_number ? ` · ${medication.tfda_license_number}` : ''}{medication.animal_drug_license_number ? ` · ${text({ id: 'Izin obat hewan: ', zh: '動物藥證: ' ,en: 'Veterinary drug license: ' })}${medication.animal_drug_license_number}` : ''}</span>
  </button>
}

export function RegistryMedicationChoice({ product, selected, onSelect }: { product: MedicationCatalogResult; selected: boolean; onSelect: () => void }) {
  const { text } = useI18n()
  
  let sourceLabel = { id: 'Katalog', zh: '藥品目錄' ,en: 'Catalog' }
  if (product.source === 'tfda') sourceLabel = { id: 'Katalog TFDA', zh: '西藥 (TFDA)' ,en: 'TFDA Catalog' }
  if (product.source === 'nhi_tcm') sourceLabel = { id: 'Katalog TCM', zh: '中藥 (健保)' ,en: 'Traditional Chinese Medicine (NHI)' }
  if (product.source === 'moa_animal') sourceLabel = { id: 'Katalog Hewan', zh: '動物用藥 (農業部)' ,en: 'Veterinary Medicine (MOA)' }

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
      {product.ingredient && <p className="mt-0.5 text-gray-500">{text({ id: 'Bahan: ', zh: '成分：' ,en: 'Ingredients: ' })}{product.ingredient}</p>}
      <span className="mt-1 block text-emerald-800">
        {product.sourceId} {product.manufacturer ? `· ${product.manufacturer}` : ''}
      </span>
    </button>
  )
}


export interface PlanFieldsProps {
  scheduleSlot?: string
  setScheduleSlot?: (value: string) => void
  scheduleSlots?: string[]
  setScheduleSlots?: (slots: string[]) => void
  doseAmount: string
  setDoseAmount: (value: string) => void
  asNeeded: boolean
  setAsNeeded: (value: boolean) => void
  occupiedSlots?: Set<string>
  dosageForm?: string
  isEditing?: boolean
  // 服用方式 B 層只在「已確認的病人專屬藥品」存在時才能填寫；新增自訂藥品當下 medicationId 還沒建立，
  // 兩者都給值時才掛載 MedicationInstructionEditor，否則就靜靜跳過，不擋住其餘欄位。
  patientId?: string
  medicationId?: string
  // 服用方式存檔／清除後，MedicationPage 的 plans（已 join instruction）要重新讀取才看得到最新徽章；
  // 沿用容器既有的 onMedicationPlanChanged，不必另外發明一條平行的重讀機制。
  onInstructionChanged?: () => void
}

export function PlanFields({
  scheduleSlot = 'after_breakfast',
  setScheduleSlot,
  scheduleSlots,
  setScheduleSlots,
  doseAmount,
  setDoseAmount,
  asNeeded,
  setAsNeeded,
  occupiedSlots,
  dosageForm = 'tablet',
  isEditing = false,
  patientId,
  medicationId,
  onInstructionChanged,
}: PlanFieldsProps) {
  // 調藥表單也跟著語系切換，避免照護者在同一時段名稱讀到兩種語言。
  const { text } = useI18n()

  // 繁體中文註解：優先使用複選的 scheduleSlots（若為陣列則以其為準，即使為空陣列 [] 也代表使用者已全部取消勾選）；
  // 只有在 scheduleSlots 為 undefined（例如外部僅提供單選 scheduleSlot）時，才退回使用單選時段。
  const currentSlots = scheduleSlots !== undefined
    ? scheduleSlots
    : (scheduleSlot ? [scheduleSlot] : ['after_breakfast'])
  const activePreset = findMatchingPresetBySlots(currentSlots)

  const handleSelectPreset = (presetId: string) => {
    if (presetId === 'custom') return
    const targetPreset = TAIWAN_MEDICATION_FREQUENCY_PRESETS.find(p => p.id === presetId)
    if (!targetPreset) return
    const nextSlots = [...targetPreset.slots]
    setScheduleSlots?.(nextSlots)
    if (setScheduleSlot && nextSlots[0]) setScheduleSlot(nextSlots[0])
  }

  const handleToggleSlot = (slotValue: string) => {
    let nextSlots: string[]
    if (currentSlots.includes(slotValue)) {
      // 至少保留當前切換結果，若清空則允許暫時為空陣列（由送出前檢核擋下並提示）
      nextSlots = currentSlots.filter(s => s !== slotValue)
    } else {
      nextSlots = [...currentSlots, slotValue]
    }
    setScheduleSlots?.(nextSlots)
    if (setScheduleSlot && nextSlots[0]) setScheduleSlot(nextSlots[0])
  }

  // 舊資料與 PRN 可能存著 anytime／morning／after_meal 這類已不在選單裡的時段。少了這個選項，
  // 瀏覽器會顯示第一個選項（早餐前），但實際狀態仍是舊時段——照護者看到的和送出的會是兩回事。
  const legacySlot = MEDICATION_SLOTS.some(([value]) => value === scheduleSlot) ? '' : scheduleSlot

  return (
    <>
      {isEditing ? (
        // 繁體中文註解：編輯既有單筆醫囑時維持單選，只改變該筆醫囑的時段，避免改時段變成自動覆蓋或裂變多筆。
        <label className="block text-sm font-bold text-emerald-900">
          {text({ id: 'Waktu minum', zh: '服用時段', en: 'Consumption period' })}
          <select
            value={scheduleSlot}
            onChange={e => {
              setScheduleSlot?.(e.target.value)
              setScheduleSlots?.([e.target.value])
            }}
            className="mt-1 min-h-11 w-full rounded-xl border border-emerald-200 p-2 text-sm font-normal focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          >
            {legacySlot && <option value={legacySlot}>{text(medicationSlotText(legacySlot))}{text({ id: '（jadwal lama）', zh: '（原本時段）', en: ' (previous time slot)' })}</option>}
            {/* 已被同一顆藥佔用的時段要先標出來，選到它代表覆蓋既有醫囑，不是單純多加一次服用。 */}
            {MEDICATION_SLOTS.map(([value]) => (
              <option key={value} value={value}>
                {text(medicationSlotText(value))}{occupiedSlots?.has(value) ? text({ id: '（sudah ada resep）', zh: '（已有醫囑）', en: '(Already has prescription)' }) : ''}
              </option>
            ))}
          </select>
        </label>
      ) : (
        // 繁體中文註解：新增用藥（無論是自訂新藥還是既有藥箱/官方目錄）提供台灣常見服藥頻率預設組合
        // （如「一天三次，餐後」、「一天三次，餐前餐後都可以」、「一天四次」等）與時段複選方塊，
        // 解決原本只能選單一時段、需重複新增 3 次的照護痛點。
        <div className="space-y-2">
          <label className="block text-sm font-bold text-emerald-900">
            {text({ id: 'Frekuensi minum (pilihan cepat)', zh: '常用服藥頻率（快速設定）', en: 'Common frequency (quick preset)' })}
            <select
              value={activePreset?.id ?? 'custom'}
              onChange={e => handleSelectPreset(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-emerald-200 bg-white p-2 text-sm font-semibold text-emerald-950 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            >
              {TAIWAN_MEDICATION_FREQUENCY_PRESETS.map(preset => (
                <option key={preset.id} value={preset.id}>
                  {text(preset.label)}
                </option>
              ))}
              <option value="custom">
                {text({ id: 'Kustomisasi waktu minum', zh: '自訂時段（自由勾選）', en: 'Custom time slots' })}
              </option>
            </select>
          </label>

          <fieldset className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-2.5">
            <legend className="px-1 text-xs font-bold text-emerald-900">
              {text({ id: 'Waktu minum (bisa pilih lebih dari satu)', zh: '服藥時段（可複選多個時段）', en: 'Medication slots (multiple selectable)' })}
            </legend>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {MEDICATION_SLOTS.map(([value]) => {
                const isSelected = currentSlots.includes(value)
                const isOccupied = occupiedSlots?.has(value)
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => handleToggleSlot(value)}
                    className={`flex min-h-11 items-center justify-between gap-1 rounded-xl border px-2.5 py-1.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-1 ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-600 text-white font-bold shadow-sm'
                        : 'border-slate-200 bg-white text-slate-800 hover:border-emerald-300'
                    }`}
                  >
                    <span className="truncate">{text(medicationSlotText(value))}</span>
                    <span className="shrink-0 text-[11px]">
                      {isSelected ? '✓' : ''}
                      {isOccupied && <span className={`ml-0.5 text-[10px] ${isSelected ? 'text-emerald-100' : 'text-amber-800'}`}>!</span>}
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between text-xs text-emerald-900">
              <span>
                {currentSlots.length > 0 ? (
                  <>
                    {text({ id: `Dipilih: ${currentSlots.length} waktu (`, zh: `已選 ${currentSlots.length} 個時段：`, en: `Selected ${currentSlots.length} slots: ` })}
                    <b>{currentSlots.map(s => text(medicationSlotText(s))).join('、')}</b>
                    {text({ id: ')', zh: '', en: '' })}
                  </>
                ) : (
                  <span className="font-bold text-red-600">
                    {text({ id: 'Pilih minimal satu waktu minum', zh: '請至少選擇一個服藥時段', en: 'Please select at least one slot' })}
                  </span>
                )}
              </span>
            </div>
          </fieldset>
        </div>
      )}

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
        {text({ id: 'Bila perlu / PRN', zh: '需要時 / PRN' ,en: 'As needed / PRN' })}
      </label>
      {patientId && medicationId && <MedicationInstructionEditor patientId={patientId} medicationId={medicationId} onChanged={onInstructionChanged} />}
    </>
  )
}

export function ChangeReasonField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { text } = useI18n()
  return <label className="block text-sm font-bold text-emerald-900">
    {text({ id: 'Alasan perubahan (opsional)', zh: '調整原因（可不填）' ,en: 'Reason for change (optional)' })}
    <textarea value={value} onChange={event => onChange(event.target.value)} maxLength={280} rows={2} placeholder={text({ id: 'Contoh: sesuai resep kontrol 20/7', zh: '例如：依 7/20 回診醫囑調整' ,en: 'Example: 7/20 Visit Order Adjustment' })} className="mt-1 w-full rounded-xl border border-emerald-200 p-2 text-sm font-normal focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
  </label>
}

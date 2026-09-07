/*
檔案用途：MedicationAdminSection 的「新增未驗證自訂藥品」表單，從原本 747 行的巨型元件拆出。
所在層：src/features/medication/components；只讀寫 useMedicationAdminForm 回傳的狀態，不自行管理資料。
主要關聯：由 MedicationAdminSection.tsx 掛載，與 ExistingPlanForm.tsx 共用 useMedicationAdminForm 的同一份表單狀態。
*/
import { useI18n } from '../../../lib/i18n'
import { medicationAppearanceColors, medicationAppearanceShapes } from './MedicationAppearance'
import { AppearancePhotoField, ChangeReasonField, PlanFields } from './MedicationAdminFormFields'
import type { useMedicationAdminForm } from '../hooks/useMedicationAdminForm'

export function NewMedicationForm({ form }: { form: ReturnType<typeof useMedicationAdminForm> }) {
  const { text } = useI18n()
  const {
    selectedMedication, selectedCatalogProduct,
    brandNameZh, setBrandNameZh, brandName, setBrandName, genericName, setGenericName,
    strengthMg, setStrengthMg, dosageForm, setDosageForm,
    appearanceColor, setAppearanceColor, appearanceShape, setAppearanceShape,
    appearancePhotoUrl, setAppearancePhotoUrl, saving,
    newScheduleSlot, setNewScheduleSlot, newDoseAmount, setNewDoseAmount, newAsNeeded, setNewAsNeeded,
    newChangeReason, setNewChangeReason, canEditSubject, status, addNew,
  } = form

  return (
    <>
      {selectedMedication || selectedCatalogProduct ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-900">
        {/* 已挑到既有藥品時先把手動新增入口收起來，避免照護者誤以為同一顆藥還要再登錄一次。 */}
        {text({ id: 'Obat yang dipilih sudah punya data katalog. Langkah berikutnya hanya konfirmasi lalu pilih jadwal minum; formulir obat baru disembunyikan sementara.', zh: '這顆藥已經有目錄資料了，接下來只要確認並選服用時段；手動新增表單會先隱藏，避免誤以為同一顆藥還要再登錄一次。' ,en: 'Medication that dipilih already punya data katalog. Lnumbersh next only konfirmasi lalu select schedule take; formulir medication baru disembunyikan temporary.' })}
      </div> : <details className="rounded-2xl border border-amber-300 bg-amber-50 p-3"><summary className="flex min-h-11 cursor-pointer items-center text-sm font-bold text-amber-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2">{text({ id: 'Tidak menemukan obat? Tambahkan obat belum diverifikasi', zh: '找不到藥品？新增未驗證自訂藥品' ,en: 'Can’t find your drug? Add an unverified custom drug' })}</summary>
        <form onSubmit={addNew} className="mt-3 space-y-2">
          <p className="rounded bg-amber-100 p-2 text-xs text-amber-950">{text({ id: 'Obat ini belum diperiksa dengan katalog resmi. Jangan gunakan untuk pemeriksaan bahan aktif, interaksi, atau dosis total.', zh: '此藥尚未與官方目錄核對；不會用於成分重複、交互作用或每日總量判斷。' ,en: 'This medicine has not been checked against the official catalogue; it will not be used for ingredient duplication, interactions or daily total judgments.' })}</p>
          <label className="block text-xs font-bold text-emerald-900">{text({ id: 'Nama merek Mandarin (opsional)', zh: '藥品中文商品名（可不填）' ,en: 'Name merek Mandarin (optional)' })}<input value={brandNameZh} onChange={e => setBrandNameZh(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-emerald-200 p-2 text-sm font-normal focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200" /></label>
          <label className="block text-xs font-bold text-emerald-900">{text({ id: 'Nama merek obat', zh: '藥品羅馬字商品名' ,en: 'Name merek medication' })}<input required value={brandName} onChange={e => setBrandName(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-emerald-200 p-2 text-sm font-normal focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200" /></label>
          <label className="block text-xs font-bold text-emerald-900">{text({ id: 'Nama generik', zh: '學名' ,en: '<g>Systematic Name</g>' })}<input required value={genericName} onChange={e => setGenericName(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-emerald-200 p-2 text-sm font-normal focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200" /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-bold text-emerald-900">{text({ id: 'Kekuatan mg', zh: '劑量 mg' ,en: 'Dose mg' })}<input required type="number" min="0.001" step="0.001" value={strengthMg} onChange={e => setStrengthMg(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-emerald-200 p-2 text-sm font-normal focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200" /></label>
            <label className="block text-xs font-bold text-emerald-900">{text({ id: 'Bentuk obat', zh: '劑型' ,en: 'Dosage Form' })}<select value={dosageForm} onChange={e => setDosageForm(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-emerald-200 p-2 text-sm font-normal focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"><option value="tablet">{text({ id: 'Tablet', zh: '錠劑' ,en: 'Tablet' })}</option><option value="capsule">{text({ id: 'Kapsul', zh: '膠囊' ,en: 'Kapsul' })}</option><option value="liquid">{text({ id: 'Cair', zh: '液體' ,en: 'Liquid' })}</option><option value="powder">{text({ id: 'Bubuk (sachet)', zh: '粉劑（一包）' ,en: 'Bubuk (sachet)' })}</option></select></label>
          </div>
          <fieldset className="grid grid-cols-2 gap-2 rounded-xl border border-amber-200 p-3">
            <legend className="px-1 text-xs font-bold text-amber-950">{text({ id: 'Ciri fisik (opsional; cocokkan dengan kemasan atau obat)', zh: '外觀辨識（可不填，請依藥袋或實物核對）' ,en: 'Appearance identification (optional, please check by bag or object)' })}</legend>
            <label className="block text-xs font-bold text-emerald-900">{text({ id: 'Warna', zh: '顏色' ,en: 'Color' })}<select value={appearanceColor} onChange={event => setAppearanceColor(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-emerald-200 p-2 text-sm font-normal focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"><option value="">{text({ id: 'Warna belum tercatat', zh: '顏色未登錄' ,en: 'Color not yet recorded' })}</option>{medicationAppearanceColors.map(([value, label]) => <option key={value} value={value}>{text(label)}</option>)}</select></label>
            <label className="block text-xs font-bold text-emerald-900">{text({ id: 'Bentuk', zh: '形狀' ,en: 'shapes' })}<select value={appearanceShape} onChange={event => setAppearanceShape(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-emerald-200 p-2 text-sm font-normal focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"><option value="">{text({ id: 'Bentuk belum tercatat', zh: '形狀未登錄' ,en: 'Shape is not logged in' })}</option>{medicationAppearanceShapes.map(([value, label]) => <option key={value} value={value}>{text(label)}</option>)}</select></label>
            <AppearancePhotoField value={appearancePhotoUrl} onChange={setAppearancePhotoUrl} disabled={saving} />
          </fieldset>
          <PlanFields scheduleSlot={newScheduleSlot} setScheduleSlot={setNewScheduleSlot} doseAmount={newDoseAmount} setDoseAmount={setNewDoseAmount} asNeeded={newAsNeeded} setAsNeeded={setNewAsNeeded} dosageForm={dosageForm} />
          <ChangeReasonField value={newChangeReason} onChange={setNewChangeReason} />
          <button disabled={saving || !canEditSubject} className="min-h-12 w-full rounded-xl bg-emerald-700 p-2 text-sm font-bold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:opacity-50">{text({ id: 'Buat dan tambahkan', zh: '建立並加入' ,en: 'Create and join' })}</button>
          {status && <p role="status" className="text-xs font-semibold text-emerald-900">{text(status)}</p>}
        </form>
      </details>}

    </>
  )
}

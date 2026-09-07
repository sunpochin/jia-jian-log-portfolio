/*
檔案用途：MedicationAdminSection 的「加入既有藥品／調整醫囑」表單，從原本 747 行的巨型元件拆出。
所在層：src/features/medication/components；只讀寫 useMedicationAdminForm 回傳的狀態，不自行管理資料。
主要關聯：由 MedicationAdminSection.tsx 掛載，與 NewMedicationForm.tsx 共用 useMedicationAdminForm 的同一份表單狀態。
*/
import { useI18n } from '../../../lib/i18n'
import { formatDoseAmountLocalized, formatMedicationLabel, pairMedicationNames } from '../../../lib/medications'
import { medicationSlotText } from '../../../lib/medicationSchedule'
import { medicationAppearanceColors, medicationAppearanceShapes, MedicationAppearance } from './MedicationAppearance'
import { AppearancePhotoField, ChangeReasonField, MedicationChoice, PlanFields, RegistryMedicationChoice } from './MedicationAdminFormFields'
import type { useMedicationAdminForm } from '../hooks/useMedicationAdminForm'

export function ExistingPlanForm({ form, nameEnglishFirst }: { form: ReturnType<typeof useMedicationAdminForm>; nameEnglishFirst: boolean }) {
  const { text, locale } = useI18n()
  const {
    editPanelRef, isAddPanelOpen, setIsAddPanelOpen, resetSelection, editingPlan, selectedMedication,
    isCorrectingMedication, setIsCorrectingMedication, dosageForm, setDosageForm, setHasCorrectionEdits,
    appearanceColor, setAppearanceColor, appearanceShape, setAppearanceShape,
    appearancePhotoUrl, setAppearancePhotoUrl, saving, finishAddFlow,
    personalMedications, medicationId, chooseMedication,
    isCatalogSearchOpen, setIsCatalogSearchOpen, catalogQuery, setCatalogQuery,
    setMedicationId, setSelectedCatalogProduct, setSelectionConfirmed,
    catalogResults, searchingRegistry, filteredRegistryResults,
    selectedCatalogProduct, chooseCatalogProduct,
    editingPlanId, samePlansForSelectedMedication, startEditingPlan, selectionConfirmed, occupiedSlots,
    existingScheduleSlot, setExistingScheduleSlot, existingDoseAmount, setExistingDoseAmount,
    existingAsNeeded, setExistingAsNeeded, blockedByConflict, overwriteTarget,
    existingChangeReason, setExistingChangeReason, canEditSubject, status, addExisting,
  } = form

  return (
      <details ref={editPanelRef} open={isAddPanelOpen} onToggle={event => {
        // 收合表單時一併取消編輯狀態，否則下次展開會沿用看不見的 editingPlanId，把新選的藥寫進舊那筆醫囑。
        const open = event.currentTarget.open
        setIsAddPanelOpen(open)
        if (!open) resetSelection()
      }} className={`rounded-2xl border bg-white p-3 ${editingPlan ? 'border-emerald-600 ring-2 ring-emerald-300' : 'border-emerald-300'}`}>
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-bold text-emerald-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2">{editingPlan ? text({ id: 'Sedang mengubah resep ini', zh: '正在調整這一筆醫囑' ,en: 'Adjusting this order' }) : text({ id: '＋ Tambah atau ubah obat', zh: '＋ 加入或調整藥品' ,en: '＋ Add or ubah medication' })}</summary>
      <form onSubmit={addExisting} className="mt-3 space-y-2">
        {editingPlan ? <div className="space-y-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900">
          {/* 調整模式不再顯示藥箱與搜尋：這裡改的是「這一筆醫囑」的時段與劑量，換藥應該回列表移除後重新加入。 */}
          <p className="text-sm font-black">{text({ id: 'Sedang mengubah', zh: '正在調整' ,en: 'Adjusting' })}：{selectedMedication
            ? pairMedicationNames(formatMedicationLabel(selectedMedication.brand_name, selectedMedication.strength_mg, selectedMedication.strength_label), selectedMedication.brand_name_zh || selectedMedication.brand_name, nameEnglishFirst).primary
            : editingPlan.medication_id}</p>
          <p>{text({ id: 'Resep sekarang', zh: '目前醫囑' ,en: 'Prescription current' })}：{text(medicationSlotText(editingPlan.schedule_slot))} · {selectedMedication ? formatDoseAmountLocalized(editingPlan.dose_amount, selectedMedication.dosage_form, locale) : editingPlan.dose_amount}{editingPlan.as_needed ? ` · ${text({ id: 'Bila perlu', zh: '需要時服用' ,en: 'Bila perlu' })}` : ''}</p>
          {selectedMedication && <div className="mt-1"><MedicationAppearance medication={selectedMedication} compact /></div>}
          {selectedMedication && (isCorrectingMedication ? <fieldset className="grid grid-cols-2 gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
            <legend className="px-1 text-xs font-bold text-amber-950">{text({ id: 'Perbaiki bentuk/warna obat ini (berlaku untuk SEMUA orang dan SEMUA jadwal yang memakai obat yang sama)', zh: '修正這顆藥的劑型／外觀（會套用到所有使用這顆藥的人與所有時段，不只這個人、不只這一筆）' ,en: "Perbaiki shape/color medication this (berlaku for SEMUA people and SEMUA schedule that memakai medication that sama)" })}</legend>
            <label className="col-span-2 block text-xs font-bold text-emerald-900">{text({ id: 'Bentuk obat', zh: '劑型' ,en: 'Dosage Form' })}<select value={dosageForm} onChange={e => { setDosageForm(e.target.value); setHasCorrectionEdits(true) }} className="mt-1 min-h-11 w-full rounded-xl border border-emerald-200 p-2 text-sm font-normal focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"><option value="tablet">{text({ id: 'Tablet', zh: '錠劑' ,en: 'Tablet' })}</option><option value="capsule">{text({ id: 'Kapsul', zh: '膠囊' ,en: 'Kapsul' })}</option><option value="liquid">{text({ id: 'Cair', zh: '液體' ,en: 'Liquid' })}</option><option value="powder">{text({ id: 'Bubuk (sachet)', zh: '粉劑（一包）' ,en: 'Bubuk (sachet)' })}</option></select></label>
            <label className="block text-xs font-bold text-emerald-900">{text({ id: 'Warna', zh: '顏色' ,en: 'Color' })}<select value={appearanceColor} onChange={event => { setAppearanceColor(event.target.value); setHasCorrectionEdits(true) }} className="mt-1 min-h-11 w-full rounded-xl border border-emerald-200 p-2 text-sm font-normal focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"><option value="">{text({ id: 'Warna belum tercatat', zh: '顏色未登錄' ,en: 'Color not yet recorded' })}</option>{medicationAppearanceColors.map(([value, label]) => <option key={value} value={value}>{text(label)}</option>)}</select></label>
            <label className="block text-xs font-bold text-emerald-900">{text({ id: 'Bentuk', zh: '形狀' ,en: 'shapes' })}<select value={appearanceShape} onChange={event => { setAppearanceShape(event.target.value); setHasCorrectionEdits(true) }} className="mt-1 min-h-11 w-full rounded-xl border border-emerald-200 p-2 text-sm font-normal focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"><option value="">{text({ id: 'Bentuk belum tercatat', zh: '形狀未登錄' ,en: 'Shape is not logged in' })}</option>{medicationAppearanceShapes.map(([value, label]) => <option key={value} value={value}>{text(label)}</option>)}</select></label>
            <AppearancePhotoField value={appearancePhotoUrl} onChange={url => { setAppearancePhotoUrl(url); setHasCorrectionEdits(true) }} disabled={saving} />
            <button type="button" onClick={() => setIsCorrectingMedication(false)} className="col-span-2 min-h-10 rounded-xl border border-amber-700 bg-white px-3 py-2 font-bold text-amber-900 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2">{text({ id: 'Sembunyikan koreksi obat', zh: '收合藥品資料修正' ,en: "Sembunyikan koreksi medication" })}</button>
          </fieldset> : <button type="button" onClick={() => setIsCorrectingMedication(true)} className="min-h-10 rounded-xl border border-amber-400 bg-amber-50 px-3 py-2 text-left font-bold text-amber-900 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2">{text({ id: 'Bentuk/warna obat ini salah? Perbaiki di sini', zh: '這顆藥的劑型或顏色登錄錯了嗎？點這裡修正' ,en: "Shape/color medication this salah? Perbaiki in this" })}</button>)}
          <button type="button" onClick={finishAddFlow} className="min-h-10 rounded-xl border border-emerald-700 bg-white px-3 py-2 font-bold text-emerald-800 transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2">{text({ id: 'Batal mengubah', zh: '取消調整' ,en: 'Cancel Adjustment' })}</button>
        </div> : <>
        <h3 className="text-sm font-bold text-emerald-900">{text({ id: 'Tambah dari pilihan', zh: '加入既有藥品' ,en: 'Add Existing Drug' })}</h3>
        <p className="text-xs text-emerald-800">{text({ id: 'Untuk pasien yang dipilih', zh: '調整目前選擇的病人' ,en: 'Untuk pasien that dipilih' })}</p>
        <div className="rounded-xl border border-emerald-100 p-3">
          <p className="text-xs font-bold text-emerald-900">{text({ id: 'Kotak obat saya', zh: '我的藥箱' ,en: 'My Medicine Chest' })}</p>
          {personalMedications.length ? <div className="mt-2 grid gap-2">{personalMedications.map(medication => <MedicationChoice key={medication.id} medication={medication} selected={medication.id === medicationId} onSelect={() => chooseMedication(medication.id)} />)}</div> : <p className="mt-2 text-xs text-gray-600">{text({ id: 'Belum ada obat yang sudah dikonfirmasi. Cari di bawah atau tambahkan dari kemasan obat.', zh: '這個人還沒有已核對的藥品；請從下方搜尋，或依藥袋新增。' ,en: 'Not yet ada medication that already dikonfirmasi. Cari di bawah or add from package medication.' })}</p>}
        </div>
        <details open={isCatalogSearchOpen} onToggle={event => setIsCatalogSearchOpen(event.currentTarget.open)} className="rounded-xl border border-emerald-100 p-3">
          <summary className="flex min-h-11 cursor-pointer items-center text-xs font-bold text-emerald-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2">{text({ id: 'Cari obat lain', zh: '搜尋其他既有藥品' ,en: 'Search for other existing medicines' })}</summary>
          <div className="mt-2 space-y-2">
            <label className="block text-xs font-bold text-emerald-900">
              {text({ id: 'Cari berdasarkan nama atau kode', zh: '依名稱或代碼搜尋' ,en: 'Search by name or code' })}
              <input value={catalogQuery} onChange={e => {
                // 搜尋字一變，舊選取就可能不再是畫面中的候選；先清掉才能避免文字與 ID 分家。
                setCatalogQuery(e.target.value); setMedicationId(''); setSelectedCatalogProduct(null); setSelectionConfirmed(false)
              }} placeholder={text({ id: 'Merek, nama generik, dosis, atau kode obat', zh: '商品名、學名、劑量或藥品代碼' ,en: 'Trade name, scientific name, dose, or drug code' })} className="mt-1 min-h-11 w-full rounded-xl border border-emerald-200 p-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </label>
            {catalogQuery.trim().length < 2 ? <p className="text-xs text-gray-600">{text({ id: 'Masukkan minimal dua huruf untuk mulai mencari.', zh: '輸入至少兩個字後開始搜尋。' ,en: 'Enter mthismal two huruf for mulai mencari.' })}</p> : <div className="grid gap-2">
              {catalogResults.length ? catalogResults.map(medication => <MedicationChoice key={medication.id} medication={medication} selected={medication.id === medicationId} onSelect={() => chooseMedication(medication.id)} />) : null}
              {searchingRegistry && <p className="text-xs font-semibold text-emerald-700">{text({ id: 'Mencari Katalog Resmi…', zh: '正在搜尋官方目錄…' ,en: 'Searching official directory...' })}</p>}
              {filteredRegistryResults.length > 0 && <div className="space-y-1.5 pt-1">
                <p className="text-xs font-bold text-emerald-900">{text({ id: 'Hasil Katalog Resmi', zh: '官方目錄相符藥品' ,en: 'Official catalog matching medicines' })}</p>
                <div className="grid gap-2">{filteredRegistryResults.map(product => <RegistryMedicationChoice key={product.id} product={product} selected={selectedCatalogProduct?.id === product.id} onSelect={() => chooseCatalogProduct(product)} />)}</div>
              </div>}
              {!catalogResults.length && !filteredRegistryResults.length && !searchingRegistry && <p className="text-xs text-gray-600">{text({ id: 'Obat yang cocok tidak ditemukan. Periksa kemasan atau tambahkan obat baru.', zh: '找不到相符藥品；請核對藥袋，或新增一種藥品。' ,en: 'No matching drug found; please check the bag or add a new drug.' })}</p>}
            </div>}
          </div>
        </details>
        </>}
        {!editingPlanId && selectedMedication && samePlansForSelectedMedication.length > 0 && <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
          {/* 「加入」一顆已經在藥單上的藥其實是覆蓋既有醫囑；先把既有那幾筆攤開，照護者才能選擇要調整哪一筆或真的要多加一個時段。 */}
          <p className="font-bold">{text({ id: 'Obat ini sudah ada di daftar orang ini.', zh: '這個人的藥單已經有這顆藥了。' ,en: 'Medication this already ada di daftar person this.' })}</p>
          <ul className="space-y-1">{samePlansForSelectedMedication.map(plan => <li key={plan.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-2">
            <span>{text(medicationSlotText(plan.schedule_slot))} · {selectedMedication ? formatDoseAmountLocalized(plan.dose_amount, selectedMedication.dosage_form, locale) : plan.dose_amount}{plan.as_needed ? ` · ${text({ id: 'Bila perlu', zh: '需要時服用' ,en: 'Bila perlu' })}` : ''}</span>
            <button type="button" onClick={() => startEditingPlan(plan)} className="min-h-10 rounded-xl border border-emerald-700 px-3 py-2 font-bold text-emerald-800 transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2">{text({ id: 'Ubah resep ini', zh: '改成調整這一筆' ,en: 'Adjust this amount instead' })}</button>
          </li>)}</ul>
          <p>{text({ id: 'Pilih waktu minum lain berarti menambah dosis tambahan; memilih waktu minum yang sama akan menimpa resep lama.', zh: '選其他時段＝這顆藥多一次服用；選同一個時段＝覆蓋原本那筆醫囑。' ,en: 'Select time take lain berarti menambah dose tambahan; memilih time take that sama will menimpa prescription lama.' })}</p>
        </div>}
        {!editingPlanId && selectedMedication && <div className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-900">{text({ id: 'Dipilih: ', zh: '已選：' ,en: 'selected' })}<b>{formatMedicationLabel(selectedMedication.brand_name, selectedMedication.strength_mg, selectedMedication.strength_label)}</b> · {selectedMedication.generic_name}<button type="button" onClick={() => setSelectionConfirmed(true)} className="mt-2 min-h-11 block rounded-xl border border-emerald-700 px-3 py-2 font-bold transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:opacity-50" disabled={selectionConfirmed}>{selectionConfirmed ? text({ id: 'Sudah dikonfirmasi', zh: '已確認藥品' ,en: 'Confirmed medications' }) : text({ id: 'Konfirmasi obat ini', zh: '確認是這個藥品' ,en: 'Konfirmasi medication this' })}</button></div>}
        {selectedCatalogProduct && <div className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-900">
          <div className="flex flex-wrap items-center justify-between gap-1">
            <span>{text({ id: 'Dipilih (Katalog Resmi): ', zh: '已選（官方目錄）：' ,en: 'Selected (official directory):' })}<b>{selectedCatalogProduct.nameZh}</b> {selectedCatalogProduct.nameEn ? `· ${selectedCatalogProduct.nameEn}` : ''}</span>
            <span className="rounded-full bg-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-900">{selectedCatalogProduct.sourceId}</span>
          </div>
          {selectedCatalogProduct.ingredient && <p className="mt-1 text-gray-600">{text({ id: 'Bahan: ', zh: '成分：' ,en: 'INGREDIENTS:' })}{selectedCatalogProduct.ingredient}</p>}
          <button type="button" onClick={() => setSelectionConfirmed(true)} className="mt-2 min-h-11 block rounded-xl border border-emerald-700 px-3 py-2 font-bold transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:opacity-50" disabled={selectionConfirmed}>{selectionConfirmed ? text({ id: 'Sudah dikonfirmasi', zh: '已確認藥品' ,en: 'Confirmed medications' }) : text({ id: 'Konfirmasi obat ini', zh: '確認是這個藥品' ,en: 'Konfirmasi medication this' })}</button>
        </div>}
        {(selectedMedication || selectedCatalogProduct) && selectionConfirmed && <><PlanFields scheduleSlot={existingScheduleSlot} setScheduleSlot={setExistingScheduleSlot} doseAmount={existingDoseAmount} setDoseAmount={setExistingDoseAmount} asNeeded={existingAsNeeded} setAsNeeded={setExistingAsNeeded} occupiedSlots={occupiedSlots} dosageForm={selectedMedication?.dosage_form ?? dosageForm} />
          {blockedByConflict && <p role="status" className="rounded-xl bg-red-50 p-2 text-xs font-bold text-red-700">{text({ id: 'Waktu minum itu sudah punya resep obat yang sama. Ubah resep tersebut atau hapus dulu.', zh: '那個時段已經有同一顆藥的醫囑；請直接調整那一筆，或先移除它。' ,en: 'Time take itu already punya prescription medication that sama. Edit prescription tersebut or delete dulu.' })}</p>}
          {overwriteTarget && <p role="status" className="rounded-xl bg-amber-50 p-2 text-xs font-bold text-amber-900">{text({ id: 'Menyimpan akan menimpa resep lama pada waktu minum ini.', zh: '送出後會覆蓋這個時段原本的醫囑。' ,en: 'Saving will menimpa prescription lama on time take this.' })}</p>}
          <ChangeReasonField value={existingChangeReason} onChange={setExistingChangeReason} />
          <button disabled={saving || !canEditSubject || blockedByConflict} className="min-h-12 w-full rounded-xl bg-emerald-700 p-2 text-sm font-bold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:opacity-50">{editingPlanId ? text({ id: 'Simpan perubahan', zh: '儲存調整' ,en: 'Save Adjustments' }) : overwriteTarget ? text({ id: 'Timpa resep lama', zh: '覆蓋原本的醫囑' ,en: 'Timpa prescription lama' }) : text({ id: 'Tambahkan ke daftar obat', zh: '加入藥單' ,en: 'Add to menu' })}</button>
          {/* 送出結果一定要貼著按鈕顯示：原本統一放在整個區塊最下方，手機展開表單後往往要往下滑很多才看得到，
              儲存失敗時看起來就像「按了沒反應」。 */}
          {status && <p role="status" className="text-xs font-semibold text-emerald-900">{text(status)}</p>}</>}
      </form>
      </details>

  )
}

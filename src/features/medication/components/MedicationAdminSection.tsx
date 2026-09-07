/*
檔案用途：提供授權照護者新增、調整與停用個別對象藥單的表單；容器負責掛載 hook 與拼裝三個子畫面。
所在層：src/features/medication/components；由每日服藥頁在可管理藥單時掛載。
主要關聯：狀態與讀寫邏輯移到 hooks/useMedicationAdminForm，表單 UI 拆到 ExistingPlanForm／NewMedicationForm，
  兩者共用的展示元件在 MedicationAdminFormFields；資料層仍是 lib/medicationAdmin。
*/
import { useI18n } from '../../../lib/i18n'
import { formatDoseAmountLocalized, formatMedicationLabel } from '../../../lib/medications'
import { medicationSlotQuantityText, medicationSlotText } from '../../../lib/medicationSchedule'
import { MedicationAppearance } from './MedicationAppearance'
import { MedicationSnapshotNameHeading } from './MedicationNameHeading'
import { ExistingPlanForm } from './ExistingPlanForm'
import { NewMedicationForm } from './NewMedicationForm'
import { useMedicationAdminForm, withDosageForm } from '../hooks/useMedicationAdminForm'

export function MedicationAdminSection({ patientId, isOwnPatient, nameEnglishFirst = true, onMedicationPlanChanged, externalCatalogQuery, onExternalCatalogQueryConsumed }: { patientId: string; isOwnPatient: boolean; nameEnglishFirst?: boolean; onMedicationPlanChanged?: () => void; externalCatalogQuery?: string | null; onExternalCatalogQueryConsumed?: () => void }) {
  const { locale, text } = useI18n()
  const form = useMedicationAdminForm({ patientId, isOwnPatient, onMedicationPlanChanged, externalCatalogQuery, onExternalCatalogQueryConsumed })
  const {
    confirmDialog, loading, activeAccount, activePlanGroups, dailyMedicationCount, dailyQuantity,
    medicationById, saving, editingPlanId, startEditingPlan, remove,
  } = form

  return (
    <section className="mb-4 space-y-4 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
      {confirmDialog}
      <div><h2 className="text-lg font-black text-emerald-950">{text({ id: 'Kelola obat', zh: '藥單管理' ,en: 'Kelola medication' })}</h2><p className="mt-1 text-sm leading-6 text-emerald-900">{text({ id: 'Pilih obat yang sudah ada untuk ditambah atau dihapus. Isi formulir di bawah hanya untuk obat baru. Ikuti jadwal resep terbaru.', zh: '先選既有藥品加入或移除；只有新藥才需要填下方資料。舊處方的時段請以最新醫囑為準。' ,en: 'Select an existing drug to add or remove first; only new drugs need to be filled in below. Please refer to the latest medical order for the time period of the old prescription.' })}</p></div>
      {loading && <p role="status" className="rounded-lg bg-white p-3 text-xs font-semibold text-emerald-900">{text({ id: 'Memuat daftar obat…', zh: '正在讀取藥單…' ,en: 'Reading medication list...' })}</p>}
      {!loading && !activeAccount && <p role="status" className="rounded-lg bg-red-50 p-3 text-xs font-semibold text-red-700">{text({ id: 'Akun resmi untuk orang ini tidak ditemukan. Pengaturan obat dinonaktifkan demi keamanan.', zh: '找不到此對象的授權帳號，為安全起見已停用藥單調整。' ,en: 'Unable to find an authorization account for this subject, order adjustments have been disabled for security reasons.' })}</p>}
      {/* 每天總計獨立成一列，讓照護者核對整天藥盒時不必自己加總每個時段的種類與顆數。 */}
      {!loading && activePlanGroups.length > 0 && <p role="status" className="rounded-2xl border border-emerald-300 bg-white px-4 py-2.5 text-sm font-black text-emerald-950">
        {text({ id: `Total per hari: ${dailyMedicationCount} obat · ${dailyQuantity.id}`, zh: `每日總計：${dailyMedicationCount} 種藥・共 ${dailyQuantity.zh}` ,en: `Total per days: ${dailyMedicationCount} medication · ${dailyQuantity.id}` })}
      </p>}
      {activePlanGroups.length ? activePlanGroups.map(([slot, slotPlans]) => <section key={slot} className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-100/60 p-3">
        <h3 className="flex items-center justify-between gap-2 px-1 text-sm font-black text-emerald-950">
          {text(medicationSlotText(slot))}
          {/* 種類數＋總量要並列顯示，讓照護者排藥時不必逐項心算就知道這餐共要準備多少（例如鉀離子藥常見單次 2 顆）。 */}
          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-emerald-800">{text({ id: `${slotPlans.length} obat · ${medicationSlotQuantityText(withDosageForm(slotPlans, medicationById)).id}`, zh: `${slotPlans.length} 種藥・共 ${medicationSlotQuantityText(withDosageForm(slotPlans, medicationById)).zh}` ,en: `${slotPlans.length} medication · ${medicationSlotQuantityText(withDosageForm(slotPlans, medicationById)).id}` })}</span>
        </h3>
        <div className="grid gap-2">
          {slotPlans.map(plan => {
            const medication = medicationById.get(plan.medication_id)
            return <div key={plan.id} className="flex items-center justify-between gap-2 overflow-hidden rounded-xl bg-white p-3 text-xs text-gray-700">
              {/* flex-1 與 overflow-hidden 一起限制文字欄，避免巢狀外觀描述的固有寬度把操作按鈕推到畫面外。 */}
              <div className="min-w-0 flex-1 overflow-hidden">
                {medication
                  ? <MedicationSnapshotNameHeading englishName={formatMedicationLabel(medication.brand_name, medication.strength_mg, medication.strength_label)} localizedName={medication.brand_name_zh || text({ id: 'Nama merek Mandarin belum tercatat', zh: '中文商品名未登錄' ,en: 'Chinese trade name not logged in' })} englishFirst={nameEnglishFirst} />
                  : <h4 className="break-all font-black text-gray-900">{plan.medication_id}</h4>}
                {medication && <p className="mt-0.5 truncate text-gray-500">{medication.generic_name}</p>}
                {medication && <div className="mt-1"><MedicationAppearance medication={medication} compact /></div>}
                <div className="mt-2 flex flex-wrap gap-1">
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-bold text-emerald-900">{medication ? formatDoseAmountLocalized(plan.dose_amount, medication.dosage_form, locale) : plan.dose_amount}</span>
                  {plan.as_needed && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-900">{text({ id: 'Bila perlu', zh: '需要時服用' ,en: 'Bila perlu' })}</span>}
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-1"><button type="button" disabled={saving} aria-expanded={editingPlanId === plan.id} onClick={() => startEditingPlan(plan)} className={`min-h-10 rounded-xl border px-3 py-2 font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:opacity-50 ${editingPlanId === plan.id ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50'}`}>{editingPlanId === plan.id ? text({ id: 'Sedang diubah', zh: '調整中' ,en: 'Seandg diubah' }) : text({ id: 'Ubah', zh: '調整' ,en: 'Edit' })}</button><button type="button" disabled={saving} onClick={() => remove(plan)} className="min-h-10 rounded-xl border border-red-200 bg-white px-3 py-2 font-bold text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 disabled:opacity-50">{text({ id: 'Hapus', zh: '移除' ,en: 'Delete' })}</button></div>
            </div>
          })}
        </div>
      </section>) : <p role="status" className="rounded-lg border border-dashed border-emerald-300 bg-white p-3 text-xs text-emerald-900">{text({ id: 'Belum ada obat aktif. Tambahkan obat sesuai resep terbaru.', zh: '目前沒有現役藥單；請依最新醫囑加入藥品。' ,en: 'Not yet ada medication aktif. Add medication sesuai prescription terbaru.' })}</p>}

      <ExistingPlanForm form={form} nameEnglishFirst={nameEnglishFirst} />
      <NewMedicationForm form={form} />
      {/* 變更紀錄移到獨立 sub tab；管理表單只保留可執行的藥單操作，避免同頁出現兩份歷史。 */}
    </section>
  )
}

/*
檔案用途：呈現「本週藥單」分頁——唯讀掃視本週固定藥與 PRN 醫囑，點擊單一藥品開啟詳情視窗。
所在層：src/features/medication/components；由 MedicationPage 在 medicationView === 'week' 時掛載。
主要關聯：資料來自 MedicationPage 已依時段分組並排序好的 groups；文案沿用 medicationSlotText／
medicationSlotQuantityText（lib/medication/medicationSchedule）與 MedicationIntakeGuidance 匯出的
medicationIntakeGuidanceProps()，避免跟服藥打卡分頁（MedicationSlotCard）各自重算一次判斷邏輯。
*/
import { useMemo } from 'react'
import type { MedicationPlanView } from '../../../lib/medication/medications'
import { formatDoseAmountLocalized, formatMedicationLabel } from '../../../lib/medication/medications'
import { medicationSlotQuantityText, medicationSlotText } from '../../../lib/medication/medicationSchedule'
import { common, useI18n, type Locale, type LocalizedText } from '../../../lib/i18n'
import { MedicationIntakeGuidance, medicationIntakeGuidanceProps } from './MedicationIntakeGuidance'
import { MedicationNameHeading } from './MedicationNameHeading'

// 顆數摘要要按劑型分組（錠／膠囊論顆，粉劑論包，液劑論份）；medicationSlotQuantityText 需要 dosage_form，
// 這裡統一從 MedicationPlanView 帶出來，避免每個呼叫點各自重複同一段欄位對應。
const medicationQuantityInputs = (planList: readonly MedicationPlanView[]) => planList.map(plan => ({
  dose_amount: plan.dose_amount,
  dose_count: plan.dose_count,
  dosage_form: plan.medication.dosage_form,
}))

export function MedicationWeekView({
  loading,
  errorMessage,
  groups,
  prnPlans,
  locale,
  nameEnglishFirst,
  onSelectPlan,
}: {
  loading: boolean
  errorMessage: LocalizedText | null
  groups: readonly (readonly [string, MedicationPlanView[]])[]
  prnPlans: MedicationPlanView[]
  locale: Locale
  nameEnglishFirst: boolean
  onSelectPlan: (plan: MedicationPlanView) => void
}) {
  const { text } = useI18n()

  // 本週藥單每天固定套用；固定用藥的種類與顆數加總即代表每一天要核對的總量，讓照護者不必逐時段心算就能對藥盒。
  const weeklyRoutinePlans = useMemo(() => groups.flatMap(([, slotPlans]) => slotPlans), [groups])
  const weeklyMedicationCount = weeklyRoutinePlans.length
  const weeklyQuantity = useMemo(() => medicationSlotQuantityText(medicationQuantityInputs(weeklyRoutinePlans)), [weeklyRoutinePlans])

  return (
    <div id="medication-view-week-panel" role="tabpanel" aria-labelledby="medication-view-week-tab" className="space-y-4">
      <section className="rounded-3xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
        {/* 本週藥單標題與唯讀提示英文翻譯修正 */}
        <h2 className="text-lg font-black text-sky-950">{text({ id: 'Jadwal obat minggu ini', zh: '本週藥單' ,en: "This Week's Medication Schedule" })}</h2>
        <p className="mt-2 text-sm font-medium leading-6 text-sky-900">{text({ id: 'Jadwal ini berlaku setiap hari minggu ini dan hanya untuk dilihat. Ketuk nama obat untuk melihat detail.', zh: '此藥單每天固定套用，這裡僅供查看，無法在此修改。點擊藥名可查看詳情。' ,en: "This schedule applies daily this week and is view-only. Tap a medication name to view details." })}</p>
      </section>
      {loading && <p className="py-12 text-center text-base text-gray-500">{text(common.loading)}</p>}
      {/* 換病人時舊藥單會暫留畫面避免閃爍；但若這次讀取失敗，絕對不能把舊病人的藥單當成新病人的本週藥單顯示，
          否則會讓照護者或被照顧者誤看到別人的藥並準備錯藥。讀取失敗時只顯示錯誤，不顯示任何殘留藥單。 */}
      {!loading && errorMessage && <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-700">{text(errorMessage)}</p>}
      {/* 每天總計獨立成一列，放在時段列表之前，讓照護者核對整週固定藥盒時第一眼就看到當天總量。 */}
      {!loading && !errorMessage && groups.length > 0 && <p role="status" className="rounded-2xl border border-sky-300 bg-white px-4 py-2.5 text-sm font-black text-sky-950">
        {text({ id: `Total per hari: ${weeklyMedicationCount} obat · ${weeklyQuantity.id}`, zh: `每日總計：${weeklyMedicationCount} 種藥・共 ${weeklyQuantity.zh}` ,en: `Daily total: ${weeklyMedicationCount} medications · ${weeklyQuantity.en}` })}
      </p>}
      {!loading && !errorMessage && groups.length === 0 && prnPlans.length === 0 && <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-medium leading-6 text-slate-600">{text({ id: 'Belum ada jadwal obat minggu ini.', zh: '這位照護對象目前沒有本週藥單。' ,en: "No medication schedule for this individual this week." })}</p>
      </section>}
      {!loading && !errorMessage && groups.length > 0 && <div className="space-y-3">
        {groups.map(([slot, slotPlans]) => (
          <section key={slot} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="flex items-center justify-between gap-2 text-base font-black text-gray-800">
              {text(medicationSlotText(slot))}
              {/* 種類數＋總顆數要並列顯示，讓照護者不必逐項心算就知道這餐要準備幾種藥、共幾顆（例如鉀離子藥常見單次 2 顆）。 */}
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                {text({ id: `${slotPlans.length} obat · ${medicationSlotQuantityText(medicationQuantityInputs(slotPlans)).id}`, zh: `${slotPlans.length} 種藥・共 ${medicationSlotQuantityText(medicationQuantityInputs(slotPlans)).zh}` ,en: `${slotPlans.length} medications · ${medicationSlotQuantityText(medicationQuantityInputs(slotPlans)).en}` })}
              </span>
            </h3>
            {/* 每項藥品保留成獨立列，讓長品名換行時仍不會和下一項黏在一起；使用細線而非巢狀卡片維持唯讀藥單的掃讀節奏，
                但整列改成可點擊的 button 開詳情視窗，因此加上右側箭頭與 focus 樣式，避免看起來仍是純文字。 */}
            <ul className="mt-3 divide-y divide-slate-200">
              {slotPlans.map(plan => (
                <li key={plan.id}>
                  <button
                    type="button"
                    onClick={() => onSelectPlan(plan)}
                    aria-haspopup="dialog"
                    className="flex w-full items-center gap-3 py-3 text-left first:pt-0 last:pb-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 rounded-lg"
                  >
                    <span className="min-w-0 flex-1">
                      <MedicationNameHeading medication={plan.medication} locale={locale} englishFirst={nameEnglishFirst} />
                      <span className="mt-1 block text-base font-medium leading-6 text-slate-700">
                        {formatMedicationLabel(plan.medication.brand_name, plan.medication.strength_mg, plan.medication.strength_label)}
                        {' · '}{formatDoseAmountLocalized(plan.dose_amount, plan.medication.dosage_form, locale)}
                        {plan.dose_count > 1 ? ` · ${text({ id: `${plan.dose_count} pil setiap kali`, zh: `每次 ${plan.dose_count} 顆` ,en: `${plan.dose_count} pills each time` })}` : ''}
                      </span>
                      <MedicationIntakeGuidance compact {...medicationIntakeGuidanceProps(plan)} className="mt-1.5" />
                    </span>
                    <span aria-hidden="true" className="shrink-0 text-xl font-black text-slate-300">›</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>}
      {/* PRN 不在 groups 裡（groups 已把 as_needed 過濾掉），必須另外列出，
          否則被照顧者查看本週藥單時會誤以為自己沒有需要時服用的醫囑。
          切換病人時舊藥單會暫留畫面避免閃爍，讀取失敗時也一樣不能顯示殘留資料，
          因此這裡要跟固定藥清單同一套 !loading && !errorMessage 防呆，避免看到上一位病人的 PRN 醫囑。 */}
      {!loading && !errorMessage && prnPlans.length > 0 && <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-base font-black text-gray-800">{text({ id: 'Bila perlu (PRN)', zh: '需要時服用（PRN）' ,en: "As needed (PRN)" })}</h3>
        {/* PRN 也沿用固定藥的列分隔與可點擊詳情，讓唯讀藥單在不同時段仍維持同一套掃讀節奏。 */}
        <ul className="mt-3 divide-y divide-slate-200">
          {prnPlans.map(plan => (
            <li key={plan.id}>
              <button
                type="button"
                onClick={() => onSelectPlan(plan)}
                aria-haspopup="dialog"
                className="flex w-full items-center gap-3 py-3 text-left first:pt-0 last:pb-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 rounded-lg"
              >
                <span className="min-w-0 flex-1">
                  <MedicationNameHeading medication={plan.medication} locale={locale} englishFirst={nameEnglishFirst} />
                  <span className="mt-1 block text-base font-medium leading-6 text-slate-700">
                    {formatMedicationLabel(plan.medication.brand_name, plan.medication.strength_mg, plan.medication.strength_label)}
                    {' · '}{formatDoseAmountLocalized(plan.dose_amount, plan.medication.dosage_form, locale)}
                  </span>
                  <MedicationIntakeGuidance compact {...medicationIntakeGuidanceProps(plan)} className="mt-1.5" />
                </span>
                <span aria-hidden="true" className="shrink-0 text-xl font-black text-slate-300">›</span>
              </button>
            </li>
          ))}
        </ul>
      </section>}
    </div>
  )
}

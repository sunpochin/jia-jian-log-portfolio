/*
檔案用途：v2 分享頁的藥單區塊——依時段分組（需要時服用另列），每顆藥顯示品名（依語系）、學名、劑量、顆數、外觀顏色／形狀、
  資料驗證狀態、TFDA 許可證字號與服用方式代碼。完整清單、不截斷；沒有照片（ADR-009 決策三）。
所在層：src/features/care-family/components/shareSummaryV2；由 ShareSummaryV2View 掛載。
主要關聯：src/lib/shareSummaryV2Presentation.ts、src/lib/medication/medicationSchedule.ts（時段文字）、
  src/lib/medication/medications.ts（劑量單位）、medicationInstructions.ts（服用代碼文字）、
  src/features/medication/components/MedicationAppearance.tsx（顏色／形狀詞彙，不另造第二份）。
*/
import { useI18n } from '../../../../lib/i18n'
import { medicationSlotText } from '../../../../lib/medication/medicationSchedule'
import { formatDoseAmountLocalized } from '../../../../lib/medication/medications'
import { instructionCodeText } from '../../../../lib/medication/medicationInstructions'
import { medicationAppearanceColors, medicationAppearanceShapes } from '../../../medication/components/MedicationAppearance'
import type { PatientShareSummaryV2Dto, ShareSummaryV2Medication } from '../../../../lib/shareSummaryV2Dto'
import { VERIFICATION_STATUS_LABELS, groupMedicationsBySlot, medicationPrimaryName } from '../../../../lib/shareSummaryV2Presentation'
import { SHARE_V2_EMPTY_MEDICATIONS, SHARE_V2_LABELS } from '../../shareSummaryV2Copy'

const COLOR_TEXT = new Map(medicationAppearanceColors)
const SHAPE_TEXT = new Map(medicationAppearanceShapes)

function MedicationItem({ item }: { item: ShareSummaryV2Medication }) {
  const { text, locale } = useI18n()
  const primary = medicationPrimaryName(item, locale)
  const strength = item.strengthLabel ?? (item.strengthMg !== null ? `${item.strengthMg} mg` : null)
  const appearance = [
    item.appearance.color ? COLOR_TEXT.get(item.appearance.color as never) : undefined,
    item.appearance.shape ? SHAPE_TEXT.get(item.appearance.shape as never) : undefined,
  ].flatMap(label => (label ? [text(label)] : []))
  const instructions = item.instructionCodes.flatMap(code => {
    const label = instructionCodeText(code)
    return label ? [text(label)] : []
  })
  return (
    <li className="py-2 text-sm text-gray-800">
      <p>
        <span className="font-bold">{primary}</span>
        {primary !== item.displayName.brand && <span className="ml-1 text-gray-500">{item.displayName.brand}</span>}
        {strength && <span className="ml-1 text-gray-600">{strength}</span>}
        <span className="ml-1 text-gray-600">· {formatDoseAmountLocalized(item.doseAmount, item.dosageForm, locale)}{item.doseCount > 1 ? ` × ${item.doseCount}` : ''}</span>
      </p>
      <p className="text-xs text-gray-500">
        {item.displayName.generic}
        {appearance.length > 0 && ` · ${appearance.join(' · ')}`}
      </p>
      <p className="text-xs text-gray-500">
        {text(VERIFICATION_STATUS_LABELS[item.verificationStatus])}
        {item.tfdaLicenseNumber && ` · ${text(SHARE_V2_LABELS.licence)} ${item.tfdaLicenseNumber}`}
      </p>
      {instructions.length > 0 && (
        <p className="text-xs text-gray-600">{text(SHARE_V2_LABELS.howToTake)}：{instructions.join('、')}</p>
      )}
    </li>
  )
}

export function ShareSummaryMedicationSection({ medications }: { medications: PatientShareSummaryV2Dto['medications'] }) {
  const { text } = useI18n()
  const { scheduled, asNeeded } = groupMedicationsBySlot(medications.items)
  return (
    <section aria-labelledby="share-v2-med-title" className="rounded-2xl border border-gray-200 p-4 print:break-inside-avoid">
      <h2 id="share-v2-med-title" className="text-sm font-bold text-gray-800">{text(SHARE_V2_LABELS.medications)}</h2>
      {medications.items.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">{text(SHARE_V2_EMPTY_MEDICATIONS)}</p>
      ) : (
        <div className="mt-2 space-y-3">
          {scheduled.map(group => (
            <div key={group.slot}>
              <p className="text-xs font-bold text-gray-500">{text(medicationSlotText(group.slot))}</p>
              <ul className="divide-y divide-gray-100">
                {group.items.map((item, index) => <MedicationItem key={`${group.slot}-${index}`} item={item} />)}
              </ul>
            </div>
          ))}
          {asNeeded.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-500">{text(SHARE_V2_LABELS.asNeeded)}</p>
              <ul className="divide-y divide-gray-100">
                {asNeeded.map((item, index) => <MedicationItem key={`prn-${index}`} item={item} />)}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

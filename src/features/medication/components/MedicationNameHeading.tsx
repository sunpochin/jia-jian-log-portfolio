/*
檔案用途：以固定的紅色醒目樣式呈現藥物名稱（主要名稱＋次要名稱），並依偏好決定英文名或本地化名何者在前。
所在層：src/features/medication/components；服藥打卡、本週藥單、排藥、變更藥物四個分頁共用同一份名稱呈現邏輯，避免各分頁各自重寫顏色與排序判斷。
主要關聯：由 lib/medications 的 resolveMedicationNames／pairMedicationNames 提供文字；MedicationPage、MedicationHistory、MedicationAdminSection 皆可引用。
*/
import type { MedicationCatalog } from '../../../types/database'
import type { Locale } from '../../../lib/i18n'
import { useI18n } from '../../../lib/i18n'
import { pairMedicationNames, resolveMedicationNames } from '../../../lib/medications'
import { resolveMedicationCategory } from '../../../lib/medicationAtcCategories'

const SIZE_CLASSES = {
  lg: { primary: 'text-lg', secondary: 'text-sm' },
  base: { primary: 'text-base', secondary: 'text-sm' },
} as const

type MedicationNameSize = keyof typeof SIZE_CLASSES

// 低階呈現只認「主要／次要」兩段文字；變更紀錄要用歷史快照的品名（可能已跟目前藥品目錄不同），
// 因此獨立出這一層，不強迫呼叫端一定要有完整的 MedicationCatalog 物件。
export function MedicationNamePairText({ primary, secondary, category, size = 'base', className = '' }: {
  primary: string
  secondary: string | null
  // 藥效分類（例如「抗凝血藥」）：老人家最需要一眼看到的安全資訊，字級要跟藥名同級，不能淪為小字註記。
  category?: string | null
  size?: MedicationNameSize
  className?: string
}) {
  const sizeClasses = SIZE_CLASSES[size]
  return (
    <span className={`block min-w-0 ${className}`}>
      {/* 藥名是照護時最容易吃錯藥的關鍵資訊；用固定紅色與最重的字重，跟其餘一般文字明確區隔開來。 */}
      <span className={`block break-words font-black text-red-700 ${sizeClasses.primary}`}>{primary}</span>
      {/* 緊接在藥名下方、同字級呈現，並用強烈的桃紅色跟紅色藥名區隔，讓長者一眼就能看到「這是什麼作用的藥」。 */}
      {category && <span className={`block break-words font-black text-fuchsia-700 ${sizeClasses.primary}`}>{category}</span>}
      {secondary && <span className={`block break-words font-semibold text-slate-500 ${sizeClasses.secondary}`}>{secondary}</span>}
    </span>
  )
}

export function MedicationNameHeading({ medication, locale, englishFirst, size = 'base', className = '' }: {
  medication: MedicationCatalog
  locale: Locale
  englishFirst: boolean
  size?: MedicationNameSize
  className?: string
}) {
  const { text } = useI18n()
  const { primary, secondary } = resolveMedicationNames(medication, locale, englishFirst)
  const category = resolveMedicationCategory(medication.atc_code)
  return <MedicationNamePairText primary={primary} secondary={secondary} category={category ? text(category) : null} size={size} className={className} />
}

export function MedicationSnapshotNameHeading({ englishName, localizedName, englishFirst, size = 'base', className = '' }: {
  englishName: string
  localizedName: string
  englishFirst: boolean
  size?: MedicationNameSize
  className?: string
}) {
  const { primary, secondary } = pairMedicationNames(englishName, localizedName, englishFirst)
  return <MedicationNamePairText primary={primary} secondary={secondary} size={size} className={className} />
}

/*
檔案用途：把「服用方式」A 層（官方劑型提示）與 B 層（人講過的紀錄）合併呈現，並在互相矛盾時另外加警告。
所在層：src/features/medication/components；`compact` prop 切「精簡徽章／完整區塊」，四個顯示點共用同一份判斷邏輯，
避免各分頁各自重寫一份「等級 → 顏色」規則（AGENTS.md §介面元件化規範）。
主要關聯：A 層讀 src/lib/medication/medicationSwallowGuidance.ts 的 resolveSwallowGuidance()，
B 層讀 src/lib/medication/medicationInstructions.ts 的 instructionCodeText()／sourceLabelText()，
兩層是否衝突由呼叫端先呼叫 detectInstructionConflict() 算好再傳進來。
*/
import type { PatientMedicationInstruction } from '../../../types/database'
import { resolveSwallowGuidance, type SwallowGuidance } from '../../../lib/medication/medicationSwallowGuidance'
import { detectInstructionConflict, instructionCodeText, sourceLabelText } from '../../../lib/medication/medicationInstructions'
import type { MedicationPlanView } from '../../../lib/medication/medications'
import type { LocalizedText } from '../../../lib/i18n'
import { useI18n } from '../../../lib/i18n'

// 服藥打卡卡片與每週藥單都要算「A 層等級＋B 層紀錄＋是否衝突」餵給同一個 MedicationIntakeGuidance，
// 集中在這裡避免兩處各自重算一次、之後改判斷邏輯只改一處（原本重複寫在 MedicationPage 裡）。
export function medicationIntakeGuidanceProps(plan: MedicationPlanView) {
  const guidance = resolveSwallowGuidance({ officialDosageFormText: plan.medication.official_dosage_form_text, dosageForm: plan.medication.dosage_form })
  const hasConflict = detectInstructionConflict(guidance.level, plan.instruction?.instruction_codes ?? [])
  return { guidance, instruction: plan.instruction, hasConflict }
}

const SECTION_TITLE: LocalizedText = { id: 'Cara minum obat', zh: '服用方式', en: 'How to take' }
const OFFICIAL_DATA_LABEL: LocalizedText = { id: 'Menurut data resmi:', zh: '依官方資料：', en: 'Per official data:' }
const RECORDED_LABEL: LocalizedText = { id: 'Menurut catatan keluarga:', zh: '依家屬紀錄：', en: 'Per recorded instructions:' }
const NO_RECORD_TEXT: LocalizedText = { id: 'Belum ada catatan dari apoteker/dokter.', zh: '尚未有藥師／醫師交代的紀錄。', en: 'No pharmacist or doctor instructions recorded yet.' }
const CONFIRMED_ON_LABEL: LocalizedText = { id: 'Dikonfirmasi pada', zh: '交代日期', en: 'Confirmed on' }
const NOTE_LABEL: LocalizedText = { id: 'Catatan', zh: '備註', en: 'Note' }
// §2 紅線：A、B 兩層衝突時兩邊都照顯示，另外加這條警告，不靜默讓任何一邊勝出。
// 匯出給 CareHandbookPage 直接引用同一份三語文字，交接手冊列印時才不會跟畫面上的警告字句各自漂移。
export const INTAKE_CONFLICT_WARNING: LocalizedText = {
  id: 'Bentuk obat resmi dan catatan tidak konsisten, mohon konfirmasi ulang ke apoteker.',
  zh: '官方劑型與紀錄不一致，請再跟藥師確認。',
  en: 'The official dosage form and the recorded instructions disagree — please confirm with the pharmacist again.',
}
const COMPACT_CONFLICT_TEXT: LocalizedText = { id: 'Cara minum tidak konsisten, lihat detail', zh: '服用方式有衝突，請查看詳情', en: 'Conflicting intake instructions, see details' }
const COMPACT_CAUTION_TEXT: LocalizedText = { id: 'Perhatikan cara minum, lihat detail', zh: '服用方式需注意，請查看詳情', en: 'Special intake instructions, see details' }
const COMPACT_RECORD_TEXT: LocalizedText = { id: 'Ada catatan cara minum', zh: '已有服用方式紀錄', en: 'Intake instructions recorded' }

// 三個精簡徽章語氣各自要能分辨，色階沿用 VitalAlertBadge 的 alertBadgeClassName() 思路
// （700／600 色階對白字才過 WCAG AA 4.5:1）；圖示與文字同時存在，不靠顏色單獨傳遞語意。
const COMPACT_BADGE_STYLE: Record<'conflict' | 'caution' | 'record', { icon: string; className: string; text: LocalizedText }> = {
  conflict: { icon: '⚠', className: 'bg-red-600 text-white border-transparent', text: COMPACT_CONFLICT_TEXT },
  caution: { icon: '⚠', className: 'bg-orange-700 text-white border-transparent', text: COMPACT_CAUTION_TEXT },
  record: { icon: '📋', className: 'bg-sky-700 text-white border-transparent', text: COMPACT_RECORD_TEXT },
}

// 完整區塊的 A 層面板依嚴重度給不同底色；淺底色（50/200-300）搭配深文字（800/900），
// 跟既有「用途／副作用尚未提供」琥珀色面板同一種視覺語彙，跟精簡徽章的實心底色刻意不同（完整區塊要能放長句子）。
const GUIDANCE_PANEL_STYLE: Record<SwallowGuidance['severity'], { icon: string; className: string }> = {
  caution: { icon: '⚠', className: 'border-orange-300 bg-orange-50 text-orange-900' },
  unknown: { icon: '❓', className: 'border-slate-300 bg-slate-50 text-slate-800' },
  neutral: { icon: 'ℹ', className: 'border-sky-200 bg-sky-50 text-sky-900' },
}

export function MedicationIntakeGuidance({ guidance, instruction, hasConflict, compact = false, className = '' }: {
  guidance: SwallowGuidance
  instruction: PatientMedicationInstruction | null
  hasConflict: boolean
  compact?: boolean
  className?: string
}) {
  const { text } = useI18n()
  const hasInstruction = instruction != null
  // 只在「A 層需要注意」或「B 層有紀錄」時才值得長一塊；沒有這兩者代表 unknown 且沒人交代過，
  // 打卡卡片與每週藥單不需要每張都長一塊（規劃文件 §4）。
  const shouldShow = guidance.severity === 'caution' || hasInstruction
  if (compact && !shouldShow) return null

  if (compact) {
    const kind = hasConflict ? 'conflict' : guidance.severity === 'caution' ? 'caution' : 'record'
    const badge = COMPACT_BADGE_STYLE[kind]
    return (
      <span className={`inline-flex min-w-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${badge.className} ${className}`}>
        <span aria-hidden="true">{badge.icon}</span>
        {text(badge.text)}
      </span>
    )
  }

  const panel = GUIDANCE_PANEL_STYLE[guidance.severity]
  return (
    <div className={`min-w-0 space-y-3 ${className}`}>
      <h3 className="text-sm font-extrabold text-slate-950">{text(SECTION_TITLE)}</h3>

      <div className={`rounded-2xl border p-3 ${panel.className}`}>
        <p className="text-xs font-bold opacity-80">{text(OFFICIAL_DATA_LABEL)}</p>
        <p className="mt-1 flex items-start gap-2 text-sm font-semibold leading-6">
          <span aria-hidden="true">{panel.icon}</span>
          <span className="min-w-0 break-words">{text(guidance.text)}</span>
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-slate-800">
        <p className="text-xs font-bold text-slate-500">{text(RECORDED_LABEL)}</p>
        {instruction
          ? <div className="mt-1 space-y-1">
              <p className="flex flex-wrap gap-1.5">
                {instruction.instruction_codes.map(code => {
                  const codeText = instructionCodeText(code)
                  return codeText
                    ? <span key={code} className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-800">{text(codeText)}</span>
                    : null
                })}
              </p>
              <p className="text-sm font-semibold leading-6">
                {text(sourceLabelText(instruction.source))}
                {' · '}
                {text(CONFIRMED_ON_LABEL)} {instruction.confirmed_on}
              </p>
              {instruction.instruction_note && <p className="text-sm leading-6 text-slate-700">{text(NOTE_LABEL)}：{instruction.instruction_note}</p>}
            </div>
          : <p className="mt-1 text-sm font-medium leading-6">{text(NO_RECORD_TEXT)}</p>}
      </div>

      {hasConflict && <p className="flex items-start gap-2 rounded-2xl border border-red-300 bg-red-50 p-3 text-sm font-bold leading-6 text-red-900">
        <span aria-hidden="true">⚠</span>
        <span className="min-w-0 break-words">{text(INTAKE_CONFLICT_WARNING)}</span>
      </p>}
    </div>
  )
}

/*
檔案用途：血壓判讀標準模板（BP standard templates）的型別、資料載入、hard floor 守衛與門檻比對。
         每個模板是一份「完整的門檻階梯」，不是對九級表的 diff；本檔也是 src/config/bp-levels.json 與
         src/config/bp-standards/*.json 的用途說明（JSON 不能寫註解，依 code-conventions §1 補在最近的程式入口）。
所在層：src/types/database 領域規則層；純函式，不碰資料庫、不碰畫面。
主要關聯：src/types/database/bloodPressure.ts（evaluateBp／evaluateReading 消費本檔）、
         src/config/blood-pressure-spec.json（九級表，D1 凍結，general_adult 直接用這一份）、
         tests/unit/bpStandardTemplates.test.ts、docs/product/blood-pressure-standard-templates.md §3.1／§6。

三個 JSON 的分工（§6.3「抽詞彙，不抽階梯」）：
- `src/config/bp-levels.json`：等級詞彙。每個等級 key 的 zh／id／en 標籤、臨床建議與 webAlertLevel，全專案一份。
  「偏高」在每個模板都是同一個意思，所以只寫一次，三語規則（AGENTS.md §3.6）也因此只要顧一個地方。
  與九級表共用的 key（danger_high、tinggi、warning_low…）字串是從 blood-pressure-spec.json 逐字搬來的，
  由 bpStandardTemplates.test.ts 鎖住不得漂移。
- `src/config/bp-standards/*.json`：每個模板一份完整階梯，只描述「哪個數值區間對應哪個等級 key」。
- `blood-pressure-spec.json`：九級表本尊，一個字不改；general_adult 的 ladder 直接指向它（見下方 R3 註解）。
*/
import spec from '../../config/blood-pressure-spec.json'
import levels from '../../config/bp-levels.json'
import generalAdultTemplate from '../../config/bp-standards/general_adult.json'
import postOpStrictTemplate from '../../config/bp-standards/post_op_strict.json'
import elderlyRelaxedTemplate from '../../config/bp-standards/elderly_relaxed.json'
import ckdDiabetesTemplate from '../../config/bp-standards/ckd_diabetes.json'
import customTemplate from '../../config/bp-standards/custom.json'
import type { LocalizedText } from '../../lib/i18n'

// 'off-target'（超出目標）與 'below-target'（低於目標／低於參考值）是本次新增的兩個等級。
// 刻意只加兩個：收縮壓「低於目標」與舒張壓「低於參考值」共用 'below-target'，
// 由規則 key（below_target／diastolic_below_ref）產生不同標籤，沿用既有「key 決定文案、
// webAlertLevel 決定顏色」的分工，不為舒張壓再開第三個等級（規劃文件 §4.2）。
export type AlertLevel =
  | 'normal'
  | 'warning'
  | 'danger'
  | 'warning-low'
  | 'danger-low'
  | 'off-target'
  | 'below-target'

export interface BpCondition {
  gte?: number
  lt?: number
  // 將 range 的型別改為 number[]，是為了相容 TypeScript 自動解析 JSON 規格檔時推導出的陣列型別，避免編譯錯誤。
  range?: number[]
}

// 匯出此介面是為了讓前端 UI（如 InputPage 與 Dashboard）可以直接讀取匹配規則的多語狀態名稱及臨床建議動作。
export interface BpRule {
  key: string
  // 將 conditions 與 operator 設為可選，因為預設規則（defaultRule）與模板階梯展開出來的規則沒有這些欄位，
  // 如果不設為可選，TypeScript 會因為兩者屬性不重合而拋出編譯錯誤。
  conditions?: {
    systolic?: BpCondition
    diastolic?: BpCondition
  }
  operator?: string
  labels: LocalizedText
  recommendations: LocalizedText
  webAlertLevel: string
}

// 單軸階梯的一段區間；min／max 都是包含邊界（inclusive）。
// levelKey 為 null 代表「這一段刻意不標記」——例如 post_op_strict 舒張壓 60–119 落在臨床參考區間內。
// 寫成明確的一列而不是留白，是因為規劃文件特別註明「這不是漏寫」，留白會讓下一個人以為忘了填。
export interface BpBand {
  levelKey: string | null
  min?: number
  max?: number
}

export interface BpDualAxisLadder {
  kind: 'dual-axis'
  systolic: BpBand[]
  diastolic: BpBand[]
}

// general_adult 專用：ladder 不複製九級表，而是指向 blood-pressure-spec.json 本尊。
// R3（預設行為零變動）的保證強度因此是「就是同一個檔」，不是「行為相同」——規劃文件 §6.3 的對照表。
export interface BpNineLevelSpecLadder {
  kind: 'nine-level-spec'
}

export type BpLadder = BpDualAxisLadder | BpNineLevelSpecLadder

export interface BpStandard {
  key: string
  names: LocalizedText
  descriptions: LocalizedText
  ladder: BpLadder
}

export interface BpCustomBounds {
  systolicMin: number
  systolicMax: number
  diastolicMin: number
  diastolicMax: number
}

// ---------------------------------------------------------------------------
// 等級詞彙
// ---------------------------------------------------------------------------

type BpLevelDefinition = { labels: LocalizedText; recommendations: LocalizedText; webAlertLevel: string }

const LEVELS = levels as unknown as Record<string, BpLevelDefinition>

export const BP_LEVELS: Readonly<Record<string, BpLevelDefinition>> = LEVELS

// 把等級 key 展開成一條 BpRule。規則 key 直接沿用等級 key，因為呼叫端（badge 文案、報告）
// 判斷的就是「命中哪一條規則」，多開一層 ruleKey/levelKey 對照只會多一個會漂移的地方。
function ruleFromLevel(levelKey: string): BpRule {
  const level = LEVELS[levelKey]
  // 階梯資料若寫了一個詞彙表沒有的 key，這裡直接壞掉比靜默回傳「正常」好：
  // 靜默回傳正常正是本功能要消滅的那種 silent failure（該注意的讀數被漆成安全色）。
  if (!level) throw new Error(`Unknown BP level key: ${levelKey}`)
  return { key: levelKey, labels: level.labels, recommendations: level.recommendations, webAlertLevel: level.webAlertLevel }
}

// ---------------------------------------------------------------------------
// 嚴重度排序
// ---------------------------------------------------------------------------

// 視覺階梯（規劃文件 §4.2）：外框 → 實心 → 實心＋色條。off-target 與 below-target 都是外框階，
// 同屬第 1 級；warning／warning-low 是實心，第 2 級；danger／danger-low 第 3 級。
// 多軸同時命中時取「最嚴重」的那一條當主規則，任何情況下都不會往下降級。
const ALERT_LEVEL_SEVERITY: Record<string, number> = {
  normal: 0,
  'off-target': 1,
  'below-target': 1,
  warning: 2,
  'warning-low': 2,
  danger: 3,
  'danger-low': 3,
}

export function alertLevelSeverity(level: string): number {
  return ALERT_LEVEL_SEVERITY[level] ?? 0
}

// ---------------------------------------------------------------------------
// hard floor（R1）
// ---------------------------------------------------------------------------

export const BP_HARD_FLOOR = {
  dangerHighSystolic: 180,
  dangerHighDiastolic: 120,
  dangerLowSystolic: 90,
  dangerLowDiastolic: 50,
} as const

// R1：≥180/120 與 <90/50 是所有模板的 hard floor，不得被降級。
// 刻意寫在程式碼裡、不放進任何模板 JSON：模板因此在「結構上」無法表達降級，
// 而不是靠模板作者自律（規劃文件 §6.2）。
export function hardFloorRule(systolic: number, diastolic: number): BpRule | null {
  if (systolic >= BP_HARD_FLOOR.dangerHighSystolic || diastolic >= BP_HARD_FLOOR.dangerHighDiastolic) {
    return ruleFromLevel('danger_high')
  }
  if (systolic < BP_HARD_FLOOR.dangerLowSystolic || diastolic < BP_HARD_FLOOR.dangerLowDiastolic) {
    return ruleFromLevel('danger_low')
  }
  return null
}

// ---------------------------------------------------------------------------
// 九級表比對（general_adult 專用，行為與本功能之前逐字相同）
// ---------------------------------------------------------------------------

function evaluateCondition(val: number, cond?: BpCondition): boolean {
  if (!cond) return false
  if (cond.gte !== undefined && val >= cond.gte) return true
  if (cond.lt !== undefined && val < cond.lt) return true
  // 雖然將 range 的型別改為 number[] 以符合編譯，但因為商業邏輯上 range 一定是長度為 2 的陣列（[最小值, 最大值]），
  // 所以在評估時我們仍預期讀取 index 0 與 1。
  if (cond.range !== undefined && val >= cond.range[0] && val <= cond.range[1]) return true
  return false
}

function matchNineLevelSpec(sys: number, dia: number): BpRule {
  for (const rule of spec.rules) {
    // 由於從 JSON 檔案中解析出來的 rule 欄位型別較為寬鬆，故在傳入 evaluateCondition 時，
    // 需要手動轉型為 BpCondition | undefined 以配合 strict 型別檢查。
    const sysMatch = evaluateCondition(sys, rule.conditions.systolic as BpCondition | undefined)
    const diaMatch = evaluateCondition(dia, rule.conditions.diastolic as BpCondition | undefined)

    const isMatch = rule.operator === 'or'
      ? (sysMatch || diaMatch)
      : (sysMatch && diaMatch)

    if (isMatch) {
      return rule as unknown as BpRule
    }
  }
  return spec.defaultRule as unknown as BpRule
}

// ---------------------------------------------------------------------------
// 雙軸階梯比對
// ---------------------------------------------------------------------------

function matchBand(value: number, bands: BpBand[]): BpBand | null {
  for (const band of bands) {
    if (band.min !== undefined && value < band.min) continue
    if (band.max !== undefined && value > band.max) continue
    return band
  }
  return null
}

function bandRule(value: number, bands: BpBand[]): BpRule | null {
  const band = matchBand(value, bands)
  if (!band || band.levelKey === null) return null
  return ruleFromLevel(band.levelKey)
}

/**
 * 回傳這筆讀數在該標準下命中的所有規則，**收縮壓在前、舒張壓在後**。
 *
 * 為什麼回傳陣列而不是單一規則：post_op_strict 這類模板把收縮壓與舒張壓當成兩條獨立的軸，
 * 兩軸同時命中時（例如 109/56 ＝ 收縮壓低於目標 ＋ 舒張壓低於參考值）兩件事都要講，
 * 不得只顯示其中一個（規劃文件 §4.2）。標籤串接沿用 evaluateReading 既有的作法
 * （心跳警示與血壓警示同時命中時就是這樣處理的）。
 *
 * 順序刻意固定成「收縮壓先」而不是「嚴重的先」：醫囑控制的是收縮壓，照護者要先看到那一軸；
 * 顏色（level）另外取最嚴重的那一條，見 evaluateBp。
 */
export function matchBpStandardRules(systolic: number, diastolic: number, standard: BpStandard): BpRule[] {
  if (standard.ladder.kind === 'nine-level-spec') {
    // 九級表刻意**不**套用上面的 hardFloorRule，理由是 R3（預設行為零變動）而不是偷懶：
    // 九級表自己的第 1 條就是 ≥180/120、第 5 條是 <90/50，但它們之間還夾著 cukup_tinggi 與 tinggi。
    // 把 danger_low 的守衛提到最前面，會讓 140/45 從「⚠️ 偏高」變成「🔴 明顯偏低」——
    // 那是一個真正的行為變更（tests/unit/database.test.ts 的 `getAlertLevel(85, 90) === 'warning'` 就鎖住這件事）。
    // general_adult 的 floor 本來就寫在凍結的九級表裡，沒有被放寬的可能。
    return [matchNineLevelSpec(systolic, diastolic)]
  }

  // floor 先行：命中就直接回傳，模板無權降級（§6.2）。
  const floor = hardFloorRule(systolic, diastolic)
  if (floor) return [floor]

  const matches = [
    bandRule(systolic, standard.ladder.systolic),
    bandRule(diastolic, standard.ladder.diastolic),
  ].filter((rule): rule is BpRule => rule !== null)

  // 兩軸都不標記（例如 post_op_strict 的 115/70）時仍要回一條規則，否則畫面會沒有文案可顯示。
  if (matches.length === 0) return [ruleFromLevel('normal_default')]
  return matches
}

// ---------------------------------------------------------------------------
// 模板
// ---------------------------------------------------------------------------

export const GENERAL_ADULT_STANDARD = generalAdultTemplate as unknown as BpStandard
export const POST_OP_STRICT_STANDARD = postOpStrictTemplate as unknown as BpStandard
export const ELDERLY_RELAXED_STANDARD = elderlyRelaxedTemplate as unknown as BpStandard
export const CKD_DIABETES_STANDARD = ckdDiabetesTemplate as unknown as BpStandard

const CUSTOM_TEMPLATE = customTemplate as unknown as {
  key: string
  names: LocalizedText
  descriptions: LocalizedText
  ladder: { kind: 'custom-bounds'; defaultBounds: BpCustomBounds; allowedBounds: BpCustomBounds }
}

export const CUSTOM_DEFAULT_BOUNDS: BpCustomBounds = CUSTOM_TEMPLATE.ladder.defaultBounds
export const CUSTOM_ALLOWED_BOUNDS: BpCustomBounds = CUSTOM_TEMPLATE.ladder.allowedBounds

function band(levelKey: string | null, min: number, max: number): BpBand | null {
  // 目標區間把固定分界線推掉之後可能變成空區段（例如目標上界就設在 134 時，off_target 無處可放），
  // 空區段直接不產生，避免留下一條 min > max、永遠不會命中的死規則。
  if (min > max) return null
  return { levelKey, min, max }
}

function compact(bands: Array<BpBand | null>): BpBand[] {
  return bands.filter((item): item is BpBand => item !== null)
}

/**
 * 用照護者輸入的目標區間展開成一份**完整的**階梯。
 *
 * 展開發生在「建立標準」的時候，不是判讀的時候（規劃文件 §6.3：組合發生在編寫時，不是判讀時）。
 * evaluateBp 拿到的永遠是一張已經長好的表，所以 R5 的「依據：自訂 100–130」有東西可以印。
 *
 * 目標帶以外的分界（160／135／90 與 100／85／50）刻意沿用九級表既有的數字：
 * 照護者與醫師對這些數字已有既成認知，自訂的是「哪一段算達標」，不是把所有邊界重新發明一次。
 * 固定分界與目標帶重疊時，一律讓目標帶贏（用 max(...) 把固定分界推到目標上界之上），
 * 否則醫師說「壓在 95–150」時 135–150 會被判成偏高，等於使用者輸入的上界沒生效。
 */
export function createCustomStandard(bounds: BpCustomBounds = CUSTOM_DEFAULT_BOUNDS): BpStandard {
  assertCustomBounds(bounds)
  const { systolicMin, systolicMax, diastolicMin, diastolicMax } = bounds

  return {
    key: CUSTOM_TEMPLATE.key,
    names: CUSTOM_TEMPLATE.names,
    descriptions: CUSTOM_TEMPLATE.descriptions,
    ladder: {
      kind: 'dual-axis',
      systolic: compact([
        band('cukup_tinggi', Math.max(160, systolicMax + 1), 179),
        band('tinggi', Math.max(135, systolicMax + 1), 159),
        band('off_target', systolicMax + 1, 134),
        band('on_target', systolicMin, systolicMax),
        band('below_target', 100, systolicMin - 1),
        band('warning_low', 90, Math.min(99, systolicMin - 1)),
      ]),
      diastolic: compact([
        band('cukup_tinggi', Math.max(100, diastolicMax + 1), 119),
        band('tinggi', Math.max(85, diastolicMax + 1), 99),
        band('off_target', diastolicMax + 1, 84),
        // 舒張壓落在目標帶內刻意不標記：正向回饋由收縮壓那一軸的 on_target 給，
        // 兩軸都回綠色只會讓同一筆讀數出現兩個「達標」chip。
        band(null, diastolicMin, diastolicMax),
        band('diastolic_below_ref', 55, diastolicMin - 1),
        band('warning_low', 50, Math.min(54, diastolicMin - 1)),
      ]),
    },
  }
}

// 自訂目標必須落在 R1 floor 之內（收縮 90–179、舒張 50–119），且下界小於上界。
// floor 本來就在階梯之前先跑，所以越界的目標不可能把 190/125 變成正常；這裡擋的是另一件事：
// 讓「把危險值設成目標」在引擎層就是錯誤，而不是留到資料庫 CHECK（issue #897）才發現。
export function assertCustomBounds(bounds: BpCustomBounds): void {
  const { systolicMin, systolicMax, diastolicMin, diastolicMax } = bounds
  const limits = CUSTOM_ALLOWED_BOUNDS
  // 先擋非有限值與小數，順序是刻意的：NaN／undefined 參與的比較**全部**回 false，
  // 所以下面三道 range 檢查會整組靜默放行，讓壞掉的目標帶長成一張壞掉的階梯。
  // 實測後果（bounds 來自照護者輸入的解析結果，issue #897 的路徑）：
  //   systolicMax = NaN     → Math.max(160, NaN) = NaN，帶 min:NaN 的區間對任何值都成立，
  //                           110/70 被判成「🔴 明顯偏高」——無中生有的紅色警報。
  //   undefined 下界        → 110/70 顯示「🎯 在目標內」，宣告達標，但根本沒有目標帶。
  //   目標 110.5–120.5      → 整數讀數 110 掉出每一個區間，落到 normal_default 顯示「✅ 正常」，
  //                           但它其實低於目標——正是本功能要消滅的那種「把該注意的資料漆成安全色」。
  // 血壓讀數本身是整數，目標帶也只能是整數；非整數一律當成輸入錯誤，不做四捨五入猜測。
  if (![systolicMin, systolicMax, diastolicMin, diastolicMax].every(Number.isInteger)) {
    throw new Error('Custom BP bounds must be finite integers')
  }
  if (systolicMin >= systolicMax || diastolicMin >= diastolicMax) {
    throw new Error('Custom BP bounds must have min < max')
  }
  if (systolicMin < limits.systolicMin || systolicMax > limits.systolicMax) {
    throw new Error(`Custom systolic bounds must stay within ${limits.systolicMin}–${limits.systolicMax}`)
  }
  if (diastolicMin < limits.diastolicMin || diastolicMax > limits.diastolicMax) {
    throw new Error(`Custom diastolic bounds must stay within ${limits.diastolicMin}–${limits.diastolicMax}`)
  }
}

export const BP_STANDARD_KEYS = ['general_adult', 'post_op_strict', 'elderly_relaxed', 'ckd_diabetes', 'custom'] as const
export type BpStandardKey = (typeof BP_STANDARD_KEYS)[number]

const PRESET_STANDARDS: Record<Exclude<BpStandardKey, 'custom'>, BpStandard> = {
  general_adult: GENERAL_ADULT_STANDARD,
  post_op_strict: POST_OP_STRICT_STANDARD,
  elderly_relaxed: ELDERLY_RELAXED_STANDARD,
  ckd_diabetes: CKD_DIABETES_STANDARD,
}

/**
 * 依 key 取得模板。`custom` 需要照護者輸入的目標帶，所以要一併給 bounds；
 * 不給就退回 defaultBounds（設定頁還沒存過值時的暫時狀態），而不是丟例外讓畫面整個壞掉。
 * 未知 key 一律退回 general_adult：資料庫若出現本版不認得的模板 key（例如回滾到舊版），
 * 退回預設標準比丟例外安全——但不得靜默沿用「上一個病人的標準」。
 */
export function resolveBpStandard(key: string, bounds?: BpCustomBounds): BpStandard {
  if (key === 'custom') return createCustomStandard(bounds ?? CUSTOM_DEFAULT_BOUNDS)
  return PRESET_STANDARDS[key as Exclude<BpStandardKey, 'custom'>] ?? GENERAL_ADULT_STANDARD
}

/**
 * 取出這份標準的收縮壓目標帶，給 R5「依據：術後嚴格控制 110–120」的來源標示用。
 * 刻意從階梯推導而不是在 JSON 另外寫一個摘要欄位：摘要與階梯是同一件事的兩種寫法，
 * 寫兩次就會漂移，而漂移的那一份正好是印在報告上給醫師看的那一份。
 */
export function targetSystolicBand(standard: BpStandard): { min: number; max: number } | null {
  if (standard.ladder.kind !== 'dual-axis') return null
  const target = standard.ladder.systolic.find(item => item.levelKey === 'on_target')
  if (!target || target.min === undefined || target.max === undefined) return null
  return { min: target.min, max: target.max }
}

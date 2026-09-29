/*
檔案用途：定義血壓資料表型別與生命徵象判讀規則（依血壓/心跳數值與**一份判讀標準**算出警示級別與三語建議文字）。
所在層：src/types/database 領域型別層；由 src/types/database.ts 統一 re-export。
主要關聯：components、hooks 與 lib 讀寫血壓紀錄與計算警示等級時使用；
         標準（模板）定義與 hard floor 在 src/types/database/bpStandard.ts，
         general_adult 的規則資料來源仍是 src/config/blood-pressure-spec.json（D1 凍結）。
*/
import {
  alertLevelSeverity,
  matchBpStandardRules,
  type AlertLevel,
  type BpRule,
  type BpStandard,
} from './bpStandard'
import type { LocalizedText } from '../../lib/i18n'

export interface BpRecord {
  id: string
  systolic: number
  diastolic: number
  pulse: number | null
  measured_at: string
  source: string
  recorded_by: string | null
  // 血壓資料的 canonical 對象識別；舊離線快取可能沒有此欄位，所以讀取型別仍保留可空。
  patient_id: string | null
  recorded_by_user_id?: string | null
  created_at: string
}

export type BpInsert = Omit<BpRecord, 'id' | 'created_at'>

// AlertLevel／BpRule／BpCondition 與各模板常數都在 bpStandard.ts；這裡 re-export 只是維持既有 import 路徑。
export * from './bpStandard'

export interface ReadingEvaluation {
  level: AlertLevel
  labels: BpRule['labels']
  recommendations: BpRule['recommendations']
  pulseWarning: boolean
  bpRule: BpRule
  // 同一筆讀數在雙軸模板下可能同時命中收縮壓與舒張壓兩條規則（收縮壓在前）。
  // bpRule 仍是其中最嚴重的那一條（決定顏色），bpRules 是完整清單（決定要講幾件事）。
  bpRules: BpRule[]
  // R5：一切對外輸出都要標明採用哪個標準。報告、摘要與通知靠這個 key 印出「依據：術後嚴格控制」。
  standardKey: string
}

/**
 * 找出這筆讀數在指定標準下最嚴重的那一條規則。
 *
 * 第三個參數 `standard` **必填、沒有預設值**：全 repo 有 14 個呼叫點散在 10 個檔案，
 * 寫成選填會讓漏接的呼叫點照常編譯、靜默用一般成人標準，於是同一位病人的圖表、異常示警、
 * 輸入即時回饋與列印報告可以各說各話——正是 AGENTS.md §3.5 要擋下的情況（規劃文件 §6.1）。
 * R3 的相容性改由顯式常數 `GENERAL_ADULT_STANDARD`（bpStandard.ts，本檔 re-export）保證，
 * 不是靠省略參數。issue #898 已把全部呼叫點換成病人綁定的 useBpEvaluator，
 * 過渡期用的 DEFAULT_BP_STANDARD 別名因此一併移除——留著只會變成下一個靜默預設的入口。
 */
export function evaluateBp(sys: number, dia: number, standard: BpStandard): BpRule {
  const rules = matchBpStandardRules(sys, dia, standard)
  // 取最嚴重的那一條當主規則；同嚴重度時保留陣列順序（收縮壓優先），因為醫囑控制的是收縮壓。
  return rules.reduce((worst, rule) =>
    alertLevelSeverity(rule.webAlertLevel) > alertLevelSeverity(worst.webAlertLevel) ? rule : worst)
}

function joinLabels(parts: LocalizedText[]): LocalizedText {
  return {
    // 中文用全形分號、印尼文與英文用半形分號加空白，維持與既有心跳警示串接一致的排版。
    zh: parts.map(part => part.zh).join('；'),
    id: parts.map(part => part.id).join('; '),
    en: parts.map(part => part.en).join('; '),
  }
}

function joinRecommendations(parts: LocalizedText[]): LocalizedText {
  return {
    // 九級表的 `tinggi` 建議是空字串，join 前必須濾掉，否則會留下多餘空白。
    zh: parts.map(part => part.zh).filter(Boolean).join(' '),
    id: parts.map(part => part.id).filter(Boolean).join(' '),
    en: parts.map(part => part.en).filter(Boolean).join(' '),
  }
}

// Mother has a history of hypotension and osteoporosis: low diastolic risks
// myocardial infarction (coronary perfusion happens during diastole) and a
// low-BP dizzy spell risks a fall. This function used to only check the high
// side, so a reading like 85/48 silently showed "normal" — see ROADMAP.md P0.1.
// Low-side thresholds mirror the danger-low/warning-low bands in
// appscript/blood_pressure_bot_docs.md.
export function evaluateReading(
  systolic: number,
  diastolic: number,
  // pulse 從選填改成「必填但可傳 null／undefined」，純粹是 TypeScript 的限制：
  // 選填參數不能排在必填參數前面，而 standard 必須是必填（見 evaluateBp 的註解）。
  pulse: number | null | undefined,
  standard: BpStandard,
): ReadingEvaluation {
  const bpRules = matchBpStandardRules(systolic, diastolic, standard)
  const rule = evaluateBp(systolic, diastolic, standard)
  const bpLevel = rule.webAlertLevel as AlertLevel
  const pulseWarning = pulse != null && pulse > 120
  // 危險血壓必須優先於心跳警示，否則「明顯偏低 + 心跳快」會被降成一般橘色提醒。
  const level = bpLevel === 'danger' || bpLevel === 'danger-low'
    ? bpLevel
    : pulseWarning
      ? 'warning'
      : bpLevel

  // 兩軸同時命中時要把兩件事都講（例如 109/56 ＝ 收縮壓低於目標 ＋ 舒張壓低於參考值），
  // 沿用心跳警示既有的標籤串接做法，不得只顯示其中一個（規劃文件 §4.2）。
  const bpLabels = joinLabels(bpRules.map(item => item.labels))
  const bpRecommendations = joinRecommendations(bpRules.map(item => item.recommendations))

  if (!pulseWarning) {
    return { level, labels: bpLabels, recommendations: bpRecommendations, pulseWarning, bpRule: rule, bpRules, standardKey: standard.key }
  }

  const pulseLabels = { id: '⚠️ Denyut jantung >120', zh: '⚠️ 心跳 >120', en: '⚠️ Heartbeat > 120' }
  const pulseRecommendations = {
    id: 'Istirahat sebentar lalu ukur ulang; hubungi keluarga jika tetap tinggi.',
    zh: '請先休息再重測；若仍偏高，請通知家屬。',
   en: 'Rest briefly, measure again, and contact your family if it remains high.',
  }
  // 血壓本身也被標記時要同時保留兩個事實，避免報告只顯示其中一項而讓醫師誤讀。
  const hasBpFlag = bpLevel !== 'normal'
  return {
    level,
    labels: hasBpFlag ? joinLabels([bpLabels, pulseLabels]) : pulseLabels,
    recommendations: hasBpFlag ? joinRecommendations([bpRecommendations, pulseRecommendations]) : pulseRecommendations,
    pulseWarning,
    bpRule: rule,
    bpRules,
    standardKey: standard.key,
  }
}

export function getAlertLevel(
  systolic: number,
  diastolic: number,
  pulse: number | null | undefined,
  standard: BpStandard,
): AlertLevel {
  return evaluateReading(systolic, diastolic, pulse, standard).level
}

/*
檔案用途：門診頁「醫師說了什麼」與「下次」卡的純函式（照護閉環 T5，issue #949，#847 delta #9）——把已回答的
回診問題依 answered_at 與最近一筆 health_visit 做時間相近性配對、挑出下一個非藥量倒數的到期提醒，並提供就診前
摘要規則代號的三語短標籤。不連線 Supabase，只接受呼叫端已查好的資料。
所在層：src/lib 純函式業務邏輯層；由 src/features/visit/hooks/useNextVisitOverview.ts、
src/features/visit/components/VisitOutcomesSection.tsx 與 NextVisitCard.tsx 使用。
主要關聯：src/lib/visitQuestions.ts（VisitQuestion.answered_at／source_*，T1）、src/lib/careTimeline.ts
（health_visit 的 visit_* 欄位，#685）、src/lib/careDueReminders.ts（visit_department，T2）、
docs/product/care-loop-domain-model.md §3 Q3、§5。
*/
import dayjs from 'dayjs'
import type { CareDueReminder } from './careDueReminders'
import type { CareTimelineEntry } from './careTimeline'
import type { LocalizedText } from './i18n'
import type { VisitQuestion } from './visitQuestions'

export type HealthVisitSummary = Pick<CareTimelineEntry, 'id' | 'patient_id' | 'title' | 'occurred_at' | 'visit_kind' | 'visit_department' | 'visit_institution'>

export interface VisitOutcomeGroup {
  // null＝answered_at 缺（T1 之前寫的答案），或配對視窗內沒有任何可能是出處的看診（見 isOutcomeSourceCandidate）；
  // 仍要顯示，只是標「未配對到看診紀錄」，
  // 不能因為配不到就把醫師的回答藏起來。
  visit: HealthVisitSummary | null
  questions: VisitQuestion[]
}

// 為什麼是 14 天：一次回診的答案通常當天或幾天內補記；同一科每月回診的病人，14 天內不會撞到下一次看診，
// 超過就寧可標「未配對」也不要把答案掛到錯的看診上（規劃文件 Q3：時間相近性配對，不建 visit_id 外鍵）。
export const DEFAULT_OUTCOME_PAIRING_WINDOW_DAYS = 14

// 就診前摘要規則代號的短標籤，只用來標示「這筆問題是從哪種觀察來的」，不重複規則本身的觀察句。
export const PRE_VISIT_RULE_LABELS: Record<string, LocalizedText> = {
  R1: { id: 'perbandingan setelah penyesuaian obat', zh: '調藥後量測對照', en: 'comparison after a medication adjustment' },
  R2: { id: 'pengingat sisa obat', zh: '藥量倒數提醒', en: 'medication supply reminder' },
  R3: { id: 'pengingat kontrol atau ambil darah', zh: '回診／抽血提醒', en: 'follow-up or blood draw reminder' },
  R4: { id: 'arahan dokter sebelumnya', zh: '醫師指示回顧', en: 'previous doctor instruction' },
  R5: { id: 'hasil pemeriksaan lab', zh: '檢驗值', en: 'lab value' },
}

export function hasRecordedAnswer(question: Pick<VisitQuestion, 'answer'>): boolean {
  return Boolean(question.answer && question.answer.trim())
}

/** 「下次要去的」＝最接近的非藥量倒數 active 提醒；藥量倒數是領藥、不是去看醫師。已逾期的自然排在最前。 */
export function nextClinicalReminder(reminders: CareDueReminder[]): CareDueReminder | null {
  return reminders
    .filter(reminder => reminder.status === 'active' && reminder.reminder_type !== 'medication_refill')
    .sort((left, right) => left.due_date.localeCompare(right.due_date))[0] ?? null
}

// 為什麼是 2 小時：看診時間常記成預約時間，醫師可能提早看完、看護當場寫下回答，回答就會早於紀錄上的看診。
// 這個誤差大約是同一個門診時段內的提早量；再寬就會把「早上寫的回答」算給同一天晚上另一次門診
// （#984 Codex P1：原本以整個照護日為界，等於容許將近 24 小時的誤差）。
export const OUTCOME_VISIT_TIME_TOLERANCE_MINUTES = 120

function toMs(value: string | null | undefined): number {
  return value ? dayjs(value).valueOf() : Number.NaN
}

/**
 * 這次看診能不能是「這個回答的出處」（PR #981 Codex P1）。醫師的回答只可能來自已經發生的看診：
 * 時間線表單允許輸入未來日期（排定的回診），只比時間差會讓「今天寫下的回答」因為「明天那次比較近」
 * 被掛到還沒去的看診上，誤導家屬以為那次已經看過。
 *
 * 兩個條件：
 * - 看診在畫面當下（now）已經發生。排在稍晚、還沒到的看診不能有「醫師說了什麼」。
 * - 看診不晚於回答，只容許 OUTCOME_VISIT_TIME_TOLERANCE_MINUTES 的預約時間誤差。若嚴格要求看診在前，
 *   提早看完、當場寫下的回答反而會被配到十幾天前的上一次看診，比未配對更誤導。
 */
function isOutcomeSourceCandidate(visitMs: number, answeredMs: number, nowMs: number): boolean {
  if (visitMs > nowMs) return false
  return visitMs <= answeredMs + OUTCOME_VISIT_TIME_TOLERANCE_MINUTES * 60 * 1000
}

/**
 * 每筆已回答的問題，在「可能是出處」的看診中找 |answered_at − occurred_at| 最小、且在視窗內的那一筆；
 * 同距離取較早的看診。群組依看診時間降冪，未配對的一組放最後；群組內問題依 answered_at 降冪。
 * now 只給測試固定時間用，畫面一律用當下時間。
 */
export function pairAnsweredQuestionsWithVisits(
  questions: VisitQuestion[],
  visits: HealthVisitSummary[],
  options: { windowDays?: number; now?: string | number | Date } = {},
): VisitOutcomeGroup[] {
  const windowMs = (options.windowDays ?? DEFAULT_OUTCOME_PAIRING_WINDOW_DAYS) * 24 * 60 * 60 * 1000
  const nowMs = dayjs(options.now).valueOf()
  const byVisitId = new Map<string, VisitQuestion[]>()
  const unpaired: VisitQuestion[] = []

  for (const question of questions) {
    if (!hasRecordedAnswer(question)) continue
    const answeredMs = toMs(question.answered_at)
    if (!Number.isFinite(answeredMs)) { unpaired.push(question); continue }
    let best: { visit: HealthVisitSummary; distance: number } | null = null
    for (const visit of visits) {
      const visitMs = toMs(visit.occurred_at)
      if (!Number.isFinite(visitMs)) continue
      if (!isOutcomeSourceCandidate(visitMs, answeredMs, nowMs)) continue
      const distance = Math.abs(visitMs - answeredMs)
      if (distance > windowMs) continue
      if (!best || distance < best.distance || (distance === best.distance && visitMs < toMs(best.visit.occurred_at))) {
        best = { visit, distance }
      }
    }
    if (!best) { unpaired.push(question); continue }
    byVisitId.set(best.visit.id, [...(byVisitId.get(best.visit.id) ?? []), question])
  }

  const byAnsweredDesc = (left: VisitQuestion, right: VisitQuestion) => toMs(right.answered_at) - toMs(left.answered_at)
  const groups: VisitOutcomeGroup[] = visits
    .filter(visit => byVisitId.has(visit.id))
    .sort((left, right) => toMs(right.occurred_at) - toMs(left.occurred_at))
    .map(visit => ({ visit, questions: (byVisitId.get(visit.id) ?? []).sort(byAnsweredDesc) }))
  if (unpaired.length > 0) {
    // 沒有 answered_at 的舊答案用 updated_at 排序當作次佳依據；仍然不拿它去配對看診（規劃文件 Q3 的理由）。
    groups.push({ visit: null, questions: unpaired.sort((left, right) => toMs(right.answered_at ?? right.updated_at) - toMs(left.answered_at ?? left.updated_at)) })
  }
  return groups
}

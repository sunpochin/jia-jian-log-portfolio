/*
檔案用途：就診前摘要「加入問題清單」的狀態容器 hook（照護閉環 T4，issue #948，#847 delta #7）——把 R1–R5 的
「觀察＋提問」一鍵寫成一筆 patient_visit_questions（source = 'pre_visit_rule'，source_rule_id／source_entity_id
成對），並記住哪些 (規則, 來源列) 已經在清單裡，讓按鈕顯示「已在清單」而不是重複新增。
所在層：src/features/vitals/hooks；依 AGENTS.md Rule A／C 把「既有清單」讀取狀態與每個項目的寫入狀態集中在
這裡，PreVisitBriefSection 只負責畫按鈕與文案。
主要關聯：src/lib/visitQuestions.ts（createVisitQuestion／listVisitQuestions／visitQuestionSourceKey）、
src/lib/preVisitBrief.ts（PreVisitBriefItem.dedupeId 就是寫進 source_entity_id 的來源列 id）、
BloodPressureReportPanel.tsx（唯一掛載點，只在可寫路徑啟用）。
*/
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n, type Locale, type LocalizedText } from '../../../lib/i18n'
import { describeSaveError } from '../../../lib/dataErrors'
import type { PreVisitBriefItem } from '../../../lib/preVisitBrief'
import {
  createVisitQuestion,
  listVisitQuestions,
  nextSortOrder,
  visitQuestionSourceKey,
  type VisitQuestion,
} from '../../../lib/visitQuestions'

// loading：既有清單還沒回來。這段時間不能加入——sort_order 要從既有清單的最大值算，太早算會把新問題塞到最前面
// 或跟既有列交錯（Codex review PR #954 P2）。
// stale：資料庫以 23503 拒絕——這筆摘要的來源（提醒、檢驗值、醫師指示、調藥紀錄）已被刪除或不屬於這位病人。
// 重試永遠不會成功，要重新整理摘要才對，所以跟一般 error（可重試）分開，按鈕停用（2026-09-26 獨立複審）。
export type BriefAdoptionStatus = 'loading' | 'available' | 'saving' | 'added' | 'stale' | 'error'

// PreVisitBriefSection 只依賴這個最小介面，測試可以直接用假物件餵入，不必真的跑 hook。
export interface PreVisitBriefAdoption {
  statusOf: (item: Pick<PreVisitBriefItem, 'ruleId' | 'dedupeId'>) => BriefAdoptionStatus
  add: (item: PreVisitBriefItem) => void
  errorMessage: LocalizedText | null
}

// 與 migration 的 question CHECK（length(btrim(question)) BETWEEN 1 AND 500）對齊；超過就在這裡截斷，
// 不讓一筆過長的觀察文字把整個「加入」動作變成 23514。
export const VISIT_QUESTION_MAX_LENGTH = 500

const ADD_FAILED_TEXT: LocalizedText = {
  id: 'Pertanyaan gagal ditambahkan ke daftar. Coba lagi nanti.',
  zh: '無法加入問題清單，請稍後再試。',
  en: 'The question could not be added to the list. Try again later.',
}

const STALE_SOURCE_TEXT: LocalizedText = {
  id: 'Data asal item ini sudah dihapus atau berubah. Muat ulang ringkasan lalu coba lagi.',
  zh: '這一項的來源資料已被刪除或變更，請重新整理摘要後再試。',
  en: 'The source of this item was deleted or changed. Reload the brief and try again.',
}

/** 同一條規則對同一列只算一個 Concern；鍵的格式與 visitQuestionSourceKey（資料庫端 source_rule_id:source_entity_id）一致。 */
export function briefItemSourceKey(item: Pick<PreVisitBriefItem, 'ruleId' | 'dedupeId'>): string {
  return `${item.ruleId}:${item.dedupeId}`
}

/**
 * 寫進清單的問題文字＝提問＋（觀察）：清單本身不會再重算規則，沒有把「血鉀 2.8 低於參考值」這句觀察一起帶走，
 * 「這項血鉀結果是否需要追蹤？」在回診當下就少了醫師要看的那個數字。用按下當時的語系，跟範本問題
 * （VISIT_QUESTION_PRESETS 經 text() 帶入）同一個慣例。
 */
export function buildAdoptedQuestionText(item: PreVisitBriefItem, locale: Locale): string {
  const question = (item.question?.[locale] ?? '').trim()
  const observation = item.observation[locale].trim()
  const combined = locale === 'zh' ? `${question}（${observation}）` : `${question} (${observation})`
  if (combined.length <= VISIT_QUESTION_MAX_LENGTH) return combined
  return `${combined.slice(0, VISIT_QUESTION_MAX_LENGTH - 1)}…`
}

function isStaleSourceViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23503'
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505'
}

export function useAddBriefToVisitQuestions(patientId: string, options: { enabled: boolean; onAdded?: () => void }): PreVisitBriefAdoption {
  const { locale } = useI18n()
  const enabled = options.enabled
  // 成功寫入後通知掛載端（門診頁要重新讀「問什麼」「醫師說了什麼」）；用 ref 讀最新的 callback，不讓它進入 deps。
  const onAddedRef = useRef(options.onAdded)
  onAddedRef.current = options.onAdded
  // 為什麼把 patientId 一起存進狀態：切換病人後、舊病人的清單還沒被 effect 清掉的那一瞬間，statusOf 不能
  // 拿舊病人的「已在清單」去標新病人的項目（AGENTS.md § 3.5：切換照護對象後不得殘留另一人的資料）。
  const [existing, setExisting] = useState<{ patientId: string; questions: VisitQuestion[] } | null>(null)
  const [statusByKey, setStatusByKey] = useState<Record<string, BriefAdoptionStatus>>({})
  const [errorMessage, setErrorMessage] = useState<LocalizedText | null>(null)
  const activePatientIdRef = useRef(patientId)
  activePatientIdRef.current = patientId
  // 連續按兩個不同項目時，第二筆不能跟第一筆拿到同一個 sort_order：在本機先把「已配出去的下一個序號」記住，
  // 每次加入都從 max(既有最大值 + 1, 上次配出去的 + 1) 取號；切換病人時歸零。
  const allocatedOrderRef = useRef<{ patientId: string; next: number } | null>(null)

  useEffect(() => {
    setExisting(null)
    setStatusByKey({})
    setErrorMessage(null)
    allocatedOrderRef.current = null
    if (!enabled) return
    let cancelled = false
    listVisitQuestions(patientId)
      .then(rows => { if (!cancelled) setExisting({ patientId, questions: rows }) })
      .catch(error => {
        // 讀不到既有清單時仍允許新增：真正的去重由資料庫的 partial unique index 負責（23505 會在下面被當成「已在清單」）。
        console.error('[pre-visit brief adoption read error]', error)
        if (!cancelled) setExisting({ patientId, questions: [] })
      })
    return () => { cancelled = true }
  }, [enabled, patientId])

  const existingKeys = useMemo(() => {
    const questions = existing?.patientId === patientId ? existing.questions : []
    return new Set(questions.map(visitQuestionSourceKey).filter((key): key is string => key !== null))
  }, [existing, patientId])

  const listLoaded = existing?.patientId === patientId

  const statusOf = useCallback((item: Pick<PreVisitBriefItem, 'ruleId' | 'dedupeId'>): BriefAdoptionStatus => {
    const key = briefItemSourceKey(item)
    if (statusByKey[key]) return statusByKey[key]
    if (enabled && !listLoaded) return 'loading'
    return existingKeys.has(key) ? 'added' : 'available'
  }, [enabled, listLoaded, statusByKey, existingKeys])

  const add = useCallback((item: PreVisitBriefItem) => {
    // R6 只有觀察沒有提問，規劃文件 Q1 明講不會被「加入問題清單」；saving／added 期間再按也直接忽略。
    if (!enabled || !item.question) return
    const status = statusOf(item)
    if (status === 'loading' || status === 'saving' || status === 'added' || status === 'stale') return
    const key = briefItemSourceKey(item)
    const mutationPatientId = patientId
    setStatusByKey(current => ({ ...current, [key]: 'saving' }))
    setErrorMessage(null)
    const knownQuestions = existing?.patientId === mutationPatientId ? existing.questions : []
    const allocated = allocatedOrderRef.current?.patientId === mutationPatientId
      ? Math.max(nextSortOrder(knownQuestions), allocatedOrderRef.current.next)
      : nextSortOrder(knownQuestions)
    allocatedOrderRef.current = { patientId: mutationPatientId, next: allocated + 1 }
    createVisitQuestion({
      patientId: mutationPatientId,
      question: buildAdoptedQuestionText(item, locale),
      sortOrder: allocated,
      source: { ruleId: item.ruleId, entityId: item.dedupeId },
    })
      .then(saved => {
        if (activePatientIdRef.current !== mutationPatientId) return
        setExisting(current => current?.patientId === mutationPatientId
          ? { patientId: mutationPatientId, questions: [...current.questions, saved] }
          : { patientId: mutationPatientId, questions: [saved] })
        setStatusByKey(current => ({ ...current, [key]: 'added' }))
        onAddedRef.current?.()
      })
      .catch(error => {
        if (activePatientIdRef.current !== mutationPatientId) return
        if (isUniqueViolation(error)) {
          // 另一位照護者（或連點）已經先加入同一個來源：對使用者來說結果一樣是「已在清單」，不當成錯誤。
          setStatusByKey(current => ({ ...current, [key]: 'added' }))
          return
        }
        if (isStaleSourceViolation(error)) {
          setStatusByKey(current => ({ ...current, [key]: 'stale' }))
          setErrorMessage(STALE_SOURCE_TEXT)
          return
        }
        console.error('[pre-visit brief adoption create error]', error)
        setStatusByKey(current => ({ ...current, [key]: 'error' }))
        setErrorMessage(describeSaveError(error, ADD_FAILED_TEXT))
      })
  }, [enabled, existing, locale, patientId, statusOf])

  return { statusOf, add, errorMessage }
}

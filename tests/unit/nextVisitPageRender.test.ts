/*
檔案用途：驗證門診頁（NextVisitPage，照護閉環 T5，issue #949）在展示模式下能組合渲染五個區塊，寵物病人隱藏
「問什麼」「醫師說了什麼」，Google 行程只在 showSchedule 時出現，且「所有提醒」「查看軌跡」會呼叫對應 callback。
所在層：tests/unit；用 React hook harness 呼叫元件函式，不遞迴渲染巢狀元件（見 todayPageRender.test.ts 慣例），
因此不會觸發 BloodPressureReportPanel、VisitQuestionsPage 或 TrajectoryEntryForm 內部的讀取流程。
主要關聯：src/features/visit/pages/NextVisitPage.tsx、useNextVisitOverview.ts、demoStorage 的展示模式 fixture。
*/
import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { installReactHookHarness, renderHook } from './helpers/reactHookHarness'
import { findAll, findButton, fire, textContent } from './helpers/elementTree'
import { DEMO_DOG_PATIENT_ID, DEMO_MEILING_PATIENT_ID } from '../../src/lib/demoData'
import type { PatientIdentity } from '../../src/lib/auth'

installReactHookHarness()

const LOCALE_CONTEXT_VALUE = { locale: 'zh' as const, setLocale: () => {} }

const demoValues = new Map<string, string>()
const originalWindow = globalThis.window
const demoWindow = {
  location: { pathname: '/demo' },
  localStorage: {
    getItem: (key: string) => demoValues.get(key) ?? null,
    setItem: (key: string, value: string) => { demoValues.set(key, value) },
    removeItem: (key: string) => { demoValues.delete(key) },
  },
} as unknown as Window & typeof globalThis

beforeEach(() => {
  demoValues.clear()
  globalThis.window = demoWindow
})

afterAll(() => {
  if (originalWindow) globalThis.window = originalWindow
  else delete (globalThis as { window?: Window & typeof globalThis }).window
})

const { NextVisitPage } = await import('../../src/features/visit/pages/NextVisitPage')
const { NextVisitCard } = await import('../../src/features/visit/components/NextVisitCard')
const { VisitOutcomesSection } = await import('../../src/features/visit/components/VisitOutcomesSection')

const HUMAN: PatientIdentity = { patientId: DEMO_MEILING_PATIENT_ID, displayName: '展示病人', isOwnPatient: false, canManageMedication: true, careRecipientType: 'human', archivedAt: null }
const DOG: PatientIdentity = { patientId: DEMO_DOG_PATIENT_ID, displayName: '展示狗狗', isOwnPatient: false, canManageMedication: true, careRecipientType: 'dog', archivedAt: null }

function baseProps(overrides: Partial<Parameters<typeof NextVisitPage>[0]> = {}) {
  return {
    patientId: DEMO_MEILING_PATIENT_ID,
    availablePatients: [HUMAN, DOG],
    onSubjectSelect: () => {},
    userEmail: undefined,
    isDemoMode: true,
    showSchedule: false,
    onOpenReminders: () => {},
    onOpenHistory: () => {},
    ...overrides,
  }
}

// 巢狀函式元件不會被 harness 遞迴渲染；用元件名稱確認門診頁真的把它組進元素樹。
function countComponent(tree: unknown, name: string) {
  return findAll(tree, element => typeof element.type === 'function' && (element.type as { name?: string }).name === name).length
}

describe('NextVisitPage', () => {
  test('composes next / bring / ask / outcomes / after sections for a human demo patient', () => {
    const view = renderHook(() => NextVisitPage(baseProps()), { defaultContext: LOCALE_CONTEXT_VALUE })
    const rendered = textContent(view.current)
    expect(countComponent(view.current, 'TabHeader')).toBe(1)
    expect(countComponent(view.current, 'NextVisitCard')).toBe(1)
    expect(countComponent(view.current, 'ModuleTrendSection')).toBe(1)
    expect(countComponent(view.current, 'VisitQuestionsPage')).toBe(1)
    expect(countComponent(view.current, 'VisitOutcomesSection')).toBe(1)
    expect(countComponent(view.current, 'TrajectoryEntryForm')).toBe(1)
    expect(countComponent(view.current, 'UpcomingScheduleSection')).toBe(0)
    expect(rendered).toContain('問什麼')
    expect(rendered).toContain('看診後')
    view.unmount()
  })

  test('hides the question sections for a pet patient but keeps next / bring / after', () => {
    const view = renderHook(() => NextVisitPage(baseProps({ patientId: DEMO_DOG_PATIENT_ID })), { defaultContext: LOCALE_CONTEXT_VALUE })
    const rendered = textContent(view.current)
    expect(countComponent(view.current, 'NextVisitCard')).toBe(1)
    expect(countComponent(view.current, 'ModuleTrendSection')).toBe(1)
    expect(countComponent(view.current, 'VisitQuestionsPage')).toBe(0)
    expect(countComponent(view.current, 'VisitOutcomesSection')).toBe(0)
    expect(rendered).not.toContain('問什麼')
    expect(rendered).toContain('看診後')
    view.unmount()
  })

  test('wires question mutations back into the overview and the embedded checklist', () => {
    const view = renderHook(() => NextVisitPage(baseProps()), { defaultContext: LOCALE_CONTEXT_VALUE })
    const checklist = findAll(view.current, element => typeof element.type === 'function' && (element.type as { name?: string }).name === 'VisitQuestionsPage')[0]
    expect(typeof checklist.props.onChanged).toBe('function')
    expect(checklist.props.refreshKey).toBe(0)
    expect(checklist.props.embedded).toBe(true)
    view.unmount()
  })

  test('mounts the Google schedule section only for owners who can use it', () => {
    const view = renderHook(() => NextVisitPage(baseProps({ showSchedule: true })), { defaultContext: LOCALE_CONTEXT_VALUE })
    expect(countComponent(view.current, 'UpcomingScheduleSection')).toBe(1)
    view.unmount()
  })

  test('routes "view history" to the shell callback and passes "all reminders" down to the next card', () => {
    let history = 0
    const onOpenReminders = () => {}
    const view = renderHook(() => NextVisitPage(baseProps({ onOpenReminders, onOpenHistory: () => { history += 1 } })), { defaultContext: LOCALE_CONTEXT_VALUE })
    fire(findButton(view.current, '查看軌跡'), 'onClick')
    expect(history).toBe(1)
    const card = findAll(view.current, element => typeof element.type === 'function' && (element.type as { name?: string }).name === 'NextVisitCard')[0]
    expect(card.props.onOpenReminders).toBe(onOpenReminders)
    expect(card.props.demo).toBe(true)
    view.unmount()
  })
})

describe('NextVisitCard', () => {
  const base = { reminder: null, loading: false, unavailable: false, demo: false, onOpenReminders: () => {} }

  test('shows the demo, empty and unavailable states as explicit copy', () => {
    expect(textContent(renderHook(() => NextVisitCard({ ...base, demo: true }), { defaultContext: LOCALE_CONTEXT_VALUE }).current)).toContain('到期提醒目前尚未支援展示模式。')
    expect(textContent(renderHook(() => NextVisitCard(base), { defaultContext: LOCALE_CONTEXT_VALUE }).current)).toContain('目前沒有排定的回診、抽血或打針提醒。')
    expect(textContent(renderHook(() => NextVisitCard({ ...base, unavailable: true }), { defaultContext: LOCALE_CONTEXT_VALUE }).current)).toContain('提醒無法讀取')
  })

  test('renders the nearest reminder with its department badge and routes the all-reminders button', () => {
    let opened = 0
    const reminder = {
      id: 'r1', patient_id: 'p1', reminder_type: 'follow_up_visit' as const, medication_plan_id: null, days_supply: null, start_date: '2026-09-01',
      due_date: '2099-01-01', threshold_days: 7, status: 'active' as const, completed_at: null, created_by_user_id: null,
      created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z', related_entry_id: 'entry-1', related_lab_result_id: null, visit_department: '心臟內科',
    }
    const view = renderHook(() => NextVisitCard({ ...base, reminder, onOpenReminders: () => { opened += 1 } }), { defaultContext: LOCALE_CONTEXT_VALUE })
    const attention = findAll(view.current, element => typeof element.type === 'function' && (element.type as { name?: string }).name === 'AttentionItem')[0]
    expect(attention.props.title).toBe('回診')
    expect(attention.props.badge).toBe('心臟內科')
    expect(String(attention.props.description)).toContain('到期日 2099-01-01')
    fire(findButton(view.current, '所有提醒'), 'onClick')
    expect(opened).toBe(1)
    view.unmount()
  })
})

describe('VisitOutcomesSection', () => {
  const question = {
    id: 'q1', patient_id: 'p1', question: '請與醫師確認：這項血鉀結果是否需要追蹤？', answer: '三個月後再驗一次', status: 'asked' as const, asked_at: null,
    answered_at: '2026-09-10T03:00:00.000Z', source: 'pre_visit_rule' as const, source_rule_id: 'R5', source_entity_id: 'lab-1', sort_order: 1,
    created_by_user_id: 'u1', created_by_email: 'owner@example.com', created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z',
  }
  const visit = { id: 'v1', patient_id: 'p1', title: '回診', occurred_at: '2026-09-10T01:00:00.000Z', visit_kind: 'outpatient' as const, visit_department: '心臟內科', visit_institution: '示範醫院' }

  test('groups answers under the paired visit heading and labels pre-visit-brief sources', () => {
    const rendered = textContent(renderHook(() => VisitOutcomesSection({ groups: [{ visit, questions: [question] }, { visit: null, questions: [{ ...question, id: 'q2', source: 'manual' as const, source_rule_id: null, source_entity_id: null }] }], loading: false, unavailable: false, demo: false }), { defaultContext: LOCALE_CONTEXT_VALUE }).current)
    expect(rendered).toContain('醫師說了什麼')
    expect(rendered).toContain('2026-09-10 · 門診 · 心臟內科 · 示範醫院')
    expect(rendered).toContain('回答：三個月後再驗一次')
    expect(rendered).toContain('來自就診前摘要（檢驗值）')
    expect(rendered).toContain('未配對到看診紀錄')
    expect(rendered.split('來自就診前摘要').length).toBe(2)
  })

  test('prints explicit empty, unavailable and demo states', () => {
    expect(textContent(renderHook(() => VisitOutcomesSection({ groups: [], loading: false, unavailable: false, demo: false }), { defaultContext: LOCALE_CONTEXT_VALUE }).current)).toContain('還沒有記錄任何醫師的回答')
    expect(textContent(renderHook(() => VisitOutcomesSection({ groups: [], loading: false, unavailable: true, demo: false }), { defaultContext: LOCALE_CONTEXT_VALUE }).current)).toContain('回答或看診紀錄無法讀取')
    expect(textContent(renderHook(() => VisitOutcomesSection({ groups: [], loading: false, unavailable: false, demo: true }), { defaultContext: LOCALE_CONTEXT_VALUE }).current)).toContain('尚未支援展示模式')
  })
})

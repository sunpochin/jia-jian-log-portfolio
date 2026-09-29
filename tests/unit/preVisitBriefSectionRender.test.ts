/*
檔案用途：驗證就診前摘要區塊在各種項目與來源狀態下的呈現內容——免責文字、零項目固定文案、
來源不可用訊息、觀察與問題的分開呈現。
所在層：tests/unit；以最小 hook 執行環境呼叫元件函式，不啟動瀏覽器。
主要關聯：src/features/vitals/components/PreVisitBriefSection.tsx、src/lib/preVisitBrief.ts。
*/
import { describe, expect, test } from 'bun:test'
import { installReactHookHarness, renderHook } from './helpers/reactHookHarness'
import { findAll, findButton, fire, textContent } from './helpers/elementTree'
import type { PreVisitBriefItem } from '../../src/lib/preVisitBrief'
import type { PreVisitSourceStatuses } from '../../src/lib/preVisitSources'

installReactHookHarness()

const LOCALE_CONTEXT_VALUE = { locale: 'zh' as const, setLocale: () => {} }

const { PreVisitBriefSection } = await import('../../src/features/vitals/components/PreVisitBriefSection')

const OK_STATUS: PreVisitSourceStatuses = { medicationChanges: 'ok', timelineEntries: 'ok', dueReminders: 'ok' }

function render(items: PreVisitBriefItem[], sourceStatus: PreVisitSourceStatuses = OK_STATUS) {
  const view = renderHook(() => PreVisitBriefSection({ items, sourceStatus }), { defaultContext: LOCALE_CONTEXT_VALUE })
  return textContent(view.current)
}

function renderWithAdoption(items: PreVisitBriefItem[], adoption: Parameters<typeof PreVisitBriefSection>[0]['adoption']) {
  return renderHook(() => PreVisitBriefSection({ items, sourceStatus: OK_STATUS, adoption }), { defaultContext: LOCALE_CONTEXT_VALUE })
}

function item(overrides: Partial<PreVisitBriefItem> = {}): PreVisitBriefItem {
  return {
    ruleId: 'R1', priority: 2, occurredAt: '2026-07-09T00:00:00.000Z', relatedMedicationId: 'med-1', dedupeId: 'log-1',
    observation: { id: 'obs-id', zh: '觀察內容', en: 'observation content' },
    question: { id: 'Tanyakan kepada dokter: q', zh: '請與醫師確認：問題內容', en: 'Please confirm with the doctor: question content' },
    ...overrides,
  }
}

describe('PreVisitBriefSection', () => {
  test('always shows the causation disclaimer', () => {
    const rendered = render([])
    expect(rendered).toContain('就診前摘要')
    expect(rendered).toContain('就診前摘要只並列已記錄的事實與提問，不代表因果關係。')
  })

  test('prints the fixed empty-state copy instead of a generic question when there are zero items', () => {
    const rendered = render([])
    expect(rendered).toContain('區間內沒有可對照的藥單異動或逾期提醒。')
  })

  test('renders an observation paired with its confirm-with-doctor question', () => {
    const rendered = render([item()])
    expect(rendered).toContain('觀察內容')
    expect(rendered).toContain('請與醫師確認：問題內容')
  })

  test('renders an observation-only item without a question line', () => {
    const rendered = render([item({ question: null, observation: { id: 'only', zh: '只有觀察，沒有問題', en: 'observation only' } })])
    expect(rendered).toContain('只有觀察，沒有問題')
    expect(rendered).not.toContain('請與醫師確認')
  })

  // 照護閉環 T3（issue #947，#847 delta #8）：R4 與 R2／R3 各自成一個小節並標來源，R1／R5／R6 留在主清單。
  test('labels doctor-instruction items as care notes and overdue reminders as scheduled reminders', () => {
    const rendered = render([
      item({ ruleId: 'R5', priority: 1, relatedMedicationId: null, dedupeId: 'lab-1', observation: { id: 'lab', zh: '檢驗值觀察', en: 'lab observation' } }),
      item({ ruleId: 'R3', priority: 3, relatedMedicationId: null, dedupeId: 'reminder-1', observation: { id: 'r3', zh: '回診提醒逾期', en: 'follow-up overdue' } }),
      item({ ruleId: 'R4', priority: 4, relatedMedicationId: null, dedupeId: 'entry-1', observation: { id: 'r4', zh: '醫師指示回顧', en: 'instruction review' } }),
    ])
    expect(rendered).toContain('照護筆記')
    expect(rendered).toContain('來自照護紀錄的醫師指示，部分附有重新評估日期。')
    expect(rendered).toContain('排程提醒')
    expect(rendered).toContain('有明確到期日的排程提醒。')
    // 主清單先於兩個小節，小節順序固定為照護筆記 → 排程提醒，且每個項目只出現一次。
    expect(rendered.indexOf('檢驗值觀察')).toBeLessThan(rendered.indexOf('照護筆記'))
    expect(rendered.indexOf('照護筆記')).toBeLessThan(rendered.indexOf('醫師指示回顧'))
    expect(rendered.indexOf('排程提醒')).toBeLessThan(rendered.indexOf('回診提醒逾期'))
    expect(rendered.indexOf('醫師指示回顧')).toBeLessThan(rendered.indexOf('排程提醒'))
    expect(rendered.split('醫師指示回顧').length).toBe(2)
  })

  test('does not render an empty source subsection when no item belongs to it', () => {
    const rendered = render([item()])
    expect(rendered).not.toContain('照護筆記')
    expect(rendered).not.toContain('排程提醒')
  })

  test('reports which source is unavailable so items are not silently missing', () => {
    const rendered = render([], { medicationChanges: 'unavailable', timelineEntries: 'ok', dueReminders: 'ok' })
    expect(rendered).toContain('藥單異動紀錄暫時無法讀取，相關項目未計入。')
  })

  test('does not claim nothing changed when a source is unavailable but shows no items', () => {
    const rendered = render([], { medicationChanges: 'ok', timelineEntries: 'ok', dueReminders: 'unavailable' })
    expect(rendered).toContain('到期提醒暫時無法讀取，相關項目未計入。')
  })

  // 照護閉環 T4（issue #948，#847 delta #7）：只有掛了 adoption 且有提問的項目才有按鈕；列印隱藏。
  test('renders no adoption button when the section is read-only', () => {
    const view = renderHook(() => PreVisitBriefSection({ items: [item()], sourceStatus: OK_STATUS }), { defaultContext: LOCALE_CONTEXT_VALUE })
    expect(findAll(view.current, element => element.type === 'button').length).toBe(0)
  })

  test('offers an add-to-questions button per question item, hidden from print, and calls add on click', () => {
    const added: PreVisitBriefItem[] = []
    const view = renderWithAdoption(
      [item(), item({ ruleId: 'R6', dedupeId: 'coverage', question: null, observation: { id: 'cov', zh: '涵蓋率過低', en: 'coverage' } })],
      { statusOf: () => 'available', add: itemToAdd => { added.push(itemToAdd) }, errorMessage: null },
    )
    const buttons = findAll(view.current, element => element.type === 'button')
    expect(buttons.length).toBe(1)
    expect(String(buttons[0].props.className)).toContain('print-hidden')
    fire(findButton(view.current, '加入問題清單'), 'onClick')
    expect(added.map(entry => entry.dedupeId)).toEqual(['log-1'])
  })

  test('shows a stale source as a disabled button so it cannot be retried', () => {
    const view = renderWithAdoption([item()], { statusOf: () => 'stale', add: () => {}, errorMessage: null })
    expect(findButton(view.current, '來源已不存在').props.disabled).toBe(true)
  })

  test('shows already-on-the-list as a disabled button and the adoption error message', () => {
    const view = renderWithAdoption([item()], { statusOf: () => 'added', add: () => {}, errorMessage: { id: 'gagal', zh: '無法加入問題清單，請稍後再試。', en: 'failed' } })
    const button = findButton(view.current, '已在清單')
    expect(button.props.disabled).toBe(true)
    expect(textContent(view.current)).toContain('無法加入問題清單，請稍後再試。')
  })
})

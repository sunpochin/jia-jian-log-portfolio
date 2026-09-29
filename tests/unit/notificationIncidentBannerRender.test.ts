/*
檔案用途：驗證「今天」頁通知 incident 橫幅（ADR-007 票 10，issue #974，驗收第 26 項）——沒有告警時不渲染；有告警時三語顯示、
  不含數值；可結案者有「已處理」、viewer 沒有；按下去對每筆 open incident 呼叫結案；查詢失敗顯示「無法確認」而不是空白；
  以及 TodayPage 把橫幅放在頁面頂端並把能力位傳給它。
所在層：tests/unit；以 hook harness 呼叫元件函式，不啟動瀏覽器。
主要關聯：src/features/today/components/NotificationIncidentBanner.tsx、src/features/today/pages/TodayPage.tsx。
*/
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { installReactHookHarness, renderHook } from './helpers/reactHookHarness'
import { findAll, textContent } from './helpers/elementTree'
import type { NotificationDeliveryIncident } from '../../src/lib/notificationDeliveryIncidents'

installReactHookHarness()

const { NotificationIncidentBanner } = await import('../../src/features/today/components/NotificationIncidentBanner')
const todayPageSource = readFileSync(new URL('../../src/features/today/pages/TodayPage.tsx', import.meta.url), 'utf8')
const appSource = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8')

const incident = (id: string): NotificationDeliveryIncident => ({ id, alertKind: 'delivery_unknown', firstSeenAt: '2026-09-26T10:00:00.000Z', lastSeenAt: '2026-09-26T10:05:00.000Z', generation: 1 })

function render(locale: 'zh' | 'id' | 'en', props: Partial<Parameters<typeof NotificationIncidentBanner>[0]> = {}) {
  // 為什麼不 mock i18n 模組：bun 的 mock.module 是整個測試程序共用的；改用真的 useI18n，只從 harness 餵入 Provider 值（同 latestVitalsRender）。
  const view = renderHook(
    () => NotificationIncidentBanner({ incidents: [], checkFailed: false, canAcknowledge: false, acknowledgingId: null, acknowledgeFailed: false, onAcknowledge: () => {}, ...props }),
    { defaultContext: { locale, setLocale: () => {} } },
  )
  const tree = view.current
  view.unmount()
  return tree
}

describe('NotificationIncidentBanner', () => {
  test('renders nothing when there is no incident and the check succeeded', () => {
    expect(render('zh')).toBeNull()
  })

  test('shows the trilingual banner without any reading, recipient or message content, and a single acknowledge button for recorders', () => {
    for (const [locale, expected] of [['id', 'mungkin tidak sampai'], ['zh', '可能沒有送到'], ['en', 'may not have been delivered']] as const) {
      const tree = render(locale, { incidents: [incident('i1')], canAcknowledge: true })
      const text = textContent(tree)
      expect(text).toContain(expected)
      // 不含任何數值（收縮壓／舒張壓等）、email 或 external id。
      expect(text).not.toMatch(/\d{2,3}\s*\/\s*\d{2,3}|mmHg|@/)
      const buttons = findAll(tree, element => element.type === 'button')
      expect(buttons).toHaveLength(1)
    }
    // 多筆時文案改成複數，但仍不列出個別內容。
    const many = textContent(render('zh', { incidents: [incident('i1'), incident('i2')], canAcknowledge: true }))
    expect(many).toContain('有多則家人通知可能沒有送到')
  })

  test('a viewer (no can_record) sees the banner but gets no acknowledge button', () => {
    const tree = render('id', { incidents: [incident('i1')], canAcknowledge: false })
    expect(textContent(tree)).toContain('Hubungi keluarga langsung')
    expect(findAll(tree, element => element.type === 'button')).toHaveLength(0)
  })

  test('the acknowledge button clears every open incident with one tap and disables while pending', () => {
    const acknowledged: string[] = []
    const tree = render('zh', { incidents: [incident('i1'), incident('i2')], canAcknowledge: true, onAcknowledge: id => acknowledged.push(id) })
    const [button] = findAll(tree, element => element.type === 'button')
    expect(textContent(button)).toBe('已處理')
    ;(button.props.onClick as () => void)()
    expect(acknowledged).toEqual(['i1', 'i2'])
    const pending = render('zh', { incidents: [incident('i1')], canAcknowledge: true, acknowledgingId: 'i1' })
    const [pendingButton] = findAll(pending, element => element.type === 'button')
    expect(pendingButton.props.disabled).toBe(true)
    expect(textContent(pendingButton)).toBe('處理中…')
  })

  test('a failed acknowledge keeps the banner and says so; a failed check says "cannot confirm" instead of showing nothing (Fail loudly)', () => {
    const failed = textContent(render('en', { incidents: [incident('i1')], canAcknowledge: true, acknowledgeFailed: true }))
    expect(failed).toContain('Could not mark as handled')
    for (const [locale, expected] of [['id', 'Tidak dapat memastikan status notifikasi keluarga'], ['zh', '無法確認家人通知狀態'], ['en', 'Unable to confirm the family notification status']] as const) {
      const tree = render(locale, { checkFailed: true })
      expect(tree).not.toBeNull()
      expect(textContent(tree)).toContain(expected)
      expect((tree as { props: { role?: string } }).props.role).toBe('alert')
    }
  })
})

describe('TodayPage wiring', () => {
  test('mounts the banner above everything else with the patient-scoped hook and the record capability', () => {
    expect(todayPageSource).toContain('const incidents = useNotificationDeliveryIncidents(patientId)')
    expect(todayPageSource.indexOf('<NotificationIncidentBanner')).toBeLessThan(todayPageSource.indexOf('{overview.errorMessage && ('))
    expect(todayPageSource).toContain('canAcknowledge={canAcknowledgeIncidents}')
    expect(todayPageSource).toContain('checkFailed={incidents.checkFailed}')
    // App 端：care_access 且 can_record，或管理者（RPC 端仍會再驗 care_access）。
    expect(appSource).toContain("canAcknowledgeIncidents={Boolean(accessiblePatients.find(patient => patient.patientId === selectedPatientId)?.canRecord) || isAdministratorUser}")
  })
})

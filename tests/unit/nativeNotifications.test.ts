/*
檔案用途：驗證每次血壓量測保存後本機通知的識別碼契約。
所在層：tests/unit；不啟動 iOS 或請求真實通知權限，只鎖住可測的排程契約。
主要關聯：src/lib/nativeNotifications.ts、Capacitor Local Notifications 與血壓輸入流程。
*/
import { describe, expect, test } from 'bun:test'
import { nextMeasurementNotificationId } from '../../src/lib/nativeNotifications'

describe('native measurement notification', () => {
  test('uses a different safe integer id for every notification', () => {
    const first = nextMeasurementNotificationId()
    const second = nextMeasurementNotificationId()
    expect(second).not.toBe(first)
    expect(first).toBeGreaterThan(0)
    expect(second).toBeLessThanOrEqual(2_147_483_647)
  })
})

/*
檔案用途：提供 iOS／Android 原生本機通知的薄轉接，驗證每次血壓量測保存後的通知。
所在層：src/lib；由血壓輸入流程呼叫，不承載健康資料或通知設定頁。
主要關聯：使用 nativeAuth 的原生平台判定、Capacitor Local Notifications 與 App 的量測流程；
         兩個平台共用同一份 adapter，不需分別實作。
*/
import { LocalNotifications } from '@capacitor/local-notifications'
import { isNativeApp } from './nativeAuth'
import type { Locale } from './i18n'

const MEASUREMENT_SAVED_NOTIFICATION_TEXT: Record<Locale, { title: string; body: string }> = {
  zh: { title: '血壓量測已完成', body: 'iOS 本機通知測試。' }, en: { title: 'Pengukuran tekanan darah selesai', body: 'Uji notifikasi lokal iOS.' },
  id: { title: 'Pengukuran tekanan darah selesai', body: 'Uji notifikasi lokal iOS.' },
}

// iOS 通知每次都要保留，不能重用固定 id，否則連續儲存時後一則可能覆蓋前一則。
const MAX_LOCAL_NOTIFICATION_ID = 2_147_483_647
let lastMeasurementNotificationId = Date.now() % MAX_LOCAL_NOTIFICATION_ID

export function nextMeasurementNotificationId(): number {
  lastMeasurementNotificationId = lastMeasurementNotificationId >= MAX_LOCAL_NOTIFICATION_ID
    ? 1
    : lastMeasurementNotificationId + 1
  return lastMeasurementNotificationId
}

export async function notifyMeasurementSaved(locale: Locale): Promise<boolean> {
  if (!isNativeApp()) return false

  const currentPermission = await LocalNotifications.checkPermissions()
  const permission = currentPermission.display === 'granted'
    ? currentPermission
    : await LocalNotifications.requestPermissions()
  if (permission.display !== 'granted') return false

  await LocalNotifications.schedule({
    notifications: [{
      id: nextMeasurementNotificationId(),
      ...MEASUREMENT_SAVED_NOTIFICATION_TEXT[locale],
      // 測試需要在 App 內立即看見原生效果；背景時同一則通知也照常交給 iOS 呈現。
      foreground: true,
      sound: 'default',
    }],
  })
  return true
}

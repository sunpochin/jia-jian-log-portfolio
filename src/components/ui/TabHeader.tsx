/*
檔案用途：提供主要 tab 與每日照護頁內流程共用的頁首，集中顯示頁面標題與每秒更新的台北日期時間。
所在層：src/components；是純呈現元件，不保存各頁面的照護資料或切換狀態。
主要關聯：EventsPage、DailyCarePage、WeightPage 與 App 內的 SettingsPage 都透過此元件保持同一個標題列。
*/
import { type LocalizedText, useI18n } from '../../lib/i18n'

const TAB_TITLES = {
  events: { id: 'Peristiwa', zh: '事件', en: 'Events' },
  dailyCare: { id: 'Perawatan harian', zh: '每日照護', en: 'Daily care' },
  schedule: { id: 'Jadwal', zh: '行程', en: 'Schedule' },
  input: { id: 'Tekanan Darah', zh: '血壓紀錄', en: 'Blood pressure records' },
  temperature: { id: 'Suhu tubuh', zh: '體溫紀錄', en: 'Temperature records' },
  careOverview: { id: 'Ringkasan perawatan', zh: '照護總覽', en: 'Care overview' },
  medication: { id: 'Obat', zh: '服藥', en: 'Medication' },
  weight: { id: 'Catat berat badan', zh: '記錄體重', en: 'Weight records' },
  settings: { id: 'Pengaturan', zh: '設定', en: 'Settings' },
} satisfies Record<string, LocalizedText>

export type TabHeaderTitle = keyof typeof TAB_TITLES

// 頁首與底部導覽的名稱集中在同一處，新增語系或改名時不會漏掉其中一個看護每天都會碰到的入口。
export const TAB_NAV_LABELS = {
  events: { id: 'Peristiwa', zh: '事件', en: 'Events' },
  dailyCare: { id: 'Rawat', zh: '照護', en: 'Care' },
  schedule: { id: 'Jadwal', zh: '行程', en: 'Schedule' },
  settings: { id: 'Atur', zh: '設定', en: 'Settings' },
} satisfies Record<'events' | 'dailyCare' | 'schedule' | 'settings', LocalizedText>

// 時鐘已移到外殼最上方的 AppStatusBar：原本每一頁各跑一個每秒計時器，
// 等於每頁每秒重繪頁首，而照護情境沒有需要看到秒的動作。
// 頁首只負責頁名，標題因此能在窄螢幕取得整行寬度（印尼文標題明顯較長）。
export function TabHeader({ title }: { title: TabHeaderTitle }) {
  const { text } = useI18n()

  return <h1 className="min-w-0 text-2xl font-bold text-gray-900">{text(TAB_TITLES[title])}</h1>
}

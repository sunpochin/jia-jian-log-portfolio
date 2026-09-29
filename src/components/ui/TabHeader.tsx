/*
檔案用途：提供主要 tab 與每日照護頁內流程共用的頁首，集中顯示頁面標題與每秒更新的台北日期時間。
所在層：src/components；是純呈現元件，不保存各頁面的照護資料或切換狀態。
主要關聯：TrajectoryPage、DailyCarePage、WeightPage 與 App 內的 SettingsPage 都透過此元件保持同一個標題列。
*/
import { type LocalizedText, useI18n } from '../../lib/i18n'

const TAB_TITLES = {
  // B 期新增：今天頁的頁首標題與底部導覽的「今天」tab 同名，讓看護一眼確認自己在哪一頁。
  today: { id: 'Hari ini', zh: '今天', en: 'Today' },
  // D 期（issue #735）：軌跡頁取代原本的「事件」tab；沿用 events 這個 key（理由見下方 TAB_NAV_LABELS 註解），
  // 標題文字改成跟底部導覽一致的「軌跡」，讓 tabNaming.test.ts 的「導覽名稱與頁面標題共用同一個詞」規則仍然成立。
  events: { id: 'Riwayat', zh: '軌跡', en: 'History' },
  dailyCare: { id: 'Perawatan harian', zh: '每日照護', en: 'Daily care' },
  // E 期（照護閉環 T5，issue #949）：門診頁取代原本只給家庭擁有者的「行程」tab；Google 行程改成門診頁內的一個區塊。
  visit: { id: 'Kunjungan dokter', zh: '門診', en: 'Doctor visit' },
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
  // 三語短標籤依 docs/product/clinical-care-ops-ui-design.md §5：今天／記錄／軌跡／門診／設定。
  // D 期（issue #735）：events tab 的內容換成軌跡頁，標籤同步改為「軌跡」；E 期（T5）補上「門診」。
  // 沿用 events 這個 key（而非改名 trajectory）是為了不動 App.tsx 的 Tab 型別、
  // dataTutorial="tab-events" 與既有的 pwaShortcuts 分頁代號，降低本次改版的無關風險。
  today: { id: 'Hari ini', zh: '今天', en: 'Today' },
  events: { id: 'Riwayat', zh: '軌跡', en: 'History' },
  dailyCare: { id: 'Rawat', zh: '照護', en: 'Care' },
  visit: { id: 'Dokter', zh: '門診', en: 'Visit' },
  settings: { id: 'Atur', zh: '設定', en: 'Settings' },
} satisfies Record<'today' | 'events' | 'dailyCare' | 'visit' | 'settings', LocalizedText>

// 時鐘已移到外殼最上方的 AppStatusBar：原本每一頁各跑一個每秒計時器，
// 等於每頁每秒重繪頁首，而照護情境沒有需要看到秒的動作。
// 頁首只負責頁名，標題因此能在窄螢幕取得整行寬度（印尼文標題明顯較長）。
export function TabHeader({ title }: { title: TabHeaderTitle }) {
  const { text } = useI18n()

  return <h1 className="min-w-0 text-2xl font-bold text-gray-900">{text(TAB_TITLES[title])}</h1>
}

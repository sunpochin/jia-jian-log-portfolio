/*
檔案用途：集中定義展示模式教學導覽的步驟，取代先前 App.tsx 與 SettingsPage.tsx 各寫一份的重複陣列。
所在層：src/lib 共用規則層；只產生步驟資料，不渲染畫面，也不決定導覽何時開始。
主要關聯：App.tsx（首次進入展示模式自動觸發）、SettingsPage.tsx（重播入口）、
         TutorialOverlay（消費這些步驟）、demoHandoff（最後一步 CTA 的模組偏好承接）。

為什麼要有這一層：步驟原本在兩個檔案各寫一份，內容已經漂移（重播版少了承接 CTA，
設定那一步的文案也不一樣）。新增步驟時只改到其中一邊是遲早的事，所以把兩邊都會用到的
步驟集中到這裡；兩個情境真正不同的部分，用不同的 builder 明確表達，而不是靠各自複製。
*/
import type { TutorialStep } from '../components/tutorial/TutorialContext'
import type { Locale } from './i18n'
import { trackEvent } from './analytics'
import { readDailyCarePreference } from './preferences/dailyCarePreferences'
import { writeDemoModuleHandoff } from './demoHandoff'
import type { DailyCareModuleId } from './dailyCareModules'

export interface DemoTutorialDeps {
  locale: Locale
  // 用函式而不是直接傳值：CTA 可能在使用者切換照護對象之後才被按下，
  // 必須讀「按下當刻」選取的病人，不是建立步驟那一刻的。
  getActivePatientId: () => string | null
}

// 展示模式的開場白。首次自動導覽與「在展示模式裡重播」都會用到，是兩邊真正共用的第一步。
export function demoWelcomeStep(): TutorialStep {
  return {
    targetId: 'tutorial-welcome',
    title: { zh: '歡迎來到展示模式', en: 'Welcome to demo mode', id: 'Selamat datang di Mode Demo' },
    content: { zh: '這裡有虛構的長輩資料，您可以隨意點擊、新增或修改，不會影響任何真實資料。', en: 'This is fictional care data. You can click, add, or edit freely without affecting real data.', id: 'Berikut adalah data lansia fiktif. Anda dapat mengklik, menambah, atau mengubah sesuka hati tanpa memengaruhi data asli.' },
    position: 'center',
  }
}

// 每日照護分頁介紹。兩個情境的文案原本就一字不差，是最明確的重複來源。
export function dailyCareStep(): TutorialStep {
  return {
    targetId: 'tab-dailyCare',
    title: { zh: '每日照護', en: 'Daily care', id: 'Perawatan Harian' },
    content: { zh: '從這裡可以記錄長輩的血壓、體溫，或是對照藥單進行餵藥。每個項目下方都有「近期趨勢」，記錄完可以直接看變化；需要給醫師看的報告與 CSV 匯出也在血壓的近期趨勢裡。', en: 'Record blood pressure and temperature here, or give medication according to the schedule. Each section includes Recent Trends, and blood pressure reports and CSV export are available there.', id: 'Di sini Anda dapat mencatat tekanan darah, suhu tubuh, atau memberikan obat sesuai jadwal. Setiap bagian punya "Tren terkini" agar Anda bisa langsung melihat perubahannya; laporan untuk dokter dan ekspor CSV juga ada di tren tekanan darah.' },
    position: 'top',
  }
}

// 首次導覽版：重點是「等一下你會需要再看一次，它在設定頁」。
export function replayHintStep(): TutorialStep {
  return {
    targetId: 'tab-settings',
    title: { zh: '需要重新教學嗎？', en: 'Need the tutorial again?', id: 'Butuh panduan lagi?' },
    content: { zh: '如果您之後想要再看一次導覽，可以在設定頁面中找到「重播教學」按鈕。', en: 'You can replay this tour from the Replay Tutorial button on the Settings page.', id: 'Jika Anda ingin melihat panduan ini lagi nanti, Anda dapat menemukan tombol "Putar Ulang Panduan" di halaman Pengaturan.' },
    position: 'top',
  }
}

// 重播版：使用者已經在設定頁了，再叫他去設定頁找重播鈕沒有意義，所以改成介紹設定頁本身。
// 這個差異是刻意的，不是漂移，所以用兩個 builder 明確表達而不是合併成一個。
export function settingsOverviewStep(): TutorialStep {
  return {
    targetId: 'tab-settings',
    title: { zh: '設定與幫助', en: 'Settings and help', id: 'Pengaturan & Bantuan' },
    content: { zh: '您可以在設定頁面中找到「重播教學」按鈕以及其他偏好設定。', en: 'Find the Replay Tutorial button and other preferences on the Settings page.', id: 'Anda dapat menemukan tombol "Putar Ulang Panduan" dan pengaturan preferensi lainnya di halaman Pengaturan.' },
    position: 'top',
  }
}

/**
 * 導覽最後一步的承接轉換（issue #443）：試用結束不能只是「完成」就沒了下文。
 * 這裡只把剛剛試用開啟的模組組合記下來，帶使用者去登入頁；真的登入後才套用。
 * 這個中繼記錄只存模組開關 id，不會夾帶任何 demo 血壓／體溫等健康數值。
 */
export function demoHandoffCtaStep(deps: DemoTutorialDeps): TutorialStep {
  return {
    targetId: 'tutorial-cta',
    title: { zh: '準備好了嗎？', en: 'Ready to get started?', id: 'Sudah siap?' },
    content: { zh: '登入後，剛剛試用時開啟的照護項目會自動幫你設定好，不用重新選一次。', en: 'After you sign in, the care items you enabled in the demo will be applied automatically, so you do not need to choose them again.', id: 'Setelah login, item perawatan yang Anda aktifkan saat mencoba tadi akan otomatis diterapkan—tidak perlu memilih ulang.' },
    position: 'center',
    primaryActionLabel: { zh: '開始記錄我家人的', en: 'Start recording my family’s care', id: 'Mulai catat keluarga saya' },
    onPrimaryAction: () => {
      // CTA 被按下代表展示導覽真的走到最後；跳過導覽不算完成，避免漏斗被高估。
      trackEvent('tutorial_complete', { locale: deps.locale })
      const patientId = deps.getActivePatientId()
      if (patientId) {
        const state = readDailyCarePreference(patientId)
        const moduleIds = (Object.keys(state.preference) as DailyCareModuleId[]).filter(id => state.preference[id])
        writeDemoModuleHandoff({ moduleIds, useCustomTemplate: state.useCustomTemplate })
      }
      // 用 globalThis 而不是 window：這一層是純規則模組，跟 demoHandoff 一樣不假設自己跑在瀏覽器全域裡。
      globalThis.location.assign('/')
    },
  }
}

/** 首次進入 /demo 時自動觸發的完整導覽。 */
export function buildDemoTutorialSteps(deps: DemoTutorialDeps): TutorialStep[] {
  return [demoWelcomeStep(), dailyCareStep(), replayHintStep(), demoHandoffCtaStep(deps)]
}

/**
 * 設定頁「重播教學導覽」用的步驟。
 * 正式帳號也看得到這個入口，所以展示模式專屬的開場白只在 isDemoMode 時加上。
 */
export function buildReplayTutorialSteps({ isDemoMode }: { isDemoMode: boolean }): TutorialStep[] {
  const steps = [dailyCareStep(), settingsOverviewStep()]
  return isDemoMode ? [demoWelcomeStep(), ...steps] : steps
}

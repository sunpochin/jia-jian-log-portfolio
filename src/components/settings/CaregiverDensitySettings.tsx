/*
檔案用途：呈現「看護密度模式」開關——今天頁只顯示 Now 與『今天要做』的 Attention 項目，Trend 收合成一行連結。
所在層：src/components/settings；只處理可見設定控制項，不判斷角色也不保存資料。
主要關聯：由 App.tsx 的 SettingsPage 載入，讀寫 src/lib/preferences/caregiverDensityPreference.ts，套用到 TodayPage。
*/
import { useI18n, type LocalizedText } from '../../lib/i18n'

export function CaregiverDensitySettings({ enabled, onChange, saving, error, isDemoMode }: {
  enabled: boolean
  onChange: (enabled: boolean) => void | Promise<void>
  saving: boolean
  error: LocalizedText | null
  isDemoMode: boolean
}) {
  const { text } = useI18n()

  return (
    <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-4" aria-labelledby="caregiver-density-settings-title">
      <h2 id="caregiver-density-settings-title" className="font-bold text-gray-900">{text({ id: 'Mode tampilan pengasuh', zh: '看護密度模式', en: 'Caregiver density mode' })}</h2>
      <p id="caregiver-density-settings-help" className="mt-1 text-sm text-gray-500">{text({ id: 'Halaman "Hari ini" hanya menampilkan yang perlu dilakukan sekarang; grafik tren dilipat menjadi satu tautan.', zh: '「今天」頁只顯示現在要做的事；趨勢區塊會收合成一行連結。', en: 'The "Today" page shows only what needs doing right now; the trend section collapses into one link.' })}</p>
      <label htmlFor="caregiver-density-mode" className={`mt-4 flex min-h-12 items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2 text-sm ${saving ? 'cursor-wait opacity-70' : 'cursor-pointer'}`}>
        <span className="min-w-0">
          <span className="block font-semibold text-gray-900">{text({ id: 'Aktifkan tampilan ringkas untuk pengasuh', zh: '為看護開啟精簡顯示', en: 'Turn on the compact view for caregivers' })}</span>
          <span className="mt-0.5 block text-xs text-gray-500">{text({ id: 'Cocok untuk pengasuh yang hanya perlu langkah saat ini, misalnya memberi obat lalu mengukur tekanan darah.', zh: '適合只需要看「現在要做什麼」的看護，例如打卡吃藥後量血壓。', en: 'Good for a caregiver who only needs the current step, such as logging medication then measuring blood pressure.' })}</span>
        </span>
        {/* 等待資料庫回應時鎖住開關，避免網路失敗卻讓使用者以為跨裝置設定已經同步。 */}
        <input id="caregiver-density-mode" type="checkbox" checked={enabled} disabled={saving} onChange={event => void onChange(event.target.checked)} aria-describedby="caregiver-density-settings-help" className="h-5 w-5 shrink-0 accent-blue-600" />
      </label>
      <p className="mt-3 text-xs text-gray-500">{text(isDemoMode
        ? { id: 'Mode demo menyimpan pengaturan di browser ini saja.', zh: '展示模式只會把設定保存在這個瀏覽器。', en: 'Demo mode only saves settings in this browser.' }
        : { id: 'Pengaturan akun ini akan digunakan saat Anda masuk di perangkat lain.', zh: '這個帳號設定會在你登入其他裝置時套用。', en: 'These account settings will be used when you sign in on another device.' })}</p>
      {saving && <p className="mt-2 text-xs font-semibold text-blue-700">{text({ id: 'Menyimpan pengaturan…', zh: '正在儲存設定…', en: 'Saving settings...' })}</p>}
      {error && <p role="alert" className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{text(error)}</p>}
    </section>
  )
}

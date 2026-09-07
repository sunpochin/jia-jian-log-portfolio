/*
檔案用途：呈現每日服藥各餐藥卡的展開／精簡顯示設定。
所在層：src/components/settings；只處理可見設定控制項，不保存資料或操作服藥紀錄。
主要關聯：由 App.tsx 的 SettingsPage 載入，透過 MedicationPage 套用到每日照護頁。
*/
import { useI18n, type LocalizedText } from '../../lib/i18n'

export function MedicationDisplaySettings({ slotsExpanded, onChange, saving, error, nameEnglishFirst, onChangeNameEnglishFirst, nameSettingsSaving, nameSettingsError, isDemoMode }: {
  slotsExpanded: boolean
  onChange: (expanded: boolean) => void | Promise<void>
  saving: boolean
  error: LocalizedText | null
  nameEnglishFirst: boolean
  onChangeNameEnglishFirst: (englishFirst: boolean) => void | Promise<void>
  nameSettingsSaving: boolean
  nameSettingsError: LocalizedText | null
  isDemoMode: boolean
}) {
  const { text } = useI18n()

  return (
    <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-4" aria-labelledby="medication-display-settings-title">
      <h2 id="medication-display-settings-title" className="font-bold text-gray-900">{text({ id: 'Tampilan obat', zh: '服藥顯示方式', en: 'Dosing Display' })}</h2>
      <p id="medication-display-settings-help" className="mt-1 text-sm text-gray-500">{text({ id: 'Pilih apakah semua obat pada setiap waktu makan langsung terlihat.', zh: '選擇每個用餐時段的藥物是否直接顯示。', en: 'Choose whether all medications for each meal should be shown immediately.' })}</p>
      <label htmlFor="medication-slots-expanded" className={`mt-4 flex min-h-12 items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2 text-sm ${saving ? 'cursor-wait opacity-70' : 'cursor-pointer'}`}>
        <span className="min-w-0">
          <span className="block font-semibold text-gray-900">{text({ id: 'Buka obat setiap waktu makan', zh: '每餐直接展開藥物', en: 'Medication unfolds directly at each meal' })}</span>
          <span className="mt-0.5 block text-xs text-gray-500">{text({ id: 'Anda tetap dapat menutup satu waktu makan bila perlu.', zh: '需要時仍可自行收合單一餐次。', en: 'You can still collapse an individual meal when needed.' })}</span>
        </span>
        {/* 等待資料庫回應時鎖住開關，避免網路失敗卻讓使用者以為跨裝置設定已經同步。 */}
        <input id="medication-slots-expanded" type="checkbox" checked={slotsExpanded} disabled={saving} onChange={event => void onChange(event.target.checked)} aria-describedby="medication-display-settings-help" className="h-5 w-5 shrink-0 accent-blue-600" />
      </label>
      <p className="mt-3 text-xs text-gray-500">{text(isDemoMode
        ? { id: 'Mode demo menyimpan pengaturan di browser ini saja.', zh: '展示模式只會把設定保存在這個瀏覽器。', en: 'Display mode will only save settings in this browser.' }
        : slotsExpanded
          ? { id: 'Pengaturan akun ini akan digunakan saat Anda masuk di perangkat lain.', zh: '這個帳號設定會在你登入其他裝置時套用。', en: 'These account settings will be used when you sign in on another device.' }
          : { id: 'Tampilan ringkas tersimpan di akun ini dan akan mengikuti Anda ke perangkat lain.', zh: '精簡顯示會儲存在這個帳號，其他裝置也會跟著使用。', en: 'The compact display setting is saved to this account and follows you to other devices.' })}</p>
      {saving && <p className="mt-2 text-xs font-semibold text-blue-700">{text({ id: 'Menyimpan pengaturan…', zh: '正在儲存設定…', en: 'Saving settings...' })}</p>}
      {error && <p role="alert" className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{text(error)}</p>}

      {/* 藥名優先語言是獨立的一組帳號設定，跟「每餐是否展開」互不影響，因此分開儲存與顯示各自的儲存狀態。 */}
      <label htmlFor="medication-name-english-first" className={`mt-4 flex min-h-12 items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2 text-sm ${nameSettingsSaving ? 'cursor-wait opacity-70' : 'cursor-pointer'}`}>
        <span className="min-w-0">
          <span className="block font-semibold text-gray-900">{text({ id: 'Utamakan nama obat berbahasa Inggris', zh: '藥名優先顯示英文商品名' ,en: 'Prefer English medication names' })}</span>
          <span className="mt-0.5 block text-xs text-gray-500">{text({ id: 'Memudahkan pengasuh asing mencocokkan nama di kemasan obat.', zh: '方便外籍看護對照藥品包裝上的英文名稱。' ,en: 'This helps non-Chinese-speaking caregivers match names on medication packaging.' })}</span>
        </span>
        <input id="medication-name-english-first" type="checkbox" checked={nameEnglishFirst} disabled={nameSettingsSaving} onChange={event => void onChangeNameEnglishFirst(event.target.checked)} className="h-5 w-5 shrink-0 accent-blue-600" />
      </label>
      {nameSettingsSaving && <p className="mt-2 text-xs font-semibold text-blue-700">{text({ id: 'Menyimpan pengaturan…', zh: '正在儲存設定…' ,en: 'Saving settings...' })}</p>}
      {nameSettingsError && <p role="alert" className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{text(nameSettingsError)}</p>}
    </section>
  )
}

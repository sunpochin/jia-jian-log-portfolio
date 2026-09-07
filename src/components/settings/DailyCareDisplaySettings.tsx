/*
檔案用途：讓使用者選擇目前被照護者的每日照護頁要顯示哪些功能，並可切換「依物種自動判斷」或「自訂範本」。
所在層：src/components/settings；只負責呈現控制項，不直接寫入資料庫。
主要關聯：SettingsPage、dailyCareModules、dailyCarePreferences 與 App.tsx；DailyCarePage 的「自訂顯示」捷徑透過 DAILY_CARE_DISPLAY_SETTINGS_ANCHOR 導回這張卡。
*/
import { useEffect } from 'react'
import { useI18n, type LocalizedText } from '../../lib/i18n'
import { DAILY_CARE_DISPLAY_SETTINGS_ANCHOR, DAILY_CARE_MODULES, isModuleApplicableToSpecies, type DailyCareModuleId, type DailyCareVisibilityPreference } from '../../lib/dailyCareModules'

const MODULE_HELP: Record<DailyCareModuleId, LocalizedText> = {
  bloodPressure: { id: 'Catat tekanan darah dan denyut nadi.', zh: '記錄血壓與心跳。' ,en: 'Record blood pressure and heart rate.' },
  temperature: { id: 'Catat suhu tubuh dan lokasi pengukuran.', zh: '記錄體溫與量測部位。' ,en: 'Record body temperature and the measurement site.' },
  medication: { id: 'Lihat dan catat obat harian.', zh: '查看並記錄每日服藥。' ,en: 'Review and record daily medications.' },
  nutrition: { id: 'Catat makanan dan kalori.', zh: '記錄飲食與熱量。' ,en: 'Record food and calories.' },
  weight: { id: 'Catat berat badan harian.', zh: '記錄每日體重。' ,en: 'Record daily weight.' },
  petLiquidIntake: { id: 'Catat asupan cairan, air seni, dan frekuensi kotoran.', zh: '記錄飲水量、排尿與貓砂尿塊數。' ,en: 'Record fluid intake, urine output, and litter-box clump count.' },
  petDigestion: { id: 'Catat muntah, feses, dan skor kesehatan pencernaan.', zh: '記錄嘔吐、排便次數與糞便型態評分。' ,en: 'Record vomiting, bowel movements, and stool health scores.' },
  petAppetite: { id: 'Catat persentase nafsu makan pada setiap kali makan.', zh: '記錄每餐進食比例。' ,en: 'Record the percentage eaten at each meal.' },
  petFluidTherapy: { id: 'Catat volume dan jadwal terapi cairan subkutan.', zh: '記錄皮下液體療法的毫升數與頻率。' ,en: 'Record subcutaneous fluid volume and schedule.' },
  petEndocrine: { id: 'Catat insulin, kadar glukosa darah, dan tren endokrin.', zh: '記錄胰島素單位、血糖值與內分泌監測。' ,en: 'Record insulin, blood glucose, and endocrine trends.' },
  dementiaCare: { id: 'Catat periode gelisah, pola siang-malam terbalik, dan risiko tersesat.', zh: '記錄躁動時段、日夜顛倒模式與走失風險。' ,en: 'Record agitation periods, reversed day-night patterns, and wandering risk.' },
  fluidBalance: { id: 'Catat asupan makanan (gram), minum air, urine, dan buang air besar (untuk perawatan pasca operasi).', zh: '記錄便當攝取公克數、喝水量、尿量與大便次數（適用術後照護）。' ,en: 'Record food intake in grams, water intake, urine output, and bowel movements for post-operative care.' },
  careReminders: { id: 'Hitung mundur sisa obat dan pengingat kunjungan, tes darah, suntikan, atau vaksin.', zh: '藥量倒數，以及回診、抽血、打針或疫苗到期提醒。', en: 'Count down medication supply and remind about visits, blood draws, injections, or vaccines.' },
}

export function DailyCareDisplaySettings({ preference, onChange, saving, error, isDemoMode, canUseMedication, useCustomTemplate, onToggleCustomTemplate, careRecipientType }: {
  preference: DailyCareVisibilityPreference
  onChange: (moduleId: DailyCareModuleId, enabled: boolean) => void | Promise<void>
  saving: boolean
  error: LocalizedText | null
  isDemoMode: boolean
  canUseMedication: boolean
  useCustomTemplate: boolean
  onToggleCustomTemplate: (enabled: boolean) => void | Promise<void>
  careRecipientType?: string
}) {
  const { text } = useI18n()

  useEffect(() => {
    // 從每日照護頁的捷徑點進來時，把這張卡捲進畫面並清掉錨點，避免下次進設定頁又誤觸發捲動。
    if (window.location.hash !== `#${DAILY_CARE_DISPLAY_SETTINGS_ANCHOR}`) return
    document.getElementById('daily-care-display-settings-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    history.replaceState(null, '', window.location.pathname + window.location.search)
  }, [])

  // 依物種模式下，不符合這個物種的項目直接不顯示勾選格——之前會列出貓咪也能勾「血壓」，
  // 但勾了在每日照護頁完全不會出現，看起來像設定沒生效。自訂範本則不受物種限制，全部項目都能勾選。
  const visibleModules = useCustomTemplate
    ? DAILY_CARE_MODULES
    : DAILY_CARE_MODULES.filter(module => isModuleApplicableToSpecies(module, careRecipientType))

  return (
    <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-4" aria-labelledby="daily-care-display-settings-title">
      <h2 id="daily-care-display-settings-title" className="font-bold text-gray-900">{text({ id: 'Tampilan perawatan harian', zh: '每日照護顯示' ,en: 'Daily Care Display' })}</h2>
      <p id="daily-care-display-settings-help" className="mt-1 text-sm text-gray-500">{text({ id: 'Pilih fitur yang ingin Anda lihat untuk orang yang sedang dipilih.', zh: '選擇目前這位被照護者要顯示的功能。' ,en: 'Choose which features to show for the selected care recipient.' })}</p>

      <label htmlFor="daily-care-custom-template" className={`mt-4 flex min-h-12 items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm ${saving ? 'cursor-wait' : 'cursor-pointer'}`}>
        <span className="min-w-0">
          <span className="block font-semibold text-indigo-900">{text({ id: 'Template khusus (abaikan jenis hewan)', zh: '自訂範本（不受物種限制）' ,en: 'Custom template (ignore species)' })}</span>
          {/* bird 是獨立物種；在自動模式提示中列出它，避免照護者以為只能選「其他」。 */}
          <span className="mt-0.5 block text-xs text-indigo-700">{text({ id: 'Nonaktif: item otomatis mengikuti jenis (manusia/kucing/anjing/burung/kelinci/hewan lain). Aktif: pilih sendiri semua item.', zh: '關閉時依照物種（人類／貓／狗／鳥／兔子／其他寵物）自動判斷；開啟後可自行勾選全部項目，不受物種限制。' ,en: 'Off: items follow the species (human, cat, dog, bird, rabbit, or other pet). On: choose every item yourself.' })}</span>
        </span>
        <input
          id="daily-care-custom-template"
          type="checkbox"
          checked={useCustomTemplate}
          disabled={saving}
          onChange={event => void onToggleCustomTemplate(event.target.checked)}
          className="h-5 w-5 shrink-0 accent-indigo-600"
        />
      </label>

      <div className="mt-4 space-y-2">
        {visibleModules.map(module => {
          const permissionLocked = module.id === 'medication' && !canUseMedication
          const lockedText = { id: 'Dibatasi oleh akses obat', zh: '由服藥權限控制' ,en: 'Controlled by medication access' }
          return (
            <label key={module.id} htmlFor={`daily-care-setting-${module.id}`} className={`flex min-h-12 items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm ${permissionLocked ? 'bg-gray-100 opacity-70' : 'bg-gray-50'} ${saving ? 'cursor-wait' : permissionLocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
              <span className="min-w-0">
                <span className="block font-semibold text-gray-900">{text(module.label)}</span>
                <span className="mt-0.5 block text-xs text-gray-500">{text(permissionLocked ? lockedText : MODULE_HELP[module.id])}</span>
              </span>
              <input
                id={`daily-care-setting-${module.id}`}
                type="checkbox"
                checked={preference[module.id]}
                disabled={saving || permissionLocked}
                onChange={event => void onChange(module.id, event.target.checked)}
                aria-describedby="daily-care-display-settings-help"
                className="h-5 w-5 shrink-0 accent-indigo-600"
              />
            </label>
          )
        })}
      </div>
      <p className="mt-3 text-xs text-gray-500">{text(isDemoMode
        ? { id: 'Mode demo menyimpan pengaturan untuk setiap orang di browser ini saja.', zh: '展示模式會把每位被照護者的設定保存在這個瀏覽器。' ,en: 'Display mode saves each care recipient’s settings in this browser.' }
        : { id: 'Pengaturan ini dibagikan kepada pengasuh yang berwenang untuk orang ini; catatan and access not changed.', zh: '這會同步給這位被照顧者的其他授權照護者；不會刪除紀錄或改變權限。' ,en: 'These settings are shared with authorized caregivers for this person; records and access are unchanged.' })}</p>
      {saving && <p className="mt-2 text-xs font-semibold text-indigo-700">{text({ id: 'Menyimpan pengaturan…', zh: '正在儲存設定…' ,en: 'Saving settings...' })}</p>}
      {error && <p role="alert" className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{text(error)}</p>}
    </section>
  )
}

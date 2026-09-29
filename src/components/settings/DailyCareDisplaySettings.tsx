/*
檔案用途：讓使用者選擇目前被照護者的每日照護頁要顯示哪些功能，並可切換「依物種自動判斷」或「自訂範本」。
所在層：src/components/settings；只負責呈現控制項，不直接寫入資料庫。
主要關聯：SettingsPage、dailyCareModules、dailyCarePreferences 與 App.tsx；DailyCarePage 的「自訂顯示」捷徑、以及「今天」頁在目標模組被關閉時的一步操作（見 issue #752），都透過 parseDailyCareDisplaySettingsHash 導回這張卡並可指名要高亮的模組。
*/
import { useEffect, useState } from 'react'
import { useI18n, type LocalizedText } from '../../lib/i18n'
import { DAILY_CARE_MODULES, isModuleApplicableToSpecies, parseDailyCareDisplaySettingsHash, type DailyCareModuleId, type DailyCareVisibilityPreference } from '../../lib/dailyCareModules'

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
  visitQuestions: { id: 'Kumpulkan pertanyaan sebelum kontrol dan catat jawaban dokter.', zh: '回診前累積問題，看診時記下醫師的回答。', en: 'Collect questions before a visit and record the doctor’s answers.' },
  labResults: { id: 'Catat hasil lab (K/Na/Cr/eGFR/HbA1c/GLU/Hb) dan rentang referensi laporan.', zh: '記錄檢驗值（K／Na／Cr／eGFR／HbA1c／GLU／Hb）與該筆報告的參考值。', en: 'Record lab results (K/Na/Cr/eGFR/HbA1c/GLU/Hb) and the report’s reference range.' },
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
  // 「今天」頁在目標模組被病人關閉時會帶著 `:moduleId` 導來這裡（issue #752）；記下來才能捲到
  // 那一列並顯示原因，而不是只捲到卡片標題讓使用者自己在一長串清單裡找。
  const [highlightModuleId, setHighlightModuleId] = useState<DailyCareModuleId | null>(null)

  useEffect(() => {
    // 從每日照護頁的捷徑、或「今天」頁的一步操作點進來時，把這張卡捲進畫面並清掉錨點，
    // 避免下次進設定頁又誤觸發捲動。
    const { isAnchor, moduleId } = parseDailyCareDisplaySettingsHash(window.location.hash)
    if (!isAnchor) return
    if (moduleId) {
      setHighlightModuleId(moduleId)
      const targetModule = DAILY_CARE_MODULES.find(module => module.id === moduleId)
      // 自動範本下若這個模組不適用於目前物種（例如貓咪的血壓），畫面根本不會渲染那個勾選格，
      // 捲過去也找不到目標；改捲到「自訂範本」切換讓使用者先開啟它，而不是捲到一個不存在的元素。
      const isApplicable = useCustomTemplate || (targetModule ? isModuleApplicableToSpecies(targetModule, careRecipientType) : false)
      const scrollTargetId = isApplicable ? `daily-care-setting-${moduleId}` : 'daily-care-custom-template'
      document.getElementById(scrollTargetId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } else {
      document.getElementById('daily-care-display-settings-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    history.replaceState(null, '', window.location.pathname + window.location.search)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // 使用者依提示勾選後，preference 會更新為已啟用；這時要清掉提示，否則琥珀色框與「未啟用」
    // 文字會一直留著，即使儲存已成功（issue #752 review 意見）。
    if (highlightModuleId && preference[highlightModuleId]) setHighlightModuleId(null)
  }, [highlightModuleId, preference])

  // 依物種模式下，不符合這個物種的項目直接不顯示勾選格——之前會列出貓咪也能勾「血壓」，
  // 但勾了在每日照護頁完全不會出現，看起來像設定沒生效。自訂範本則不受物種限制，全部項目都能勾選。
  const visibleModules = useCustomTemplate
    ? DAILY_CARE_MODULES
    : DAILY_CARE_MODULES.filter(module => isModuleApplicableToSpecies(module, careRecipientType))

  const highlightModule = highlightModuleId ? DAILY_CARE_MODULES.find(module => module.id === highlightModuleId) : undefined
  // 提示的模組若不在目前可見清單中（例如寵物物種下的血壓），代表使用者得先開啟「自訂範本」
  // 才看得到那個勾選格；文字要改成引導開啟範本，而不是說「勾選下方項目」卻沒有項目可勾。
  const highlightModuleNeedsCustomTemplate = Boolean(highlightModule) && !visibleModules.some(module => module.id === highlightModuleId)

  return (
    <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-4" aria-labelledby="daily-care-display-settings-title">
      <h2 id="daily-care-display-settings-title" className="font-bold text-gray-900">{text({ id: 'Tampilan perawatan harian', zh: '每日照護顯示' ,en: 'Daily Care Display' })}</h2>
      <p id="daily-care-display-settings-help" className="mt-1 text-sm text-gray-500">{text({ id: 'Pilih fitur yang ingin Anda lihat untuk orang yang sedang dipilih.', zh: '選擇目前這位被照護者要顯示的功能。' ,en: 'Choose which features to show for the selected care recipient.' })}</p>

      {highlightModule && (
        <p role="status" className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
          {highlightModuleNeedsCustomTemplate
            ? text({
                id: `Fitur "${text(highlightModule.label)}" tidak termasuk dalam template otomatis untuk jenis ini. Aktifkan "Template khusus" di bawah, lalu centang "${text(highlightModule.label)}".`,
                zh: `「${text(highlightModule.label)}」不在這個物種的自動範本內。請先開啟下方「自訂範本」，再勾選「${text(highlightModule.label)}」。`,
                en: `"${text(highlightModule.label)}" isn't part of the automatic template for this species. Turn on "Custom template" below, then check "${text(highlightModule.label)}".`,
              })
            : text({
                id: `Fitur "${text(highlightModule.label)}" belum diaktifkan untuk orang ini. Aktifkan di bawah untuk mulai mencatat.`,
                zh: `「${text(highlightModule.label)}」目前未對這位被照護者啟用，勾選下方項目即可開始記錄。`,
                en: `"${text(highlightModule.label)}" isn't enabled for this person yet. Turn it on below to start recording.`,
              })}
        </p>
      )}

      <label htmlFor="daily-care-custom-template" className={`mt-4 flex min-h-12 items-center justify-between gap-3 rounded-xl border ${highlightModuleNeedsCustomTemplate ? 'ring-2 ring-amber-500 ring-offset-1' : ''} border-indigo-100 bg-indigo-50 px-3 py-2 text-sm ${saving ? 'cursor-wait' : 'cursor-pointer'}`}>
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
            <label key={module.id} htmlFor={`daily-care-setting-${module.id}`} className={`flex min-h-12 items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm ${permissionLocked ? 'bg-gray-100 opacity-70' : 'bg-gray-50'} ${saving ? 'cursor-wait' : permissionLocked ? 'cursor-not-allowed' : 'cursor-pointer'} ${highlightModuleId === module.id ? 'ring-2 ring-amber-500 ring-offset-1' : ''}`}>
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
        ? { id: 'Mode demo menyimpan pengaturan untuk setiap orang di browser ini saja.', zh: '展示模式會把每位被照護者的設定保存在這個瀏覽器。' ,en: 'Demo mode saves each care recipient’s settings in this browser.' }
        : { id: 'Pengaturan ini dibagikan kepada pengasuh lain yang berwenang untuk orang ini; catatan tidak dihapus dan izin akses tidak berubah.', zh: '這會同步給這位被照顧者的其他授權照護者；不會刪除紀錄或改變權限。' ,en: 'These settings are shared with authorized caregivers for this person; records and access are unchanged.' })}</p>
      {saving && <p className="mt-2 text-xs font-semibold text-indigo-700">{text({ id: 'Menyimpan pengaturan…', zh: '正在儲存設定…' ,en: 'Saving settings...' })}</p>}
      {error && <p role="alert" className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{text(error)}</p>}
    </section>
  )
}

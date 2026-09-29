/*
檔案用途：修正外觀時的情境 B／C 面板（issue #759，共用藥品目錄單位 D，規劃文件 §4.4）——
  其他家庭也在用，或這筆資料是官方／已核對時，寫入病人層覆蓋而不是共用 medications 那筆列。
所在層：src/features/medication/components；只吃 useMedicationAppearanceOverride 回傳的狀態，
  不直接呼叫資料層，情境 A（可以直接改共用列）仍由 ExistingPlanForm 既有的修正欄位處理，不經過這裡。
主要關聯：src/features/medication/hooks/useMedicationAppearanceOverride.ts、
  src/lib/medication/medicationAppearanceOverrides.ts。
*/
import { useI18n } from '../../../lib/i18n'
import type { MedicationAppearanceOverridePanelState } from '../hooks/useMedicationAppearanceOverride'
import { medicationAppearanceColors, medicationAppearanceShapes } from './MedicationAppearance'
import { AppearancePhotoField } from './MedicationAdminFormFields'

export function MedicationAppearanceOverridePanel({ state, patientDisplayName, onCancel }: {
  state: MedicationAppearanceOverridePanelState
  patientDisplayName: string
  onCancel: () => void
}) {
  const { text } = useI18n()
  const { loading, loadError, scenario, existingOverride, color, shape, photoUrl, note, setColor, setShape, setPhotoUrl, setNote, saving, status, save, restoreShared } = state

  if (loading) {
    return <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-900">{text({ id: 'Memeriksa siapa lagi yang memakai obat ini…', zh: '正在確認還有誰在用這顆藥…', en: 'Checking who else uses this medication…' })}</p>
  }

  // 讀取失敗時表單只是空白初始值，不能讓照護者以為那就是這顆藥現在的樣子而按下送出；
  // 只給「重新整理頁面後再試一次」的說明與取消按鈕，不顯示欄位與送出／還原按鈕。
  if (loadError) {
    return (
      <div className="space-y-2 rounded-xl border border-red-300 bg-red-50 p-3">
        <p role="status" className="text-xs font-semibold text-red-800">{text(loadError)}</p>
        <button type="button" onClick={onCancel} className="min-h-10 w-full rounded-xl border border-red-700 bg-white px-3 py-2 font-bold text-red-800 transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2">
          {text({ id: 'Sembunyikan koreksi obat', zh: '收合藥品資料修正', en: 'Hide medication correction' })}
        </button>
      </div>
    )
  }

  // 規劃文件 §4.4 情境 B／C 的文案；情境 C 多一句「這是官方／已核對資料」提醒。
  const scopeCopy = scenario === 'official_or_verified'
    ? { id: `Keluarga lain juga memakai obat ini. Perbaikan hanya berlaku untuk ${patientDisplayName}; data bersama tidak berubah. Ini data resmi / sudah diperiksa; jika data bersama salah, hubungi admin.`, zh: `其他家庭也在用這顆藥。你的修正只會套用到 ${patientDisplayName}，大家共用的資料不變。這是官方／已核對資料；如認為共用資料有誤，請通知管理員。`, en: `Other families also use this medication. Your fix applies only to ${patientDisplayName}; the shared data stays unchanged. This is official / verified data; tell the admin if the shared data looks wrong.` }
    : { id: `Keluarga lain juga memakai obat ini. Perbaikan hanya berlaku untuk ${patientDisplayName}; data bersama tidak berubah.`, zh: `其他家庭也在用這顆藥。你的修正只會套用到 ${patientDisplayName}，大家共用的資料不變。`, en: `Other families also use this medication. Your fix applies only to ${patientDisplayName}; the shared data stays unchanged.` }

  return (
    <fieldset className="grid grid-cols-2 gap-2 rounded-xl border border-sky-300 bg-sky-50 p-3">
      <legend className="px-1 text-xs font-bold text-sky-950">{text(scopeCopy)}</legend>
      {existingOverride && <p className="col-span-2 rounded-lg bg-white px-2 py-1.5 text-xs font-bold text-sky-900">👤 {text({ id: 'Tampilan khusus orang ini', zh: '此人專屬外觀', en: 'Appearance set for this person' })}</p>}
      <label className="block text-xs font-bold text-sky-900">{text({ id: 'Warna', zh: '顏色', en: 'Color' })}<select value={color} onChange={event => setColor(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-sky-200 p-2 text-sm font-normal focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"><option value="">{text({ id: 'Warna belum tercatat', zh: '顏色未登錄', en: 'Color not yet recorded' })}</option>{medicationAppearanceColors.map(([value, label]) => <option key={value} value={value}>{text(label)}</option>)}</select></label>
      <label className="block text-xs font-bold text-sky-900">{text({ id: 'Bentuk', zh: '形狀', en: 'Shape' })}<select value={shape} onChange={event => setShape(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-sky-200 p-2 text-sm font-normal focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"><option value="">{text({ id: 'Bentuk belum tercatat', zh: '形狀未登錄', en: 'Shape not yet recorded' })}</option>{medicationAppearanceShapes.map(([value, label]) => <option key={value} value={value}>{text(label)}</option>)}</select></label>
      <AppearancePhotoField value={photoUrl} onChange={setPhotoUrl} disabled={saving} />
      <label className="col-span-2 block text-xs font-bold text-sky-900">
        {text({ id: 'Catatan (opsional)', zh: '備註（選填）', en: 'Note (optional)' })}
        <input value={note} onChange={event => setNote(event.target.value)} maxLength={120} className="mt-1 min-h-11 w-full rounded-xl border border-sky-200 p-2 text-sm font-normal focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200" />
      </label>
      {status && <p role="status" className="col-span-2 text-xs font-semibold text-sky-900">{text(status)}</p>}
      <button type="button" disabled={saving} onClick={save} className="col-span-2 min-h-11 rounded-xl bg-sky-700 px-3 py-2 font-bold text-white transition-colors hover:bg-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 disabled:opacity-50">
        {text({ id: `Terapkan hanya untuk ${patientDisplayName}`, zh: `只套用到 ${patientDisplayName}`, en: `Apply only to ${patientDisplayName}` })}
      </button>
      {existingOverride && <button type="button" disabled={saving} onClick={restoreShared} className="col-span-2 min-h-10 rounded-xl border border-sky-700 bg-white px-3 py-2 font-bold text-sky-800 transition-colors hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 disabled:opacity-50">
        {text({ id: 'Kembalikan ke tampilan bersama', zh: '還原成共用外觀', en: 'Restore shared appearance' })}
      </button>}
      <button type="button" onClick={onCancel} className="col-span-2 min-h-10 rounded-xl border border-sky-700 bg-white px-3 py-2 font-bold text-sky-800 transition-colors hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2">
        {text({ id: 'Sembunyikan koreksi obat', zh: '收合藥品資料修正', en: 'Hide medication correction' })}
      </button>
    </fieldset>
  )
}

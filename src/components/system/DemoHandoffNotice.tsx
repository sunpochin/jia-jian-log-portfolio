/*
檔案用途：首次登入時若讀到展示模式試用承接的模組組合，顯示已套用哪些模組的空狀態提示，
並提供「重新設定」（跳回精靈）與「關閉」兩個動作。
所在層：src/components/system；純呈現元件，不持有狀態，模組 id 轉文字沿用 lib/dailyCareModules。
主要關聯：從 App.tsx 抽出（issue #764 App.tsx 拆分），資料來源為 hooks/useDailyCareOnboarding。
*/
import { useI18n } from '../../lib/i18n'
import { DAILY_CARE_MODULES, type DailyCareModuleId } from '../../lib/dailyCareModules'

interface DemoHandoffNoticeProps {
  moduleIds: DailyCareModuleId[]
  onReconfigure: () => void
  onDismiss: () => void
}

export function DemoHandoffNotice({ moduleIds, onReconfigure, onDismiss }: DemoHandoffNoticeProps) {
  const { text } = useI18n()
  return (
    <div role="status" className="print-hidden flex shrink-0 items-start gap-2 border-b border-indigo-200 bg-indigo-50 px-4 py-2.5 text-xs font-semibold text-indigo-900">
      <span aria-hidden="true" className="text-base leading-5">✨</span>
      <p className="min-w-0 flex-1 leading-5">
        {text({
          id: `Anda baru saja mencoba item ini: ${moduleIds.map(id => DAILY_CARE_MODULES.find(module => module.id === id)?.compactLabel.id ?? id).join('、')}. Sudah diterapkan; Anda bisa mengubahnya di Pengaturan.`,
          zh: `你剛剛試用的是這些模組：${moduleIds.map(id => DAILY_CARE_MODULES.find(module => module.id === id)?.compactLabel.zh ?? id).join('、')}，已經幫你設定好，可在設定頁調整。`, en: `You just tried these modules: ${moduleIds.map(id => DAILY_CARE_MODULES.find(module => module.id === id)?.compactLabel.en ?? id).join(', ')}. They have been applied; you can change them in Settings.`,
        })}
      </p>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <button
          type="button"
          onClick={onReconfigure}
          className="min-h-11 rounded-lg px-2 font-bold text-indigo-900 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700"
        >
          {text({ id: 'Atur ulang', zh: '重新設定' ,en: 'Reconfigure' })}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="min-h-11 rounded-lg px-2 font-bold text-indigo-900 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700"
        >
          {text({ id: 'Tutup', zh: '關閉' ,en: 'Close' })}
        </button>
      </div>
    </div>
  )
}

/*
檔案用途：已封存照護對象被自動換回時顯示的提示橫幅，說明只能透過設定頁唯讀查看歷史紀錄。
所在層：src/components/system；純呈現元件，不持有狀態，由父層傳入關閉 callback。
主要關聯：從 App.tsx 抽出（issue #764 App.tsx 拆分），搭配 lib/careSubjectGuard 的自動換回邏輯使用。
*/
import { useI18n } from '../../lib/i18n'

interface ArchivedSubjectNoticeProps {
  onDismiss: () => void
}

export function ArchivedSubjectNotice({ onDismiss }: ArchivedSubjectNoticeProps) {
  const { text } = useI18n()
  return (
    <div role="status" className="print-hidden flex shrink-0 items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-900">
      <span aria-hidden="true" className="text-base leading-5">⚠️</span>
      <p className="min-w-0 flex-1 leading-5">
        {text({
          id: 'Penerima perawatan yang diarsipkan hanya dapat dibaca lewat "Lihat riwayat hidup" di Pengaturan. Orang aktif telah dikembalikan agar catatan baru tidak tersimpan ke nama yang salah.',
          zh: '已封存的照護對象只能透過設定頁的「查看生命歷史」閱讀。目前操作對象已自動換回，避免新紀錄存到錯的人身上。', en: 'Archived care recipients can only be viewed through View Life History in Settings. The active subject was switched back so new records cannot be saved to the wrong person.',
        })}
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="min-h-11 shrink-0 rounded-lg px-2 font-bold text-amber-900 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700"
      >
        {text({ id: 'Tutup', zh: '關閉' ,en: 'Close' })}
      </button>
    </div>
  )
}

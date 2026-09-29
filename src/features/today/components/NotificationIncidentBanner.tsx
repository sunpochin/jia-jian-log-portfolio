/*
檔案用途：「今天」頁頂端的通知 incident 橫幅（ADR-007 D7「告警必須有指名的消費者」、票 10，issue #974）——
  有 open incident 時告訴照護者「有一則通知可能沒有送到，請直接確認」，不含數值、收件人或訊息內容；
  可結案者有一顆「已處理」；讀取失敗時顯示「無法確認通知狀態」，不得顯示成沒有告警（Fail loudly，#887 同類）。
所在層：src/features/today/components；純呈現元件，狀態來自 useNotificationDeliveryIncidents，本身不讀資料。
主要關聯：src/features/today/pages/TodayPage.tsx、useNotificationDeliveryIncidents.ts、
  tests/unit/notificationIncidentBannerRender.test.ts。
*/
import { useI18n } from '../../../lib/i18n'
import type { NotificationDeliveryIncident } from '../../../lib/notificationDeliveryIncidents'

// 三語、印尼文優先；文字只說「可能沒有送到」，不說哪一筆、不說數值（沿用四支 Function 的 log 邊界）。
const TEXT = {
  title: { id: 'Ada notifikasi ke keluarga yang mungkin tidak sampai.', zh: '有一則家人通知可能沒有送到。', en: 'A family notification may not have been delivered.' },
  titleMany: { id: 'Ada beberapa notifikasi ke keluarga yang mungkin tidak sampai.', zh: '有多則家人通知可能沒有送到。', en: 'Several family notifications may not have been delivered.' },
  hint: { id: 'Hubungi keluarga langsung untuk memastikan.', zh: '請直接聯絡家人確認。', en: 'Contact the family directly to confirm.' },
  acknowledge: { id: 'Sudah ditangani', zh: '已處理', en: 'Handled' },
  acknowledging: { id: 'Menyimpan…', zh: '處理中…', en: 'Saving…' },
  acknowledgeFailed: { id: 'Gagal menandai sebagai sudah ditangani. Coba lagi.', zh: '無法標記為已處理，請再試一次。', en: 'Could not mark as handled. Please try again.' },
  checkFailed: { id: 'Tidak dapat memastikan status notifikasi keluarga. Periksa koneksi lalu coba lagi.', zh: '無法確認家人通知狀態，請確認網路後再試。', en: 'Unable to confirm the family notification status. Check your connection and try again.' },
}

export function NotificationIncidentBanner({ incidents, checkFailed, canAcknowledge, acknowledgingId, acknowledgeFailed, onAcknowledge }: {
  incidents: NotificationDeliveryIncident[]
  checkFailed: boolean
  // 依 D7：care_access 且 can_record（管理者只放寬 can_record）才有「已處理」；viewer 看得到橫幅但沒有按鈕。
  canAcknowledge: boolean
  acknowledgingId: string | null
  acknowledgeFailed: boolean
  onAcknowledge: (incidentId: string) => void
}) {
  const { text } = useI18n()

  // 讀取失敗：獨立一則警示，不能與「沒有告警」長得一樣。
  if (checkFailed) {
    return (
      <p role="alert" aria-live="assertive" className="mb-4 rounded-2xl border border-warn-700/30 bg-warn-50 p-4 text-lg font-bold leading-snug text-slate-900">
        {text(TEXT.checkFailed)}
      </p>
    )
  }
  if (incidents.length === 0) return null

  // 大字、高對比、左對齊、不靠顏色傳達（右眼失明的版面考量：內容靠左、按鈕在文字下方而不是右側）。
  // 一顆按鈕結掉全部 open incident：看護不需要分辨是哪一筆，也不該在半夜逐筆點（15 秒原則）。
  const pending = acknowledgingId !== null
  return (
    <section role="alert" aria-live="assertive" className="mb-4 rounded-2xl border-2 border-danger-700/40 bg-danger-50 p-4 text-slate-900">
      <p className="text-lg font-black leading-snug">{text(incidents.length > 1 ? TEXT.titleMany : TEXT.title)}</p>
      <p className="mt-1 text-base font-semibold leading-snug">{text(TEXT.hint)}</p>
      {acknowledgeFailed && (
        <p role="status" className="mt-2 text-sm font-semibold text-danger-700">{text(TEXT.acknowledgeFailed)}</p>
      )}
      {canAcknowledge && (
        <button
          type="button"
          disabled={pending}
          onClick={() => { for (const incident of incidents) onAcknowledge(incident.id) }}
          className="mt-3 min-h-12 w-full rounded-2xl bg-slate-900 px-4 text-base font-black text-white disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 focus-visible:ring-offset-2"
        >
          {pending ? text(TEXT.acknowledging) : text(TEXT.acknowledge)}
        </button>
      )}
    </section>
  )
}

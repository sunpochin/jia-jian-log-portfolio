/*
檔案用途：sweeper 告警表（notification_delivery_incidents，ADR-007 D7）的前端資料轉接層——讀取某位病人的 open incident、
  經 acknowledge_notification_delivery_incident RPC 結案。ADR-007 票 10（issue #974）「告警必須有指名的消費者」的資料入口。
所在層：src/lib 共用資料層；隔離 Supabase RLS 細節，供 useNotificationDeliveryIncidents 與單元測試使用。
主要關聯：supabase/migrations/20260926165847_create_notification_delivery_incidents_sweeper_adr007.sql（表、RLS、結案 RPC）、
  src/features/today/hooks/useNotificationDeliveryIncidents.ts、src/features/today/components/NotificationIncidentBanner.tsx。
*/
import { supabase } from './supabase'
import { isDemoPatientId } from './demoData'

export type NotificationIncidentAlertKind = 'sending_stale' | 'delivery_unknown' | 'pending_overdue' | 'failed_terminal'

// 刻意只取指標與狀態欄位：incident 列本來就不含訊息內容、數值或收件人，前端也不去 JOIN 回源表——
// 橫幅文字只說「有一則通知可能沒有送到」，不需要、也不該知道是哪一筆血壓。
export interface NotificationDeliveryIncident {
  id: string
  alertKind: NotificationIncidentAlertKind
  firstSeenAt: string
  lastSeenAt: string
  // 來源列的 claim_generation：sweeper 重開 incident 是就地更新、id 不變，只有世代前進。前端要靠它分辨「同一筆 id 的新一代告警」，
  // 結案失敗的記號才不會黏到重開後的新告警上（PR #993 Codex P2）。
  generation: number
}

type IncidentRow = { id: string; alert_kind: string; first_seen_at: string; last_seen_at: string; claim_generation_seen: number | null }

type IncidentClient = {
  from: (table: 'notification_delivery_incidents') => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          order: (column: string, options: { ascending: boolean }) => PromiseLike<{ data: IncidentRow[] | null; error: unknown }>
        }
      }
    }
  }
  rpc: (name: 'acknowledge_notification_delivery_incident', args: { p_incident_id: string; p_claim_generation: number }) => PromiseLike<{ data: unknown; error: unknown }>
}

const ALERT_KINDS: ReadonlySet<string> = new Set<NotificationIncidentAlertKind>(['sending_stale', 'delivery_unknown', 'pending_overdue', 'failed_terminal'])

// 查詢失敗一律 throw（Fail loudly）：呼叫端要顯示「無法確認通知狀態」，不得把讀不到講成「沒有告警」（#887 同類錯誤）。
// 查詢明確以 patient_id 分區（AGENTS.md § 3.5）；RLS 另一層再擋住沒有 care_access 的病人。
export async function fetchOpenNotificationDeliveryIncidents(
  patientId: string,
  client: IncidentClient = supabase as unknown as IncidentClient,
): Promise<NotificationDeliveryIncident[]> {
  // 展示模式沒有 Supabase，也沒有真的送出路徑：沒有告警是正確答案，不是讀取失敗。
  if (isDemoPatientId(patientId)) return []
  const { data, error } = await client
    .from('notification_delivery_incidents')
    .select('id, alert_kind, first_seen_at, last_seen_at, claim_generation_seen')
    .eq('patient_id', patientId)
    .eq('status', 'open')
    .order('first_seen_at', { ascending: true })
  if (error) throw new Error('Unable to read notification delivery incidents')
  return (data ?? [])
    .filter(row => typeof row.id === 'string' && ALERT_KINDS.has(row.alert_kind))
    .map(row => ({ id: row.id, alertKind: row.alert_kind as NotificationIncidentAlertKind, firstSeenAt: row.first_seen_at, lastSeenAt: row.last_seen_at, generation: typeof row.claim_generation_seen === 'number' ? row.claim_generation_seen : 0 }))
}

// 結案走 SECURITY DEFINER RPC（care_access 且 can_record；管理者只放寬 can_record）；authenticated 對表沒有直接 UPDATE。
// 要交出「畫面上看到的世代」（PR #993 Codex P1）：sweeper 重開是就地推進同一筆 id 的 claim_generation_seen，上一次補查到按下之間
// 世代若已前進，RPC 回 stale 不結案——照護者只處理了他看過的那次失敗，畫面要重讀而不是移除。
//   acknowledged：結掉了看到的那一代；closed：已非 open（別人先結案／來源已 sent），畫面照樣移除；stale：重讀。
export type IncidentAcknowledgeOutcome = 'acknowledged' | 'closed' | 'stale'
const ACKNOWLEDGE_OUTCOMES: ReadonlySet<string> = new Set<IncidentAcknowledgeOutcome>(['acknowledged', 'closed', 'stale'])

export async function acknowledgeNotificationDeliveryIncident(
  incidentId: string,
  claimGeneration: number,
  client: IncidentClient = supabase as unknown as IncidentClient,
): Promise<IncidentAcknowledgeOutcome> {
  const { data, error } = await client.rpc('acknowledge_notification_delivery_incident', { p_incident_id: incidentId, p_claim_generation: claimGeneration })
  if (error || typeof data !== 'string' || !ACKNOWLEDGE_OUTCOMES.has(data)) throw new Error('Unable to acknowledge the notification delivery incident')
  return data as IncidentAcknowledgeOutcome
}

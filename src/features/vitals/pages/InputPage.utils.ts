/*
檔案用途：提供血壓輸入頁的驗證、錯誤訊息、數值範圍與近期摘要工具。
所在層：src/components 的輔助模組；不直接呈現畫面。
主要關聯：InputPage 與 DailyBloodPressureRecords 共用此處的輸入安全規則。
*/
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { supabase } from '../../../lib/supabase'
import { TZ } from '../../../lib/timezone'
import { getSession, type Session } from '../../../lib/session'
import { localized, type Locale } from '../../../lib/i18n'
import { describeSaveError, isConnectionError, isPermissionError, matchesConstraint } from '../../../lib/dataErrors'
import { isDemoPatientId } from '../../../lib/demoData'
import { getDemoBpRecords, isDemoMode } from '../../../lib/demoStorage'
import { careDateKey, careDayWindow } from '../../../lib/careDay'
import type { AlertLevel } from '../../../types/database'

dayjs.extend(utc)
dayjs.extend(timezone)

export { TZ }

// 上限隨帳號方案而變，前端不猜數字，避免特權照護者被錯誤告知免費額度。
const BP_DAILY_LIMIT_TEXT = {
  id: 'Hari ini sudah mencapai batas penambahan catatan tekanan darah untuk akun ini. Jika salah input, ubah atau hapus catatan hari ini.',
  zh: '今天已達到此帳號的血壓新增上限；若有輸入錯誤，可修改或刪除今天的紀錄。', en: 'The blood pressure limit for this account has been reached today; if there is a typing error, you can modify or delete today’s record.',
} as const

/**
 * 繁體中文註解：把常見的登入/RLS/設定錯誤分開，讓看護知道可採取的下一步，而不是被同一句泛用錯誤卡住。
 * 通用的判斷（權限、連線）已移到 lib/dataErrors 共用，這裡只保留血壓特有的配額訊息，
 * 避免同一份 unknown 錯誤解析在體溫、血壓、PRN 各留一份副本後慢慢漂移。
 */
export function saveErrorMessage(error: unknown, locale: Locale = 'id'): string {
  if (matchesConstraint(error, 'daily_blood_pressure_limit') && !isPermissionError(error) && !isConnectionError(error)) {
    return localized(BP_DAILY_LIMIT_TEXT, locale)
  }
  return localized(describeSaveError(error), locale)
}

// ── Bilingual string table (Indonesian first, Chinese second) ──────────────
// 繁體中文註解：放置印尼文與中文的雙語字典，便於維護與翻譯擴充。
export const L = {
  title:     { id: 'Tekanan Darah',       zh: '血壓紀錄' ,en: 'Blood Pressure Record' },
  systolic:  { id: 'Sistolik',            zh: '高壓' ,en: 'Systolic' },
  diastolic: { id: 'Diastolik',           zh: '低壓' ,en: 'Diastolic' },
  pulse:     { id: 'Jantung',             zh: '心跳' ,en: 'Heart rate' },
  save:      { id: 'Simpan',              zh: '儲存' ,en: 'Save' },
  saving:    { id: 'Menyimpan…',          zh: '儲存中…' ,en: 'Saving...' },
  saved:     { id: '✓ Tersimpan!',        zh: '✓ 已記錄！' ,en: 'Recorded' },
  queued:    { id: 'Tersimpan di perangkat', zh: '已暫存於本機' ,en: "Saved on this device" },
  pending: (count: number) => ({ id: `${count} catatan menunggu sinkronisasi`, zh: `${count} 筆紀錄等待同步` ,en: `${count} records waiting to sync` }),
  pendingLastAttempt: (timeStr: string) => ({ id: `Percobaan sinkronisasi terakhir pukul ${timeStr}`, zh: `最後一次嘗試同步時間：${timeStr}` ,en: `Last sync attempt at ${timeStr}` }),
  pendingSyncing: { id: 'Menyinkronkan catatan…', zh: '正在同步紀錄…' ,en: "Syncing records…" },
  pendingSyncError: { id: 'Periksa koneksi lalu coba sinkronisasi lagi.', zh: '請確認網路後再重新同步。' ,en: "Check your connection and try syncing again." },
  retryPending: { id: 'Sinkronkan sekarang', zh: '現在同步' ,en: "Sync now" },
  normal:      { id: 'Normal',              zh: '正常' ,en: 'Normal' },
  warning:     { id: 'Agak Tinggi',         zh: '略高' ,en: 'Slightly high' },
  danger:      { id: '⚠️ Terlalu Tinggi!',  zh: '⚠️ 血壓偏高！' ,en: '⚠️ High blood pressure!' },
  'warning-low': { id: 'Agak Rendah',       zh: '偏低' ,en: 'Slightly low' },
  'danger-low':  { id: '⚠️ Terlalu Rendah!', zh: '⚠️ 血壓過低！' ,en: '⚠️ Low blood pressure!' },
  pagi:      { id: 'Pagi',               zh: '早上' ,en: 'Morning' },
  siang:     { id: 'Siang',              zh: '下午' ,en: 'Afternoon' },
  malam1:    { id: '18:00+',             zh: '晚上18點' ,en: '6 PM' },
  malam2:    { id: '20:00+',             zh: '晚上20點' ,en: '8 PM' },
  // 晚間分類仍供流程判斷，但不把時段標籤塞回紀錄摘要，避免畫面資訊重複。
  malam3:    { id: '',                   zh: '' ,en: '' },
  rest: {
    id: () =>
      // 固定寫 60 秒，避免「大約 1 分鐘」讓看護無法判斷何時能安全重測。
      '✓ Catatan 1 tercatat. Istirahat selama 60 detik, lalu ukur lagi ya 🙏',
    zh: () =>
      '✓ 第一筆已記錄。請休息 60 秒，再量一次 🙏', en: () =>
      '✓ First reading recorded. Rest for 60 seconds, then measure again 🙏',
  },
  done: {
    // 沒有顯示時段名時，完成訊息也不應留下假的時段或多餘空白。
    id: (session: string) => session ? `✓ 2 catatan tersimpan untuk ${session}` : '✓ 2 catatan tersimpan',
    zh: () => `✓ 此時段雙筆已記錄`, en: (session: string) => session ? `✓ Two readings recorded for ${session}` : '✓ Two readings recorded',
  },
  // 血壓已存進資料庫，只有 Telegram 通知失敗；用警示色而非紅色錯誤，避免看護誤以為血壓沒存到。
  notifyFailed: {
    id: '✓ Tekanan darah tersimpan, tapi notifikasi Telegram ke keluarga gagal terkirim.',
    zh: '✓ 血壓已存檔，但 Telegram 通知家人失敗，請截圖回報。', en: "✓ Blood pressure saved, but failed to send Telegram notification to family.",
  },
  // 通知服務正常，但這位照護對象沒有訂閱共用家屬群組、也沒有個人化通知；家人不會自動收到。
  // 只陳述事實，不寫「尚未設定」：看護在 app 裡沒有開通的入口，暗示要去設定只會讓人找不到。
  // 附上「危險值請直接聯絡家人」這個看護能立刻做的動作。
  familyAlertSkipped: {
    id: '✓ Tekanan darah tersimpan. Catatan ini tidak dikirim otomatis ke keluarga. Jika angkanya berbahaya, hubungi keluarga langsung.',
    zh: '✓ 血壓已存檔。這筆紀錄不會自動通知家人；若數值危險，請直接聯絡家人。',
    en: '✓ Blood pressure saved. This reading was not sent to the family automatically. If it is dangerous, contact the family directly.',
  },
  // ADR-007 D9-b：共用群組那一則的送達結果。三種都先說「血壓已存」，看護不必重新輸入；
  // 「送出中」不是成功；「無法確認」與「沒有送出」都要看護直接聯絡家人。
  // 「沒有送出」刻意寫明不會自動重試（D9-c）：說「稍後重試」會讓看護以為系統還在努力，於是不打電話。
  familyAlertInProgress: {
    id: '✓ Tekanan darah tersimpan. Notifikasi ke keluarga sedang dikirim, hasilnya belum pasti…',
    zh: '✓ 血壓已存檔。家人通知送出中，結果尚未確定…',
    en: '✓ Blood pressure saved. The family notification is being sent, result not yet confirmed…',
  },
  familyAlertUnconfirmed: {
    id: '✓ Tekanan darah tersimpan, tapi tidak bisa dipastikan apakah notifikasi sampai ke keluarga. Hubungi keluarga langsung untuk memastikan.',
    zh: '✓ 血壓已存檔，但無法確認家人是否收到通知；請直接聯絡家人確認。',
    en: '✓ Blood pressure saved, but it could not be confirmed whether the family received the notification. Contact the family directly to confirm.',
  },
  familyAlertNotSent: {
    id: '✓ Tekanan darah tersimpan, tapi notifikasi ke keluarga tidak terkirim dan tidak akan dicoba ulang otomatis. Hubungi keluarga langsung.',
    zh: '✓ 血壓已存檔，但家人通知沒有送出，也不會自動重試；請直接聯絡家人。',
    en: '✓ Blood pressure saved, but the family notification was not sent and will not be retried automatically. Contact the family directly.',
  },
  // 個人化通知已排入 outbox（有自己的重試者）時，「沒送」「不明」只指共用群組那一則；說「家人通知沒送出、不會重試」
  // 就是對個人那條路徑說謊（PR #988 Codex P2）。仍請看護直接確認：群組那一則確實沒到／不明。
  familyAlertSharedUnconfirmedPersonalQueued: {
    id: '✓ Tekanan darah tersimpan, tapi tidak bisa dipastikan apakah notifikasi grup keluarga sampai. Notifikasi pribadi sudah masuk antrean dan akan dikirim otomatis. Hubungi keluarga langsung untuk memastikan.',
    zh: '✓ 血壓已存檔，但無法確認家人群組是否收到通知；個人通知已排入佇列，會自動送出。請直接聯絡家人確認。',
    en: '✓ Blood pressure saved, but it could not be confirmed whether the family group received the notification. Personal notifications are queued and will be sent automatically. Contact the family directly to confirm.',
  },
  familyAlertSharedNotSentPersonalQueued: {
    id: '✓ Tekanan darah tersimpan, tapi notifikasi ke grup keluarga tidak terkirim dan tidak akan dicoba ulang otomatis. Notifikasi pribadi sudah masuk antrean dan akan dikirim otomatis. Hubungi keluarga langsung untuk memastikan.',
    zh: '✓ 血壓已存檔，但家人群組通知沒有送出，也不會自動重試；個人通知已排入佇列，會自動送出。請直接聯絡家人確認。',
    en: '✓ Blood pressure saved, but the family group notification was not sent and will not be retried automatically. Personal notifications are queued and will be sent automatically. Contact the family directly to confirm.',
  },
  // 個人化通知沒有在路上、但有一則可能已送達（delivery_unknown，不會重送）：兩邊都只能說「無法確認」，不能講成「沒有個人通知」
  // 也不能說「會自動送出」（PR #988 Codex P2）。
  familyAlertSharedUnconfirmedPersonalUnknown: {
    id: '✓ Tekanan darah tersimpan, tapi tidak bisa dipastikan apakah notifikasi grup keluarga maupun notifikasi pribadi sampai. Hubungi keluarga langsung untuk memastikan.',
    zh: '✓ 血壓已存檔，但無法確認家人群組與個人通知是否送達；請直接聯絡家人確認。',
    en: '✓ Blood pressure saved, but it could not be confirmed whether the family group or the personal notifications were delivered. Contact the family directly to confirm.',
  },
  // 未訂閱共用群組（沒有群組那一則）、個人那一則不明：只剩「無法確認」可說，仍要請看護聯絡家人（PR #988 Codex P2）。
  familyAlertPersonalUnknown: {
    id: '✓ Tekanan darah tersimpan, tapi tidak bisa dipastikan apakah notifikasi pribadi ke keluarga sampai. Hubungi keluarga langsung untuk memastikan.',
    zh: '✓ 血壓已存檔，但無法確認家人的個人通知是否送達；請直接聯絡家人確認。',
    en: '✓ Blood pressure saved, but it could not be confirmed whether the personal notifications reached the family. Contact the family directly to confirm.',
  },
  // 個人化通知已送達（drain 已 sent）：只能說「個人通知已送達」，不能說「已排入、會自動送出」（PR #988 Codex P2）。
  familyAlertSharedUnconfirmedPersonalDelivered: {
    id: '✓ Tekanan darah tersimpan. Notifikasi pribadi ke keluarga sudah terkirim, tapi tidak bisa dipastikan apakah notifikasi grup keluarga sampai.',
    zh: '✓ 血壓已存檔。家人的個人通知已送達，但無法確認家人群組是否收到通知。',
    en: '✓ Blood pressure saved. The personal notifications reached the family, but it could not be confirmed whether the family group received the notification.',
  },
  familyAlertSharedNotSentPersonalDelivered: {
    id: '✓ Tekanan darah tersimpan. Notifikasi pribadi ke keluarga sudah terkirim, tapi notifikasi ke grup keluarga tidak terkirim dan tidak akan dicoba ulang otomatis.',
    zh: '✓ 血壓已存檔。家人的個人通知已送達，但家人群組通知沒有送出，也不會自動重試。',
    en: '✓ Blood pressure saved. The personal notifications reached the family, but the family group notification was not sent and will not be retried automatically.',
  },
  familyAlertSharedNotSentPersonalUnknown: {
    id: '✓ Tekanan darah tersimpan, tapi notifikasi ke grup keluarga tidak terkirim dan tidak akan dicoba ulang otomatis; notifikasi pribadi tidak bisa dipastikan sampai. Hubungi keluarga langsung untuk memastikan.',
    zh: '✓ 血壓已存檔，但家人群組通知沒有送出，也不會自動重試；個人通知無法確認是否送達。請直接聯絡家人確認。',
    en: '✓ Blood pressure saved, but the family group notification was not sent and will not be retried automatically; the personal notifications could not be confirmed as delivered. Contact the family directly to confirm.',
  },
}

// 待同步狀態列要顯示「最後一次嘗試同步」的時間，統一用照護日所在的台北時區格式化，
// 避免看護裝置系統時區跟 App 內其他時間戳（如量測時間）對不上。
export function formatPendingAttemptTime(epochMs: number): string {
  return dayjs(epochMs).tz(TZ).format('HH:mm')
}

// 「沒有任何家屬通知送出」的提示只對需要現在行動的讀數顯示（北極星鐵律 3：警報分級、寧缺勿濫）。
// 多數病人沒有訂閱共用群組也沒有個人化通知，若每一筆都提示，看護很快就會忽略它，
// 真正危險的那一筆反而沒人看。納入與排除的理由：
// - 納入 danger／danger-low／warning-low 與 warning：九級表對這些等級都有「重測／回報」的行動建議，
//   心跳 >120 也會把 level 推上 warning，一併納入。
// - 排除 warning 裡的「偏高觀察」（observasi）：九級表本身寫明「記錄即可，無須警報」，但它的
//   webAlertLevel 也是 warning，所以要用規則 key 排除，不能只看 level；心跳 >120 時仍要提示。
// - 排除 normal、off-target、below-target：後兩者的建議是「記錄、回診時一併回報」，不是現在行動。
export interface FamilyAlertEvaluation {
  level: AlertLevel
  pulseWarning: boolean
  bpRule: { key: string }
}

export function isFamilyAlertLevelReading(evaluation: FamilyAlertEvaluation): boolean {
  switch (evaluation.level) {
    case 'danger':
    case 'danger-low':
    case 'warning-low':
      return true
    case 'warning':
      return evaluation.pulseWarning || evaluation.bpRule.key !== 'observasi'
    default:
      return false
  }
}

export const BP_INPUT_LIMITS = {
  systolic: { min: 60, max: 300 },
  diastolic: { min: 30, max: 200 },
  pulse: { min: 20, max: 300 },
} as const

export type BpField = keyof typeof BP_INPUT_LIMITS

/** 兩位數輸入等待後續數字的時間；照護者抄血壓計時打完兩位數常會停頓一下。 */
export const BP_AUTO_ADVANCE_DELAY_MS = 600

/**
 * 決定輸入某一格後要不要自動跳到下一格。
 *
 * 修正前三格用兩套規則：收縮壓要滿三位數才跳，舒張壓與心跳滿兩位數且 >= 40 就跳。
 * 結果是外觀相同的三個框行為不同——收縮壓 98 不會跳、舒張壓 85 會跳——
 * 照護者無法建立穩定預期。
 *
 * 現在三格共用同一條規則，並把兩位數的情況改成延遲跳轉：
 * 三位數在血壓情境已是完整讀值，可以立刻跳；兩位數則可能只是三位數打到一半
 * （例如 105 會先經過 10），必須留一段時間讓使用者補完，否則焦點會在打字中途被搶走。
 */
export function bpAutoAdvance(field: BpField, value: number | ''): 'immediate' | 'delayed' | 'none' {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) return 'none'

  const digits = String(value).length
  // 三格上限都是三位數，因此第三位數輸入完必定是完整讀值。
  if (digits >= 3) return 'immediate'
  // 兩位數只有在已達該欄位下限時才可能是完整讀值；10（打 105 的中途）不符合，會繼續等待。
  if (digits === 2 && value >= BP_INPUT_LIMITS[field].min) return 'delayed'
  return 'none'
}

// 繁體中文註解：送進資料庫前先用同一組邊界擋掉假值，避免只靠 DB constraint 才發現錯誤而讓畫面卡在儲存流程。
export function isValidBpInput(sys: unknown, dia: unknown, pul: unknown): boolean {
  return (
    typeof sys === 'number' &&
    typeof dia === 'number' &&
    Number.isInteger(sys) &&
    Number.isInteger(dia) &&
    sys >= BP_INPUT_LIMITS.systolic.min &&
    sys <= BP_INPUT_LIMITS.systolic.max &&
    dia >= BP_INPUT_LIMITS.diastolic.min &&
    dia <= BP_INPUT_LIMITS.diastolic.max &&
    // 舊紀錄可能尚未量心跳；容許 null 才能修正血壓，而新輸入頁的空字串仍會轉成 0 並維持必填。
    (pul === null || (typeof pul === 'number' && Number.isInteger(pul) && pul >= BP_INPUT_LIMITS.pulse.min && pul <= BP_INPUT_LIMITS.pulse.max)) &&
    dia < sys
  )
}

// ── Style maps keyed by alert tone ────────────────────────────────────────
// 繁體中文註解：輸入當下的即時回饋面板底色。等級對照表在 src/lib/alertPresentation.ts（§4.3 收斂），
// 這裡只保留「輸入頁專屬」的淺底面板樣式——它比 chip 大得多，實心深紅會整塊蓋住下方文字。
// 送出按鈕的底色與圖示直接用 alertPresentation 的 ALERT_BUTTON_CLASS／ALERT_ICON，不在本檔另建一份。
import type { AlertTone } from '../../../lib/alertPresentation'

export const alertCls: Record<AlertTone, string> = {
  'on-target':   'bg-brand-50  text-brand-700  border-brand-200',
  normal:        'bg-green-50  text-green-800  border-green-200',
  'below-target':'bg-warn-50   text-warn-700   border-amber-200',
  'warning-low': 'bg-orange-50 text-orange-800 border-orange-200',
  'danger-low':  'bg-red-50    text-red-800    border-red-200',
  'off-target':  'bg-danger-50 text-danger-700 border-red-200',
  'pulse-warning':'bg-orange-50 text-orange-800 border-orange-200',
  warning:       'bg-danger-50 text-danger-700 border-red-300',
  danger:        'bg-red-100   text-red-800    border-red-300',
  critical:      'bg-red-200   text-red-900    border-red-400',
}

export const sessionIcon  = { pagi: '🌅', siang: '☀️', malam1: '🌙', malam2: '🌙', malam3: '🌙' } as const
export const sessionColor = {
  pagi:   'bg-amber-100 text-amber-800',
  siang:  'bg-sky-100   text-sky-800',
  malam1: 'bg-indigo-100 text-indigo-800',
  malam2: 'bg-indigo-100 text-indigo-800',
  malam3: 'bg-indigo-100 text-indigo-800',
} as const



// ── One row in the 3-day summary (one date+session group) ─────────────────
export interface SessionSummary {
  dateStr: string   // e.g. "6/14"
  timeStr: string   // e.g. "20:15"
  session: Session
  avgSys:  number
  avgDia:  number
  avgPul:  number
}

const RECENT_SUMMARY_GROUP_LIMIT = 9

// ── Query Supabase for last 3 days *for one subject*, group by date+session ─
// 繁體中文註解：查詢最近 3 日該量測對象之紀錄並做時段平均計算，以利 UI 渲染簡介表格。
export async function fetchRecentSummary(patientId: string): Promise<SessionSummary[]> {
  const { start, end } = careDayWindow(3, dayjs().tz(TZ))
  const since = start.toISOString()
  const until = end.toISOString()
  const data = isDemoMode() && isDemoPatientId(patientId)
    ? getDemoBpRecords(90, patientId).filter(record => Date.parse(record.measured_at) >= Date.parse(since) && Date.parse(record.measured_at) < Date.parse(until))
    : (await supabase
      .from('blood_pressure_records')
      .select('systolic, diastolic, pulse, measured_at')
      .eq('patient_id', patientId)
      .gte('measured_at', since)
      .order('measured_at', { ascending: false })).data

  if (!data || data.length === 0) return []

  // Group rows by "date string + session" key
  const groups = new Map<string, { sys: number[]; dia: number[]; pul: number[]; session: Session; dateStr: string; latestTimeStr: string }>()
  for (const r of data) {
    const dt      = dayjs(r.measured_at).tz(TZ)
    const careDate = careDateKey(dt)
    const dateStr = `${Number(careDate.slice(5, 7))}/${Number(careDate.slice(8, 10))}`
    const timeStr = dt.format('HH:mm')
    const session = getSession(dt.hour())
    const key     = `${careDate}-${session}`
    if (!groups.has(key)) {
      groups.set(key, { sys: [], dia: [], pul: [], session, dateStr, latestTimeStr: timeStr })
    }
    const g = groups.get(key)!
    g.sys.push(r.systolic)
    g.dia.push(r.diastolic)
    if (r.pulse != null) g.pul.push(r.pulse)
  }

  const avg = (arr: number[]) =>
    arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0

  return Array.from(groups.values())
    .map(g => ({
      dateStr: g.dateStr,
      timeStr: g.latestTimeStr,
      session: g.session,
      avgSys: avg(g.sys),
      avgDia: avg(g.dia),
      avgPul: avg(g.pul)
    }))
    .slice(0, RECENT_SUMMARY_GROUP_LIMIT)
}

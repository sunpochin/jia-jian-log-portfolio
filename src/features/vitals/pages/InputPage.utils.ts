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
  title:     { id: 'Tekanan Darah',       zh: '血壓紀錄' ,en: 'Tekanan Darah' },
  systolic:  { id: 'Sistolik',            zh: '高壓' ,en: 'Systolic' },
  diastolic: { id: 'Diastolik',           zh: '低壓' ,en: 'LOW PRESSURE' },
  pulse:     { id: 'Jantung',             zh: '心跳' ,en: 'Heart rate' },
  save:      { id: 'Simpan',              zh: '儲存' ,en: 'Save' },
  saving:    { id: 'Menyimpan…',          zh: '儲存中…' ,en: 'Saving...' },
  saved:     { id: '✓ Tersimpan!',        zh: '✓ 已記錄！' ,en: 'Recorded' },
  queued:    { id: 'Tersimpan di perangkat', zh: '已暫存於本機' ,en: "Saved on this device" },
  pending: (count: number) => ({ id: `${count} catatan menunggu sinkronisasi`, zh: `${count} 筆紀錄等待同步` ,en: `${count} recordan menunggu sync` }),
  pendingSyncing: { id: 'Menyinkronkan catatan…', zh: '正在同步紀錄…' ,en: "Syncing recordan…" },
  pendingSyncError: { id: 'Periksa koneksi lalu coba sinkronisasi lagi.', zh: '請確認網路後再重新同步。' ,en: "Periksa connection lalu coba sync lagi." },
  retryPending: { id: 'Sinkronkan sekarang', zh: '現在同步' ,en: "Sync now" },
  normal:      { id: 'Normal',              zh: '正常' ,en: 'Normal' },
  warning:     { id: 'Agak Tinggi',         zh: '略高' ,en: 'Somewhat higher' },
  danger:      { id: '⚠️ Terlalu Tinggi!',  zh: '⚠️ 血壓偏高！' ,en: 'High ⚠️ blood pressure!' },
  'warning-low': { id: 'Agak Rendah',       zh: '偏低' ,en: 'Somewhat low' },
  'danger-low':  { id: '⚠️ Terlalu Rendah!', zh: '⚠️ 血壓過低！' ,en: 'Low ⚠️ blood pressure!' },
  pagi:      { id: 'Pagi',               zh: '早上' ,en: 'Morning' },
  siang:     { id: 'Siang',              zh: '下午' ,en: 'Afternoon' },
  malam1:    { id: '18:00+',             zh: '晚上18點' ,en: '18:00 PM' },
  malam2:    { id: '20:00+',             zh: '晚上20點' ,en: '8pm' },
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
    zh: '✓ 血壓已存檔，但 Telegram 通知家人失敗，請截圖回報。', en: "✓ Blood pressure saved, tapi notifikasi Telegram to family failed terkirim.",
  },
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

// ── Style maps keyed by alert level ───────────────────────────────────────
// 繁體中文註解：定義不同警示等級所對應的 CSS 樣式，避免程式碼散落於排版中。
export const alertCls = {
  normal:        'bg-green-50  text-green-800  border-green-200',
  warning:       'bg-orange-50 text-orange-800 border-orange-200',
  danger:        'bg-red-50    text-red-800    border-red-200',
  'warning-low': 'bg-orange-50 text-orange-800 border-orange-200',
  'danger-low':  'bg-red-50    text-red-800    border-red-200',
}

export const btnCls = {
  normal:        'bg-green-600 active:bg-green-700',
  warning:       'bg-orange-500 active:bg-orange-600',
  danger:        'bg-red-500   active:bg-red-600',
  'warning-low': 'bg-orange-500 active:bg-orange-600',
  'danger-low':  'bg-red-500   active:bg-red-600',
}

export const sessionIcon  = { pagi: '🌅', siang: '☀️', malam1: '🌙', malam2: '🌙', malam3: '🌙' } as const
export const sessionColor = {
  pagi:   'bg-amber-100 text-amber-800',
  siang:  'bg-sky-100   text-sky-800',
  malam1: 'bg-indigo-100 text-indigo-800',
  malam2: 'bg-indigo-100 text-indigo-800',
  malam3: 'bg-indigo-100 text-indigo-800',
} as const

// ── Status icon for summary rows ───────────────────────────────────────────
export const statusIcon = {
  normal: '✅', warning: '⚠️', danger: '🔴',
  'warning-low': '⚠️', 'danger-low': '🔴',
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

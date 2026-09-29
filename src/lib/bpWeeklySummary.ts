/*
檔案用途：把血壓量測依 ISO 週（週一為週首，台北時區）彙整成週平均，供軌跡頁把逐筆血壓收斂成週摘要列。
所在層：src/lib 純函式業務邏輯層；只接受呼叫端已查好的 BpRecord[]，不連線 Supabase。
主要關聯：由 src/features/care-family/hooks/useCareTrajectoryFeed.ts 呼叫，
呈現於 src/features/care-family/components/trajectory/TrajectoryEventList.tsx（issue #735，#659 D 期）。
*/
import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { TZ } from './timezone'
import type { BpRecord } from '../types/database'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(isoWeek)

export interface WeeklyBpSummary {
  weekStart: string
  weekEnd: string
  avgSystolic: number
  avgDiastolic: number
  avgPulse: number | null
  recordCount: number
}

// 軌跡頁是「這段期間發生了什麼」的時間軸，血壓卻是每天多筆的高頻資料；逐筆列出會把調藥、看診等
// 真正的事件淹沒，因此改成週平均摘要列，跟既有 EventReview 的「事件前後 7 天回顧」（逐筆／逐日）分開用途。
export function summarizeWeeklyBpRecords(records: BpRecord[]): WeeklyBpSummary[] {
  const grouped = new Map<string, BpRecord[]>()
  for (const record of records) {
    const measured = dayjs(record.measured_at).tz(TZ)
    const weekKey = measured.startOf('isoWeek').format('YYYY-MM-DD')
    grouped.set(weekKey, [...(grouped.get(weekKey) ?? []), record])
  }
  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, readings]) => {
      const pulseValues = readings.flatMap(reading => reading.pulse == null ? [] : [reading.pulse])
      return {
        weekStart,
        weekEnd: dayjs.tz(weekStart, TZ).endOf('isoWeek').format('YYYY-MM-DD'),
        avgSystolic: Math.round(readings.reduce((sum, reading) => sum + reading.systolic, 0) / readings.length),
        avgDiastolic: Math.round(readings.reduce((sum, reading) => sum + reading.diastolic, 0) / readings.length),
        avgPulse: pulseValues.length ? Math.round(pulseValues.reduce((sum, pulse) => sum + pulse, 0) / pulseValues.length) : null,
        recordCount: readings.length,
      }
    })
}

/*
檔案用途：issue #415「主動異常示警」的資料整理層——讀體重、服藥、血壓原始紀錄與家屬門檻設定，
        呼叫 lib/careAnomalySignals.ts 純規則算出觀察清單，純讀取不寫入。
所在層：src/features/today/hooks；比照 useTodayOverview 把資料整理從頁面元件下放到這裡。
主要關聯：lib/careAnomalySignals.ts、lib/careAnomalySettings.ts、useTodayOverview（把這裡回傳的
        observationItems 併入今天頁的「需要留意」清單）。

為什麼展示模式（demo）直接回傳空清單：到期提醒（useTodayOverview 既有邏輯）已經是同樣的界線——
展示資料是固定故事，硬套真實的漏服藥／體重趨勢規則只會算出不成立的假觀察，不值得為此另外造假資料。
*/
import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { useBpRecords } from '../../../hooks/useBpRecords'
import { supabase } from '../../../lib/supabase'
import { isDemoPatientId } from '../../../lib/demoData'
import { dailyWeightAverages, dailyDoseCounts } from '../../../lib/trendSeries'
import { TZ } from '../../../lib/timezone'
import { CARE_DAY_START_HOUR, careDateKey } from '../../../lib/careDay'
import {
  readCareAnomalyAlertSettings,
  DEFAULT_CARE_ANOMALY_ALERT_SETTINGS,
  type CareAnomalyAlertSettings,
} from '../../../lib/careAnomalySettings'
import {
  detectWeightDropSignal,
  detectMissedMedicationSignal,
  detectBpHighStreakSignal,
  detectBpNightLowSignal,
  describeAnomalySignal,
  ANOMALY_SIGNAL_TITLE,
  type AnomalySignal,
} from '../../../lib/careAnomalySignals'
import { useBpEvaluator } from '../../vitals/hooks/useBpEvaluator'
import { useI18n } from '../../../lib/i18n'
import type { TodayAttentionItem } from './useTodayOverview'

dayjs.extend(utc)
dayjs.extend(timezone)

// 兩處（查詢窗口起點、服藥趨勢分桶）都要用「照護日的現在」而不是日曆日的現在，兩邊各自呼叫一次
// 即可，差幾毫秒不影響日層級分桶；統一成一個函式只是避免 -CARE_DAY_START_HOUR 這行算式抄兩遍。
function careDayNow() {
  return dayjs().tz(TZ).subtract(CARE_DAY_START_HOUR, 'hour')
}

export function useCareAnomalySignals(patientId: string): { items: TodayAttentionItem[]; loading: boolean; checkFailed: boolean } {
  const { text } = useI18n()
  // 連續偏高與夜間低血壓的門檻判定完全取決於用哪一份標準；這裡取的是**這位病人**的，
  // 不是全 app 共用的一般成人標準（issue #898 §6.1）。
  const evaluator = useBpEvaluator()
  const demo = isDemoPatientId(patientId)
  const [settings, setSettings] = useState<CareAnomalyAlertSettings>(DEFAULT_CARE_ANOMALY_ALERT_SETTINGS)
  const [weightPoints, setWeightPoints] = useState<{ measured_on: string; weight_kg: number }[]>([])
  const [doseLogs, setDoseLogs] = useState<{ care_date?: string | null; taken_on: string }[]>([])
  const [doseReadFailed, setDoseReadFailed] = useState(false)
  // issue #887：體重／藥單查詢失敗時，原本只把它們當成「沒有資料」（[]／false），完全不影響 items
  // 或 loading，於是今天頁把「根本沒檢查成功」呈現成「檢查過了、沒事」。這個旗標讓上層（useTodayOverview／
  // TodayPage）能區分兩種空清單：真的沒有觀察到異常，還是這一輪有查詢失敗、清單不完整。
  const [checkFailed, setCheckFailed] = useState(false)
  // Codex review（PR #892，issue #887 P2）：門檻設定讀取失敗時原本悄悄改用 DEFAULT_CARE_ANOMALY_ALERT_SETTINGS，
  // 對外看起來跟「讀到使用者自訂設定」一樣成功；但那組預設值不一定跟家屬實際設定的門檻等敏感，
  // 同樣算「這一輪沒有真正檢查成功」，要併入 checkFailed，不能只算讀資料的三個查詢。
  const [settingsReadFailed, setSettingsReadFailed] = useState(false)
  const [hasScheduledMedication, setHasScheduledMedication] = useState(false)
  // 目前生效藥單中最早的建立時間（轉成照護日字串）；漏服規則往回數天數時不能跨過這個日期，
  // 否則剛建立藥單當天會把「建立之前根本沒有藥要吃」的空白也算成漏服（見下方 useMemo 內的說明）。
  const [planEffectiveSinceCareDate, setPlanEffectiveSinceCareDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(!demo)

  // 血壓連續偏高與夜間低血壓次數都要比今天頁主摘要更長的窗口；比較設定裡兩個天數，
  // 上限 30 天並不是臨床門檻，只是避免家屬把門檻調到極端值時一次撈太多筆拖慢今天頁。
  const bpWindowDays = Math.min(30, Math.max(settings.bpHighStreakThresholdDays + 1, settings.nightLowBpWindowDays))
  // Codex review（PR #892，issue #887 P2）：血壓連續偏高／夜間低血壓兩條規則都吃這裡的 bpRecords，
  // 讀取失敗時 useBpRecords 只會回傳空陣列，兩條規則會安靜判定「沒有異常」而不是「沒檢查成功」；
  // 併入 checkFailed 才能讓上層也看得到這個失敗。
  const { records: bpRecords, loading: bpLoading, error: bpError } = useBpRecords(bpWindowDays, demo ? undefined : patientId)

  useEffect(() => {
    // 切換病人／進出展示模式時立刻清掉上一位對象的資料，不要等新的讀取跑完——
    // useTodayOverview 只有在 attentionItemsToShow.length===0 時才顯示載入中，
    // 不清空的話會在新資料還沒回來前，把前一位病人的觀察文字（含實際體重數字）誤標成目前病人的。
    setWeightPoints([])
    setDoseLogs([])
    setDoseReadFailed(false)
    setCheckFailed(false)
    setHasScheduledMedication(false)
    setPlanEffectiveSinceCareDate(null)

    if (demo) { setLoading(false); return }
    let cancelled = false
    setLoading(true)

    // 用「照護日的現在」（Asia/Taipei，04:00 分界）算窗口起點，而不是日曆日或裝置當地時區：
    // 少了 .tz(TZ) 在邊界時刻會把查詢窗口整整少抓一天；沒有 -CARE_DAY_START_HOUR，凌晨 00:00–03:59
    // 這段窗口的 since 會比下面 dailyDoseCounts 用的照護日 now 晚一天，漏抓最早那個照護日的白天劑量，
    // 讓那天被誤判成 0 劑、提早觸發連續漏服示警。
    const since = careDayNow().subtract(Math.max(settings.weightDropWindowDays, settings.missedMedicationThresholdDays + 1) - 1, 'day').format('YYYY-MM-DD')

    void Promise.all([
      supabase.from('patient_weight_measurement_records').select('weight_kg, measured_on').eq('patient_id', patientId).gte('measured_on', since),
      supabase.from('medication_intake_logs').select('care_date, taken_on').eq('patient_id', patientId).gte('taken_on', since),
      // 只取生效中排藥（非需要時服用）裡最早的建立時間：existence 用來判斷 hasScheduledMedication，
      // 建立時間用來限制漏服規則不得往回數到藥單生效之前。
      supabase.from('medication_plans').select('created_at').eq('patient_id', patientId).eq('active', true).eq('as_needed', false).order('created_at', { ascending: true }).limit(1),
    ]).then(([weightResult, doseResult, planResult]) => {
      if (cancelled) return
      if (weightResult.error) console.error('[anomaly signals weight read error]', weightResult.error)
      if (doseResult.error) console.error('[anomaly signals medication read error]', doseResult.error)
      if (planResult.error) console.error('[anomaly signals medication plan read error]', planResult.error)
      setWeightPoints(weightResult.error ? [] : (weightResult.data ?? []))
      setDoseLogs(doseResult.error ? [] : (doseResult.data ?? []))
      setDoseReadFailed(Boolean(doseResult.error))
      setCheckFailed(Boolean(weightResult.error || doseResult.error || planResult.error))
      const earliestPlan = planResult.error ? [] : (planResult.data ?? [])
      setHasScheduledMedication(earliestPlan.length > 0)
      setPlanEffectiveSinceCareDate(earliestPlan.length > 0 ? careDateKey(dayjs(earliestPlan[0].created_at)) : null)
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })

    return () => { cancelled = true }
  }, [patientId, demo, settings.weightDropWindowDays, settings.missedMedicationThresholdDays])

  useEffect(() => {
    setSettingsReadFailed(false)
    if (demo) return
    let cancelled = false
    readCareAnomalyAlertSettings(patientId)
      .then(result => { if (!cancelled) setSettings(result) })
      .catch(error => {
        console.error('[anomaly signals settings read error]', error)
        if (!cancelled) {
          setSettings(DEFAULT_CARE_ANOMALY_ALERT_SETTINGS)
          setSettingsReadFailed(true)
        }
      })
    return () => { cancelled = true }
  }, [patientId, demo])

  const items = useMemo<TodayAttentionItem[]>(() => {
    if (demo || !settings.enabled) return []

    const signals: AnomalySignal[] = []

    const weightSignal = detectWeightDropSignal(
      dailyWeightAverages(weightPoints, settings.weightDropWindowDays),
      settings.weightDropWindowDays,
      settings.weightDropThresholdPercent,
    )
    if (weightSignal) signals.push(weightSignal)

    // 服藥紀錄讀取失敗時，dailyDoseCounts 只會看到空陣列——這代表「不知道有沒有吃」，不是「確定沒吃」。
    // 把失敗當成 0 劑會把一次網路錯誤誤報成連續漏服，違反「危險判斷不能因系統故障而失真」的原則，
    // 所以讀取失敗時直接跳過這條規則，不硬套一個可能是假的示警。
    if (!doseReadFailed) {
      // dailyDoseCounts 依「日曆日」分桶（trendSeries.ts 的 trendDateKeys 用 dayjs().tz(TZ).startOf('day')），
      // 但 detectMissedMedicationSignal 排除的「今天」是指照護日（04:00 分界，同 careDateKey）。
      // 兩者不對齊時，凌晨 00:00–03:59 這段窗口會把「還沒過完的照護日」誤判成已結束而算進連續漏服天數——
      // 把 now 換成 careDayNow() 再丟進去，讓最後一個桶對齊照護日而非日曆日。
      const medicationSignal = detectMissedMedicationSignal(
        dailyDoseCounts(doseLogs, settings.missedMedicationThresholdDays + 1, careDayNow()),
        settings.missedMedicationThresholdDays,
        hasScheduledMedication,
        planEffectiveSinceCareDate,
      )
      if (medicationSignal) signals.push(medicationSignal)
    }

    const bpHighSignal = detectBpHighStreakSignal(bpRecords, settings.bpHighStreakThresholdDays, evaluator.resolver)
    if (bpHighSignal) signals.push(bpHighSignal)

    // 高血壓連續示警已經涵蓋同一批紀錄裡偏高的部分；夜間低血壓是獨立指標，兩者可以同時成立。
    const nightLowSignal = detectBpNightLowSignal(bpRecords, settings.nightLowBpWindowDays, settings.nightLowBpThresholdCount, evaluator.resolver)
    if (nightLowSignal) signals.push(nightLowSignal)

    // 觀察級信號一律 tone='ok'、dueToday=false：只記錄、不催促，見設計鐵律第 3 條與 careAnomalySignals.ts 開頭說明。
    return signals.map((signal): TodayAttentionItem => ({
      id: `anomaly:${signal.kind}`,
      tone: 'ok',
      title: text(ANOMALY_SIGNAL_TITLE[signal.kind]),
      description: text(describeAnomalySignal(signal)),
      dueToday: false,
    }))
  }, [demo, settings, weightPoints, doseLogs, doseReadFailed, hasScheduledMedication, planEffectiveSinceCareDate, bpRecords, evaluator.resolver, text])

  // 展示模式沒有任何真實查詢，checkFailed 一律為 false，不受上面幾個 state 殘留值影響。
  return { items, loading: loading || bpLoading, checkFailed: !demo && (checkFailed || settingsReadFailed || Boolean(bpError)) }
}

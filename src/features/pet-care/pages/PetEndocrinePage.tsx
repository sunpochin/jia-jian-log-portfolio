/*
檔案用途：記錄寵物胰島素用量與血糖值，監測內分泌（糖尿病）管理。
所在層：src/features/pet-care/pages；提供內分泌監測照護流程。
主要關聯：DailyCarePage、PetInsulinRecord/PetBloodGlucoseRecord 與 Supabase pet_insulin_records、pet_blood_glucose_records；
也掛載 PetVetReport 提供慢性病回診用的一頁式彙整報告。
兩個數值分開存在兩張表（測量頻率不同），但正式送出時由同一個 RPC 原子寫入，避免只完成其中一筆。
*/
import { lazy, useEffect, useRef, useState } from 'react'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import { ModuleTrendSection } from '../../../components/daily-care/ModuleTrendSection'
import { useSaveStatus } from '../../../hooks/useSaveStatus'
import { useI18n } from '../../../lib/i18n'
import { supabase } from '../../../lib/supabase'
import { TZ } from '../../../lib/timezone'
import { isDemoMode, readDemoPetGlucoseRecords, readDemoPetInsulinRecords, saveDemoPetGlucoseRecord, saveDemoPetInsulinRecord } from '../../../lib/demoStorage'
import { DEMO_PET_BLOOD_GLUCOSE_TARGET_RANGE, petBloodGlucoseStatus } from '../../../lib/petCare'
import type { PetBloodGlucoseRecord, PetInsulinRecord } from '../../../types/database'

// 圖表只在照護者展開回顧時才載入；胰島素與血糖的表單仍先保持可立即操作。
const PetTrendPanel = lazy(() => import('../components/PetTrendPanel').then(module => ({ default: module.PetTrendPanel })))
// 獸醫報告彙整體重、食慾、液體、消化與皮下點滴等多個模組，比純趨勢圖重，同樣延後載入。
const PetVetReport = lazy(() => import('../components/PetVetReport').then(module => ({ default: module.PetVetReport })))

dayjs.extend(timezone)

export function PetEndocrinePage({ patientId, patientName, userEmail, careRecipientType }: {
  patientId: string
  patientName?: string
  userEmail?: string
  careRecipientType?: 'human' | 'dog' | 'cat' | 'bird' | 'rabbit' | 'other'
}) {
  const { text } = useI18n()
  const subjectLabel = patientName || text({ id: 'Orang yang dirawat', zh: '被照護者' ,en: "Care recipient" })
  // 貓狗的 80-120 mg/dL 是獸醫參考值，不能直接套用在人類病人身上；人類的血糖判讀交給醫師，這裡只顯示原始數值。
  const isHuman = careRecipientType === 'human'
  const [insulinUnits, setInsulinUnits] = useState<number | ''>('')
  const [bloodGlucoseMgDl, setBloodGlucoseMgDl] = useState<number | ''>('')
  const [todayInsulin, setTodayInsulin] = useState<PetInsulinRecord[]>([])
  const [todayGlucose, setTodayGlucose] = useState<PetBloodGlucoseRecord[]>([])
  const [targetRange, setTargetRange] = useState<{ low_mg_dl: number; high_mg_dl: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const { status, message, setMessage, begin, succeed, fail, reset } = useSaveStatus()
  const currentPatientIdRef = useRef(patientId)
  currentPatientIdRef.current = patientId

  const loadToday = async (requestedPatientId = patientId) => {
    setLoading(true)
    const dayStart = dayjs().tz(TZ).startOf('day').toISOString()
    if (isDemoMode()) {
      setTodayInsulin(readDemoPetInsulinRecords(patientId, dayStart))
      setTodayGlucose(readDemoPetGlucoseRecords(patientId, dayStart))
      setTargetRange({ low_mg_dl: DEMO_PET_BLOOD_GLUCOSE_TARGET_RANGE.lowMgDl, high_mg_dl: DEMO_PET_BLOOD_GLUCOSE_TARGET_RANGE.highMgDl })
      setLoading(false)
      return
    }
    const [insulinResult, glucoseResult, targetRangeResult] = await Promise.all([
      supabase.from('pet_insulin_records').select('*').eq('patient_id', patientId).gte('administered_at', dayStart).order('administered_at', { ascending: false }),
      supabase.from('pet_blood_glucose_records').select('*').eq('patient_id', patientId).gte('measured_at', dayStart).order('measured_at', { ascending: false }),
      // 目標範圍也是病人資料；切換照護對象時必須用同一個 patient_id 重新查詢。
      supabase.from('pet_blood_glucose_target_ranges').select('low_mg_dl, high_mg_dl').eq('patient_id', patientId).maybeSingle(),
    ])
    // 為什麼要在 await 後比對 ref：切換病人不會取消已送出的 request，舊病人的慢回應不能覆蓋新病人的畫面與門檻。
    if (currentPatientIdRef.current !== requestedPatientId) return
    if (insulinResult.error) console.error('[pet insulin load error]', insulinResult.error)
    if (glucoseResult.error) console.error('[pet blood glucose load error]', glucoseResult.error)
    if (targetRangeResult.error) console.error('[pet blood glucose target range load error]', targetRangeResult.error)
    setTodayInsulin((insulinResult.data ?? []) as PetInsulinRecord[])
    setTodayGlucose((glucoseResult.data ?? []) as PetBloodGlucoseRecord[])
    setTargetRange((targetRangeResult.data ?? null) as { low_mg_dl: number; high_mg_dl: number } | null)
    setLoading(false)
  }

  // 換病人時清空未送出的草稿：否則沒填完就切換寵物，殘留的數值會用新病人的 patient_id 送出，寫成別隻寵物的紀錄。
  useEffect(() => {
    setInsulinUnits('')
    setBloodGlucoseMgDl('')
    // 先清掉上一位病人的門檻，避免新病人資料尚未回來前沿用舊判讀。
    setTargetRange(null)
    reset()
    void loadToday(patientId)
  }, [patientId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userEmail) return

    if (insulinUnits === '' && bloodGlucoseMgDl === '') {
      setMessage(text({ id: 'Masukkan setidaknya satu nilai.', zh: '請至少輸入一個值。' ,en: "Masukkan setidaknya satu nilai." }))
      return
    }
    // 資料庫限制兩個數值都必須 > 0，這裡先擋掉才不會讓使用者填 0 卻只看到「暫時無法儲存」這種看不出原因的錯誤。
    if ((insulinUnits !== '' && insulinUnits <= 0) || (bloodGlucoseMgDl !== '' && bloodGlucoseMgDl <= 0)) {
      setMessage(text({ id: 'Nilai harus lebih besar dari 0.', zh: '數值必須大於 0。' ,en: "Nilai must more besar from 0." }))
      return
    }

    begin()

    if (isDemoMode()) {
      if (insulinUnits !== '') saveDemoPetInsulinRecord({ id: `demo-pet-insulin-${Date.now()}`, patient_id: patientId, insulin_units: insulinUnits, insulin_type: null, injection_site: null, notes: null, administered_by: userEmail.toLowerCase(), administered_at: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      if (bloodGlucoseMgDl !== '') saveDemoPetGlucoseRecord({ id: `demo-pet-glucose-${Date.now()}`, patient_id: patientId, glucose_mg_dl: bloodGlucoseMgDl, measurement_context: null, notes: null, recorded_by: userEmail.toLowerCase(), measured_at: new Date().toISOString(), created_at: new Date().toISOString() })
      succeed(text({ id: 'Tersimpan.', zh: '已儲存。' ,en: "Saved." }))
      setInsulinUnits('')
      setBloodGlucoseMgDl('')
      await loadToday()
      return
    }

    // 一次 RPC 內完成兩張表的寫入；其中一筆失敗時資料庫會整體回滾，不能留下半套血糖／胰島素紀錄。
    const { error: saveError } = await supabase.rpc('record_pet_endocrine', {
      p_patient_id: patientId,
      p_insulin_units: insulinUnits === '' ? null : insulinUnits,
      p_glucose_mg_dl: bloodGlucoseMgDl === '' ? null : bloodGlucoseMgDl,
    })
    if (saveError) {
      console.error('[pet endocrine save error]', saveError)
      fail(text({ id: 'Tidak dapat menyimpan. Coba lagi.', zh: '暫時無法儲存，請再試一次。' ,en: "Could not save. Try again." }))
      return
    }
    succeed(text({ id: 'Tersimpan.', zh: '已儲存。' ,en: "Saved." }))
    setInsulinUnits('')
    setBloodGlucoseMgDl('')
    await loadToday()
  }

  // 先把目前病人的 target 轉成一次判讀結果，避免 JSX 重算或誤用上一位病人的門檻。
  const glucoseStatus = !isHuman && bloodGlucoseMgDl !== '' && targetRange
    ? petBloodGlucoseStatus(bloodGlucoseMgDl, { lowMgDl: targetRange.low_mg_dl, highMgDl: targetRange.high_mg_dl })
    : null

  return (
    <section className="space-y-5 px-5 py-6">
      <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
        <div>
          <label className="block text-sm font-semibold text-gray-800">
            {text({ id: 'Insulin (unit)', zh: '胰島素（單位）' ,en: "Insulin (unit)" })}
          </label>
          <p className="mt-1 text-xs text-gray-500">
            {text({ id: '(Opsional) Dosis insulin yang diberikan', zh: '（可不填）給藥的胰島素劑量' ,en: "(Opsional) Dose insulin that diberikan" })}
          </p>
          <input
            type="number"
            min="0.5"
            step="0.5"
            value={insulinUnits}
            onChange={e => setInsulinUnits(e.target.value === '' ? '' : Number(e.target.value))}
            placeholder="例：5"
            className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2.5"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-800">
            {text({ id: 'Kadar glukosa darah (mg/dL)', zh: '血糖值（mg/dL）' ,en: "Kadar glukosa blood (mg/dL)" })}
          </label>
          <p className="mt-1 text-xs text-gray-500">
            {isHuman
              ? text({ id: '(Opsional) Rentang normal berbeda untuk manusia; ikuti target dari dokter.', zh: '（可不填）人類的正常範圍不同，請依醫師設定的目標值判讀。' ,en: "(Opsional) Normal range differs for people; follow the doctor-set target." })
              : targetRange
                ? text({ id: `Rentang target: ${targetRange.low_mg_dl}-${targetRange.high_mg_dl} mg/dL`, zh: `目標範圍：${targetRange.low_mg_dl}-${targetRange.high_mg_dl} mg/dL`, en: `Target range: ${targetRange.low_mg_dl}-${targetRange.high_mg_dl} mg/dL` })
                : text({ id: 'Rentang target belum diatur.', zh: '尚未設定血糖目標範圍。', en: 'Blood glucose target range is not configured.' })}
          </p>
          <input
            type="number"
            min="5"
            step="5"
            value={bloodGlucoseMgDl}
            onChange={e => setBloodGlucoseMgDl(e.target.value === '' ? '' : Number(e.target.value))}
            placeholder="例：110"
            className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2.5"
          />
          {/* 正式資料只有在資料庫回傳目前 patient_id 的 target row 時才判讀，避免跨病人沿用門檻。 */}
          {glucoseStatus && (
            <div className="mt-2 text-xs">
              {glucoseStatus === 'low' && (
                <p className="text-yellow-600">{text({ id: '⚠ Rendah (hipoglikemia)', zh: '⚠ 低血糖' ,en: "⚠ Rendah (hipoglitomia)" })}</p>
              )}
              {glucoseStatus === 'normal' && (
                <p className="text-green-600">{text({ id: '✓ Normal', zh: '✓ 正常' ,en: "✓ Normal" })}</p>
              )}
              {glucoseStatus === 'high' && (
                <p className="text-orange-600">{text({ id: '⚠ Tinggi (hiperglikemia)', zh: '⚠ 高血糖' ,en: "⚠ Tinggi (hiperglitomia)" })}</p>
              )}
            </div>
          )}
        </div>

        {message && (
          <p className={`text-sm ${status === 'err' ? 'text-red-600' : 'text-green-600'}`}>
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={status === 'saving'}
          className="w-full rounded-xl bg-indigo-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
        >
          {text({ id: 'Simpan', zh: '儲存' ,en: "Save" })}
        </button>
      </form>

      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold text-gray-800">{text({ id: 'Catatan hari ini', zh: '今天的紀錄' ,en: "Notes days this" })}</h3>
        {loading ? (
          <p className="mt-2 text-sm text-gray-500">{text({ id: 'Memuat…', zh: '讀取中…' ,en: "Loading…" })}</p>
        ) : todayInsulin.length === 0 && todayGlucose.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">{text({ id: 'Belum ada catatan hari ini.', zh: '今天還沒有紀錄。' ,en: "No recordan days this." })}</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {todayInsulin.map(record => (
              <li key={record.id} className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2 text-sm">
                <span className="font-semibold text-gray-700">{text({ id: 'Insulin', zh: '胰島素' ,en: "Insulin" })}</span>
                <span className="font-bold text-indigo-700">{record.insulin_units} {text({ id: 'unit', zh: '單位' ,en: "unit" })}</span>
              </li>
            ))}
            {todayGlucose.map(record => (
              <li key={record.id} className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2 text-sm">
                <span className="font-semibold text-gray-700">{text({ id: 'Glukosa darah', zh: '血糖' ,en: "Glukosa blood" })}</span>
                <span className="font-bold text-indigo-700">{record.glucose_mg_dl} mg/dL</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 胰島素與血糖分開畫，因為兩者單位與量測頻率不同，不能共用同一條 Y 軸。 */}
      <ModuleTrendSection moduleId="petEndocrine" titleId="pet-endocrine-trend-title">
        {days => <PetTrendPanel kind="endocrine" patientId={patientId} days={days} refreshKey={[...todayInsulin.map(record => `${record.id}:${record.insulin_units}:${record.administered_at}`), ...todayGlucose.map(record => `${record.id}:${record.glucose_mg_dl}:${record.measured_at}`)].join('|')} />}
      </ModuleTrendSection>

      {/* 一頁式回診報告放在慢性病照護最常用到的內分泌分頁，讓照護者在回診前能直接列印／存 PDF；
          內容彙整體重、食慾、液體、消化與皮下點滴等模組，不受各模組個別的顯示開關限制。
          標題刻意用物種中性的「回診報告」而非「獸醫報告」，因為這個分頁現在人類病人也會用到。 */}
      <ModuleTrendSection moduleId="petVetReport" titleId="pet-vet-report-title" title={{ id: 'Laporan kunjungan', zh: '回診報告' ,en: "Laporan kunjungan" }}>
        {days => <PetVetReport patientId={patientId} subjectLabel={subjectLabel} days={days} careRecipientType={careRecipientType} />}
      </ModuleTrendSection>
    </section>
  )
}

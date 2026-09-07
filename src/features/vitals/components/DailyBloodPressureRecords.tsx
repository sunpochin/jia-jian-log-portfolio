/*
檔案用途：顯示並更正目前台北日期新增、會占用今日額度的血壓紀錄。
所在層：src/components；由輸入頁掛載，提供依帳號方案限制下的修正入口。
主要關聯：使用 blood_pressure_records 的病人級 RLS，並與 InputPage 共用血壓數值驗證。
*/
import { useCallback, useEffect, useRef, useState } from 'react'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import { supabase } from '../../../lib/supabase'
import { type LocalizedText, useI18n } from '../../../lib/i18n'
import { TZ } from '../../../lib/timezone'
import type { BpRecord } from '../../../types/database'
import { isValidBpInput } from '../pages/InputPage.utils'
import { VitalReading } from './VitalReading'
import { VitalAlertBadge } from './VitalAlertBadge'
import { deleteDemoBpRecord, getDemoBpRecordsCreatedBetween, isDemoMode, updateDemoBpRecord } from '../../../lib/demoStorage'
import { careDayWindow } from '../../../lib/careDay'
import { useConfirm } from '../../../hooks/useConfirm'

dayjs.extend(timezone)

type Draft = { systolic: string; diastolic: string; pulse: string }
const EMPTY_PENDING_RECORDS: BpRecord[] = []

const careDayRange = () => {
  const { start, end } = careDayWindow(1, dayjs().tz(TZ))
  return { start: start.toISOString(), end: end.toISOString() }
}

// 清單顯示的是量測時間，排序就跟著量測時間由新到舊：剛量完的那筆一定在最上面，補登的舊量測往下排，照護者不必捲到底找最新一筆。
// 同一量測時間（例如補登時只填到分鐘）再用建立時間由新到舊決勝負，讓順序穩定不跳動。
export function sortBpRecordsByMeasuredAtDesc(records: BpRecord[]): BpRecord[] {
  return [...records].sort((left, right) => Date.parse(right.measured_at) - Date.parse(left.measured_at) || Date.parse(right.created_at) - Date.parse(left.created_at))
}

// 樂觀快照的 measured_at 是前端 dayjs().toISOString()（結尾 "Z"），
// 但 Supabase/PostgREST 回傳 timestamptz 時格式不同（例如結尾 "+00:00"），
// 逐字字串比對永遠對不上，導致 pending 卡片與正式 row 同時顯示成重複紀錄；改以解析後的時間戳比對同一瞬間。
function isSameMeasuredAt(left: string, right: string): boolean {
  return Date.parse(left) === Date.parse(right)
}

export function mergeOptimisticBpRecord(records: BpRecord[], optimisticRecord: BpRecord | null, patientId: string): BpRecord[] {
  if (!optimisticRecord || optimisticRecord.patient_id !== patientId) return sortBpRecordsByMeasuredAtDesc(records)
  // 背景查詢若已找到同一量測時間的正式 row，讓資料庫版本取代暫時快照，避免 pending id 長期留在編輯／刪除入口。
  if (records.some(record => record.id === optimisticRecord.id || isSameMeasuredAt(record.measured_at, optimisticRecord.measured_at))) return sortBpRecordsByMeasuredAtDesc(records)
  return sortBpRecordsByMeasuredAtDesc([...records, optimisticRecord])
}

export function reconcileOptimisticBpRecords(records: BpRecord[], optimisticRecord: BpRecord | null, patientId: string) {
  const canonicalSeen = optimisticRecord !== null && records.some(record => record.id === optimisticRecord.id || isSameMeasuredAt(record.measured_at, optimisticRecord.measured_at))
  // 正式 row 出現後要忘掉 pending snapshot；否則刪除正式資料時，下一次 refresh 會把已刪除的量測復活。
  const remainingOptimisticRecord = canonicalSeen ? null : optimisticRecord
  return {
    records: mergeOptimisticBpRecord(records, remainingOptimisticRecord, patientId),
    optimisticRecord: remainingOptimisticRecord,
  }
}

export function mergePendingBpRecords(records: BpRecord[], pendingRecords: BpRecord[], patientId: string, optimisticPendingId?: string): BpRecord[] {
  const { start, end } = careDayRange()
  const pendingForCareDay = pendingRecords.filter(record => {
    const createdAt = Date.parse(record.created_at)
    return record.patient_id === patientId && createdAt >= Date.parse(start) && createdAt < Date.parse(end)
  })
  const canonicalRecords = records.filter(record => !record.id.startsWith('pending-bp-') || record.id === optimisticPendingId || pendingForCareDay.some(pending => pending.id === record.id))
  const additions = pendingForCareDay.filter(pending => !canonicalRecords.some(record => record.id === pending.id || isSameMeasuredAt(record.measured_at, pending.measured_at)))
  return sortBpRecordsByMeasuredAtDesc([...canonicalRecords, ...additions])
}

export function DailyBloodPressureRecords({ patientId, refreshVersion, pendingRecords = EMPTY_PENDING_RECORDS, optimisticRecord = null, onChanged }: { patientId: string; refreshVersion: number; pendingRecords?: BpRecord[]; optimisticRecord?: BpRecord | null; onChanged?: () => void }) {
  const { text } = useI18n()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [records, setRecords] = useState<BpRecord[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>({ systolic: '', diastolic: '', pulse: '' })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<LocalizedText | null>(null)
  const optimisticRecordRef = useRef<BpRecord | null>(optimisticRecord)
  const pendingRecordsRef = useRef<BpRecord[]>(pendingRecords)
  const remoteRecordsRef = useRef<BpRecord[]>([])
  const refreshRequestIdRef = useRef(0)
  const previousPatientIdRef = useRef(patientId)

  useEffect(() => {
    const patientChanged = previousPatientIdRef.current !== patientId
    previousPatientIdRef.current = patientId
    optimisticRecordRef.current = optimisticRecord
    pendingRecordsRef.current = pendingRecords
    if (patientChanged) remoteRecordsRef.current = []
    // 切換對象時先清空舊清單，等新對象查詢完成，避免慢查詢期間短暫混顯另一人的健康資料。
    const reconciled = reconcileOptimisticBpRecords(patientChanged ? [] : remoteRecordsRef.current, optimisticRecord, patientId)
    setRecords(mergePendingBpRecords(reconciled.records, pendingRecords, patientId, optimisticRecord?.id))
  }, [optimisticRecord, patientId, pendingRecords])

  const refresh = useCallback(async () => {
    const requestId = ++refreshRequestIdRef.current
    const { start, end } = careDayRange()
    if (isDemoMode()) {
      // Demo 清單只顯示訪客本次新增的紀錄；固定故事資料是背景，不應假裝成今天剛寫入的額度紀錄。
      if (requestId !== refreshRequestIdRef.current) return
      remoteRecordsRef.current = getDemoBpRecordsCreatedBetween(patientId, start, end)
      const reconciled = reconcileOptimisticBpRecords(remoteRecordsRef.current, optimisticRecordRef.current, patientId)
      optimisticRecordRef.current = reconciled.optimisticRecord
      setRecords(mergePendingBpRecords(reconciled.records, pendingRecordsRef.current, patientId, optimisticRecordRef.current?.id))
      setMessage(null)
      return
    }
    // 配額依伺服器建立時間的照護日計算；篩選條件必須採同一欄位，補登舊量測才找得到並能釋出名額。
    // 但排序改用畫面顯示的量測時間由新到舊，與其他量測清單一致；merge 之後仍會再排一次，所以樂觀快照也會落在正確位置。
    const { data, error } = await supabase.from('blood_pressure_records').select('*').eq('patient_id', patientId).gte('created_at', start).lt('created_at', end).order('measured_at', { ascending: false })
    if (requestId !== refreshRequestIdRef.current) return
    if (error) {
      console.error('[daily blood pressure read error]', error)
      setMessage({ id: 'Catatan tekanan darah hari ini tidak dapat dimuat.', zh: '目前無法讀取今天的血壓紀錄。' ,en: 'Record blood pressure days this not can dimuat.' })
      return
    }
    remoteRecordsRef.current = (data ?? []) as BpRecord[]
    const reconciled = reconcileOptimisticBpRecords(remoteRecordsRef.current, optimisticRecordRef.current, patientId)
    optimisticRecordRef.current = reconciled.optimisticRecord
    setRecords(mergePendingBpRecords(reconciled.records, pendingRecordsRef.current, patientId, optimisticRecordRef.current?.id))
  }, [patientId])

  useEffect(() => { void refresh() }, [refresh, refreshVersion])

  const edit = (record: BpRecord) => {
    setEditingId(record.id)
    setDraft({ systolic: String(record.systolic), diastolic: String(record.diastolic), pulse: record.pulse == null ? '' : String(record.pulse) })
    setMessage(null)
  }

  const save = async (record: BpRecord) => {
    const systolic = Number(draft.systolic); const diastolic = Number(draft.diastolic); const pulse = draft.pulse === '' ? null : Number(draft.pulse)
    if (!isValidBpInput(systolic, diastolic, pulse)) {
      setMessage({ id: 'Periksa kembali tekanan sistolik dan diastolik, serta denyut bila diisi.', zh: '請重新確認高壓、低壓，以及有填寫時的心跳數字。' ,en: 'Periksa back tekanan sistolik and diastolik, serta heart rate bila diisi.' })
      return
    }
    setSaving(true); setMessage(null)
    try {
      if (isDemoMode()) {
        if (!updateDemoBpRecord(record.id, patientId, { systolic, diastolic, pulse })) throw new Error('Demo blood-pressure record not found')
      } else {
        const { error } = await supabase.from('blood_pressure_records').update({ systolic, diastolic, pulse }).eq('id', record.id).eq('patient_id', patientId)
        if (error) throw error
      }
    } catch (error) {
      console.error('[daily blood pressure update error]', error)
      setMessage({ id: 'Catatan tidak dapat diperbarui. Periksa jaringan lalu coba lagi.', zh: '無法更新紀錄，請確認網路後再試。' ,en: 'Unable to update records, please check your network and try again.' })
      setSaving(false)
      return
    }
    setSaving(false)
    setEditingId(null)
    setMessage({ id: 'Catatan tekanan darah diperbarui.', zh: '血壓紀錄已更新。' ,en: 'Record blood pressure diUpdate.' })
    await refresh(); onChanged?.()
  }

  const remove = async (record: BpRecord) => {
    // 刪除會釋出每日名額，先確認才能避免把可用的 722 量測紀錄誤刪。
    if (!(await confirm(text({ id: 'Hapus catatan tekanan darah ini? Tindakan ini tidak dapat dibatalkan.', zh: '確定刪除這筆血壓紀錄嗎？此操作無法復原。' ,en: 'Delete record blood pressure this? Tindakan this not can dibatalkan.' }), { danger: true }))) return
    setSaving(true); setMessage(null)
    try {
      if (isDemoMode()) {
        if (!deleteDemoBpRecord(record.id, patientId)) throw new Error('Demo blood-pressure record not found')
      } else {
        const { error } = await supabase.from('blood_pressure_records').delete().eq('id', record.id).eq('patient_id', patientId)
        if (error) throw error
      }
    } catch (error) {
      console.error('[daily blood pressure delete error]', error)
      setMessage({ id: 'Catatan tidak dapat dihapus. Periksa jaringan lalu coba lagi.', zh: '無法刪除紀錄，請確認網路後再試。' ,en: 'Unable to delete record, please check your network and try again.' })
      setSaving(false)
      return
    }
    setSaving(false)
    setEditingId(null)
    setMessage({ id: 'Catatan tekanan darah dihapus.', zh: '血壓紀錄已刪除。' ,en: 'Record blood pressure deleted.' })
    await refresh(); onChanged?.()
  }

  return <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="today-bp-records-title">
    {confirmDialog}
    <div className="flex items-center justify-between gap-3"><div><h2 id="today-bp-records-title" className="font-bold text-slate-900">{text({ id: 'Catatan hari perawatan ini', zh: '本照護日新增的量測紀錄' ,en: 'Measurement records added on this day of care' })}</h2><p className="mt-1 text-xs text-slate-600">{text({ id: `${records.length} catatan pada hari perawatan ini. Catatan pengukuran lama yang baru diisi juga muncul di sini agar dapat diperbaiki atau dihapus.`, zh: `本照護日新增 ${records.length} 筆；補登的舊量測也會顯示在這裡，可修改或刪除。` ,en: `${records.length} records were added on this care day. Older measurements entered today also appear here so they can be corrected or deleted.` })}</p></div><span className="text-sm font-black text-slate-700">{records.length}</span></div>
    {message && <p role="status" className="mt-3 text-xs font-semibold text-slate-700">{text(message)}</p>}
    {records.length === 0 ? <p className="mt-3 text-sm text-slate-500">{text({ id: 'Belum ada catatan pada hari perawatan ini.', zh: '本照護日還沒有量測紀錄。' ,en: 'No measurements have been recorded for this day of care.' })}</p> : <ol className="mt-3 space-y-2">{records.map(record => {
      const isPending = record.id.startsWith('pending-bp-')
      return <li key={record.id} className="rounded-2xl bg-slate-50 p-3 text-sm">
        {editingId === record.id ? <div className="space-y-3"><div className="grid grid-cols-3 gap-2">{(['systolic', 'diastolic', 'pulse'] as const).map(key => <input key={key} aria-label={text(key === 'systolic' ? { id: 'Sistolik', zh: '高壓' ,en: 'Systolic' } : key === 'diastolic' ? { id: 'Diastolik', zh: '低壓' ,en: 'LOW PRESSURE' } : { id: 'Nadi (opsional)', zh: '心跳（可不填）' ,en: 'Heartbeat (optional)' })} type="number" inputMode="numeric" value={draft[key]} onChange={event => setDraft(current => ({ ...current, [key]: event.target.value }))} className="min-h-11 min-w-0 rounded-xl border border-slate-300 px-2 py-2 text-center font-bold" />)}</div><div className="flex gap-2"><button type="button" disabled={saving} onClick={() => void save(record)} className="min-h-11 rounded-xl bg-indigo-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-60">{text({ id: 'Simpan perubahan', zh: '儲存修改' ,en: 'Save Changes' })}</button><button type="button" disabled={saving} onClick={() => setEditingId(null)} className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700">{text({ id: 'Batal', zh: '取消' ,en: 'CANCEL' })}</button></div></div> : <div className="flex flex-wrap items-center justify-between gap-2"><div><div className="flex flex-wrap items-center gap-2"><time className="text-xs text-slate-500">{dayjs(record.measured_at).tz(TZ).format('YYYY/MM/DD HH:mm')}</time><VitalAlertBadge systolic={record.systolic} diastolic={record.diastolic} pulse={record.pulse} /></div><VitalReading systolic={record.systolic} diastolic={record.diastolic} pulse={record.pulse} className="mt-0.5 text-base font-black" />{isPending && <p className="mt-1 text-xs font-semibold text-slate-500" role="status">{text({ id: 'Menyinkronkan…', zh: '同步中…' ,en: 'Syncing…' })}</p>}</div><div className="flex gap-2"><button type="button" disabled={saving || isPending} onClick={() => edit(record)} className="min-h-11 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-indigo-800 disabled:opacity-50">{text({ id: 'Ubah', zh: '修改' ,en: 'Modification' })}</button><button type="button" disabled={saving || isPending} onClick={() => void remove(record)} className="min-h-11 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-50">{text({ id: 'Hapus', zh: '刪除' ,en: 'DELETE' })}</button></div></div>}
      </li>
    })}</ol>}
  </section>
}

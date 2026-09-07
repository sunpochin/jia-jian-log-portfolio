/*
檔案用途：新增、回顧與更正人或寵物的照護大事記。
所在層：src/features/care-family/components；由事件頁與資料頁的照護脈絡區使用。
主要關聯：使用 careTimeline、careEventPhotos、Supabase 病人級授權與 VitalReading 顯示附近量測。
*/
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import { supabase } from '../../../lib/supabase'
import { buildCareTimelineInsert, careTimelineEventText, CARE_TIMELINE_EVENT_TYPES, CARE_TIMELINE_INITIAL_LIMIT, eventReviewWindow, findTimelineReadingContext, isValidCareTimelineDraft, pendingReassessments, summarizeEventReviewDays, visibleCareTimelineEntries, type CareTimelineEntry, type CareTimelineEventType } from '../../../lib/careTimeline'
import { CARE_EVENT_PHOTO_LIMIT, createCareTimelineEntryId, normalizeCareEventPhotoPaths, removeCareEventPhotoPaths, serializeCareEventPhotoPaths, signCareEventPhotoPathsBestEffort, uploadCareEventPhotos } from '../../../lib/careEventPhotos'
import { useI18n, type LocalizedText } from '../../../lib/i18n'
import { useConfirm } from '../../../hooks/useConfirm'
import { readErrorFields } from '../../../lib/dataErrors'
import { TZ } from '../../../lib/timezone'
import type { BpRecord } from '../../../types/database'
import { VitalReading } from '../../vitals/components/VitalReading'
import { isDemoPatientId, getFallbackDemoCareTimeline } from '../../../lib/demoData'
import { formatDoseAmountLocalized } from '../../../lib/medications'
import { medicationSlotText } from '../../../lib/medicationSchedule'
import type { CareEventPhotoAttachment, StoredCareEventPhoto } from '../../../types/database'

dayjs.extend(timezone)

const localDateTimeValue = () => dayjs().tz(TZ).format('YYYY-MM-DDTHH:mm')

// JPEG fallback 程式碼已併入 staging；重新開放上傳入口前，請先確認
// 20260817090000_allow_jpeg_care_event_photos.sql 這個 migration 已對 staging／production 執行過 `supabase db push`。
const CARE_EVENT_PHOTO_UPLOAD_ENABLED = true

export function CareTimeline({ patientId, userEmail, records }: { patientId: string; userEmail?: string; records: BpRecord[] }) {
  const { text } = useI18n()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [entries, setEntries] = useState<CareTimelineEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [timelineExpanded, setTimelineExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [eventType, setEventType] = useState<CareTimelineEventType>('family_observation')
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [occurredAt, setOccurredAt] = useState(localDateTimeValue)
  const [reassessOn, setReassessOn] = useState('')
  const [editingEntry, setEditingEntry] = useState<CareTimelineEntry | null>(null)
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [photoSelectionPatientId, setPhotoSelectionPatientId] = useState<string | null>(null)
  // iOS Safari 對同一個 input 同時使用 capture 與 multiple 的行為不一致；拆成兩個入口才能明確保留拍照與相簿選取。
  const cameraPhotoInputRef = useRef<HTMLInputElement>(null)
  const libraryPhotoInputRef = useRef<HTMLInputElement>(null)
  const patientIdRef = useRef(patientId)
  const reassessments = useMemo(() => pendingReassessments(entries, dayjs().tz(TZ).format('YYYY-MM-DD')), [entries])
  const visibleEntries = visibleCareTimelineEntries(entries, timelineExpanded)

  const refresh = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('care_timeline_entries')
      .select('id, patient_id, event_type, title, details, occurred_at, reassess_on, created_by, created_at, medication_plan_id, medication_plan_change_log_id, medication_change_snapshot, photo_paths')
      .eq('patient_id', patientId).order('occurred_at', { ascending: false }).limit(20)
    if (error || (!data || data.length === 0)) {
      if (isDemoPatientId(patientId)) {
        setEntries(getFallbackDemoCareTimeline() as CareTimelineEntry[])
      } else if (error) {
        console.error('[care timeline read error]', error)
        setMessage(text({ id: 'Catatan perawatan belum dapat dibaca. Periksa jaringan lalu coba lagi.', zh: '暫時無法讀取照護紀錄，請確認網路後重試。' ,en: 'There was an error reading your care history, please check your network and try again.' }))
      } else {
        setEntries([])
      }
    } else {
      const rawEntries = (data ?? []) as CareTimelineEntry[]
      try {
        // 列表只簽縮圖，原圖等使用者點擊才簽，避免每次打開時間線都觸發不必要的流量。
        const thumbnailPaths = rawEntries.flatMap(entry => normalizeCareEventPhotoPaths(entry.photo_paths).map(photo => photo.thumbnail_path))
        const thumbnailUrls = await signCareEventPhotoPathsBestEffort(thumbnailPaths)
        setEntries(rawEntries.map(entry => ({
          ...entry,
          photo_paths: normalizeCareEventPhotoPaths(entry.photo_paths).map(photo => ({ ...photo, thumbnailUrl: thumbnailUrls[photo.thumbnail_path] })),
        })))
      } catch (photoError) {
        // 照片簽署失敗不應讓家屬連文字事件也看不到；點擊照片時仍可再次嘗試取得原圖。
        console.error('[care event photo URL error]', photoError)
        setEntries(rawEntries)
      }
    }
    setLoading(false)
  }, [patientId, text])

  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    patientIdRef.current = patientId
    // 切換對象時清掉未送出的照片；否則下一次儲存可能把上一位病人的照片帶到新表單。
    setEditingEntry(null); setTitle(''); setDetails(''); setReassessOn(''); setOccurredAt(localDateTimeValue()); setExpanded(false); setTimelineExpanded(false)
    setPhotoFiles([]); setPhotoSelectionPatientId(null); setMessage('')
    if (cameraPhotoInputRef.current) cameraPhotoInputRef.current.value = ''
    if (libraryPhotoInputRef.current) libraryPhotoInputRef.current.value = ''
  }, [patientId])

  const existingPhotoCount = normalizeCareEventPhotoPaths(editingEntry?.photo_paths).length

  const selectPhotoFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const pickedFiles = Array.from(event.currentTarget.files ?? [])
    event.currentTarget.value = ''
    if (pickedFiles.length === 0) return
    if (pickedFiles.some(file => !file.type.startsWith('image/'))) {
      setMessage(text({ id: 'Pilih file gambar yang dapat dibaca oleh browser.', zh: '請選擇瀏覽器可讀取的圖片檔案。' ,en: 'Select file gambar that can dibaca oleh browser.' }))
      return
    }
    const nextFiles = [...photoFiles, ...pickedFiles]
    if (existingPhotoCount + nextFiles.length > CARE_EVENT_PHOTO_LIMIT) {
      setMessage(text({ id: `Maksimal ${CARE_EVENT_PHOTO_LIMIT} foto per catatan.`, zh: `每筆紀錄最多 ${CARE_EVENT_PHOTO_LIMIT} 張照片。` ,en: `Up to ${CARE_EVENT_PHOTO_LIMIT} photos per record.` }))
      return
    }
    // 先記住選圖當下的 patientId；若使用者之後切換對象，save 會拒絕混用這批照片。
    setPhotoSelectionPatientId(patientId)
    setPhotoFiles(nextFiles)
    setMessage('')
  }

  const removeSelectedPhoto = (index: number) => {
    setPhotoFiles(current => current.filter((_, currentIndex) => currentIndex !== index))
    if (photoFiles.length <= 1) setPhotoSelectionPatientId(null)
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (photoSelectionPatientId && photoSelectionPatientId !== patientId) {
      setMessage(text({ id: 'Subjek sudah berubah. Pilih ulang foto untuk subjek ini.', zh: '照護對象已切換，請重新選擇這位對象的照片。' ,en: 'The subject has been switched, please re-select a photo of this subject.' }))
      return
    }
    if (!userEmail || !isValidCareTimelineDraft(title, details)) {
      setMessage(text({ id: 'Isi judul (maks. 120 huruf) dan ringkasan (maks. 2.000 huruf).', zh: '請填寫標題（最多 120 字）及摘要（最多 2,000 字）。' ,en: 'Isi judul (maks. 120 huruf) and ringkasan (maks. 2.000 huruf).' }))
      return
    }
    const targetPatientId = photoSelectionPatientId ?? patientId
    const selectedFilesAtStart = [...photoFiles]
    setSaving(true); setMessage('')
    // 發生時間由照護者明確填寫，避免補登時誤把輸入時間當成真正發生時間。
    const draft = buildCareTimelineInsert(targetPatientId, eventType, title, details, dayjs.tz(occurredAt, TZ).toISOString(), reassessOn, userEmail)
    let uploadedPhotos: StoredCareEventPhoto[] = []
    let createdEntryId: string | null = null
    try {
      if (editingEntry) {
        if (selectedFilesAtStart.length > 0) {
          uploadedPhotos = await uploadCareEventPhotos(targetPatientId, editingEntry.id, selectedFilesAtStart)
        }
        const existingPhotos = serializeCareEventPhotoPaths(normalizeCareEventPhotoPaths(editingEntry.photo_paths))
        const nextPhotos = uploadedPhotos.length > 0 ? [...existingPhotos, ...uploadedPhotos] : undefined
        const { error } = await supabase.from('care_timeline_entries').update({
          event_type: draft.event_type,
          title: draft.title,
          details: draft.details,
          occurred_at: draft.occurred_at,
          reassess_on: draft.reassess_on,
          ...(nextPhotos ? { photo_paths: nextPhotos } : {}),
        }).eq('id', editingEntry.id).eq('patient_id', targetPatientId)
        if (error) throw error
      } else if (selectedFilesAtStart.length > 0) {
        // 先用 client UUID 形成固定 Storage path，再同一筆 insert 寫入 metadata；失敗時可完整清理，不留空事件。
        createdEntryId = createCareTimelineEntryId()
        uploadedPhotos = await uploadCareEventPhotos(targetPatientId, createdEntryId, selectedFilesAtStart)
        const { error } = await supabase.from('care_timeline_entries').insert({ ...draft, id: createdEntryId, photo_paths: uploadedPhotos })
        if (error) throw error
      } else {
        const { error } = await supabase.from('care_timeline_entries').insert(draft)
        if (error) throw error
      }
      setTitle(''); setDetails(''); setReassessOn(''); setOccurredAt(localDateTimeValue()); setExpanded(false); setEditingEntry(null); setPhotoFiles([]); setPhotoSelectionPatientId(null)
      if (cameraPhotoInputRef.current) cameraPhotoInputRef.current.value = ''
      if (libraryPhotoInputRef.current) libraryPhotoInputRef.current.value = ''
      setMessage(text(editingEntry ? { id: 'Catatan perawatan diperbarui.', zh: '照護紀錄已更新。' ,en: 'Care record updated.' } : { id: 'Catatan perawatan tersimpan.', zh: '照護紀錄已儲存。' ,en: 'Care record saved.' }))
      // 若上傳期間切換了病人，下一個 effect 會載入新病人；不要用舊 closure 把舊資料刷回畫面。
      if (patientIdRef.current === targetPatientId) await refresh()
    } catch (error) {
      console.error('[care timeline save error]', error)
      if (uploadedPhotos.length > 0) {
        try {
          await removeCareEventPhotoPaths(uploadedPhotos.flatMap(photo => [photo.path, photo.thumbnail_path]))
        } catch (cleanupError) {
          console.error('[care timeline save cleanup error]', cleanupError)
        }
      }
      if (createdEntryId) {
        const { error: deleteError } = await supabase.from('care_timeline_entries').delete().eq('id', createdEntryId).eq('patient_id', targetPatientId)
        if (deleteError) console.error('[care timeline orphan cleanup error]', deleteError)
      }
      const databaseMessage = readErrorFields(error).message
      // 手機使用者通常無法開發者工具；把精簡後的錯誤原文附在畫面訊息裡，方便回報真正卡在哪一步。
      const detailSuffix = databaseMessage ? ` (${databaseMessage.slice(0, 200)})` : ''
      setMessage(text(databaseMessage.includes('daily_care_timeline_limit')
        ? { id: 'Hari ini sudah mencapai batas penambahan catatan untuk akun ini. Perbaiki atau hapus catatan hari ini bila perlu.', zh: '今天已達到此帳號的大事記新增上限；需要時可修改或刪除今天的紀錄。' ,en: 'You’ve reached the maximum number of events added to this account today; you can modify or delete today’s records if you need to.' }
        : selectedFilesAtStart.length > 0
          ? { id: `Foto belum tersimpan. Periksa jaringan atau pilih foto lain lalu coba lagi.${detailSuffix}`, zh: `照片尚未儲存，請確認網路或換照片後再試。${detailSuffix}` ,en: `Photo was not saved. Check your connection or choose another photo and try again.${detailSuffix}` }
          : { id: `Gagal menyimpan catatan. Periksa jaringan lalu coba lagi.${detailSuffix}`, zh: `儲存照護紀錄失敗，請確認網路後重試。${detailSuffix}` ,en: `Failed to save the care record. Check your connection and try again.${detailSuffix}` }))
    }
    setSaving(false)
  }

  const beginEdit = (entry: CareTimelineEntry) => {
    // 使用同一張表單修改，避免新增與編輯規則分成兩份後漏掉藥單同病人驗證。
    if (entry.medication_plan_change_log_id || entry.event_type === 'medication_change') return
    setEditingEntry(entry); setEventType(entry.event_type); setTitle(entry.title); setDetails(entry.details); setOccurredAt(dayjs(entry.occurred_at).tz(TZ).format('YYYY-MM-DDTHH:mm')); setReassessOn(entry.reassess_on ?? ''); setPhotoFiles([]); setPhotoSelectionPatientId(null); setExpanded(true); setMessage('')
  }

  const cancelEdit = () => {
    setEditingEntry(null); setTitle(''); setDetails(''); setReassessOn(''); setOccurredAt(localDateTimeValue()); setPhotoFiles([]); setPhotoSelectionPatientId(null); setExpanded(false)
    if (cameraPhotoInputRef.current) cameraPhotoInputRef.current.value = ''
    if (libraryPhotoInputRef.current) libraryPhotoInputRef.current.value = ''
  }

  const remove = async (entry: CareTimelineEntry) => {
    if (entry.medication_plan_change_log_id || entry.event_type === 'medication_change') return
    // 大事記是交班脈絡，刪除前再次確認以避免把仍需追蹤的事件誤移除。
    if (!(await confirm(text({ id: 'Hapus catatan perawatan ini? Tindakan ini tidak dapat dibatalkan.', zh: '確定刪除這筆照護大事記嗎？此操作無法復原。' ,en: 'Delete record care this? Tindakan this not can dibatalkan.' }), { danger: true }))) return
    const photoPaths = normalizeCareEventPhotoPaths(entry.photo_paths).flatMap(photo => [photo.path, photo.thumbnail_path])
    setSaving(true)
    const { error } = await supabase.from('care_timeline_entries').delete().eq('id', entry.id).eq('patient_id', patientId)
    setSaving(false)
    if (error) {
      console.error('[care timeline delete error]', error)
      setMessage(text({ id: 'Catatan tidak dapat dihapus. Periksa jaringan lalu coba lagi.', zh: '無法刪除紀錄，請確認網路後再試。' ,en: 'Unable to delete record, please check your network and try again.' }))
      return
    }
    let photoCleanupFailed = false
    if (photoPaths.length > 0) {
      try {
        await removeCareEventPhotoPaths(photoPaths)
      } catch (cleanupError) {
        photoCleanupFailed = true
        console.error('[care timeline delete photo cleanup error]', cleanupError)
      }
    }
    if (editingEntry?.id === entry.id) cancelEdit()
    setMessage(text(photoCleanupFailed
      ? { id: 'Catatan dihapus, tetapi foto belum dapat dibersihkan. Coba lagi nanti.', zh: '照護紀錄已刪除，但照片尚未清理完成，請稍後再試。' ,en: 'The care record has been deleted, but the photo hasn’t been cleaned up yet, please try again later.' }
      : { id: 'Catatan perawatan dihapus.', zh: '照護紀錄已刪除。' ,en: 'The care record has been deleted.' }))
    await refresh()
  }

  return <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-labelledby="care-timeline-title">
    {confirmDialog}
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 id="care-timeline-title" className="text-lg font-black text-slate-950">{text({ id: 'Kisah besar perawatan', zh: '照護大事記' ,en: 'Care Memorabilia' })}</h2><p className="mt-1 text-xs text-slate-600">{text({ id: 'Tulis peristiwa yang ingin diingat—untuk manusia maupun hewan—terpisah dari catatan harian.', zh: '記下值得回顧的人與寵物事件，和每日量測、服藥分開保存。' ,en: 'Tulis peristiwa that ingin diingat—for manusia maupun animal—separate from record daysan.' })}</p></div>
      {/* 事件新增是照護者最常用的入口；統一至少 44px 並保留可見鍵盤焦點，降低手機誤觸。 */}
      <button type="button" onClick={() => editingEntry ? cancelEdit() : setExpanded(current => !current)} className="min-h-11 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-bold text-indigo-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{expanded ? text({ id: 'Tutup', zh: '收起' ,en: 'Collapse all' }) : text({ id: 'Tambah catatan', zh: '新增紀錄' ,en: 'Add New Transaction' })}</button>
    </div>
    {expanded && <form onSubmit={save} className="mt-4 space-y-3 rounded-xl bg-slate-50 p-3">
      <label className="block text-sm font-bold text-slate-800">{text({ id: 'Jenis catatan', zh: '紀錄類型' ,en: 'Type record' })}<select value={eventType} onChange={event => setEventType(event.target.value as CareTimelineEventType)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2">{CARE_TIMELINE_EVENT_TYPES.map(type => <option key={type} value={type}>{text(careTimelineEventText[type])}</option>)}</select></label>
      <label className="block text-sm font-bold text-slate-800">{text({ id: 'Judul singkat', zh: '簡短標題' ,en: 'Judul singkat' })}<input required maxLength={120} value={title} onChange={event => setTitle(event.target.value)} placeholder={text({ id: 'Contoh: Dokter meminta ukur pagi dan malam', zh: '例如：醫師指示早晚量測' ,en: 'Ex: Doctors ordered morning and evening measurements' })} className="mt-1 block w-full rounded-lg border border-slate-300 p-2" /></label>
      <label className="block text-sm font-bold text-slate-800">{text({ id: 'Alasan atau rincian', zh: '原因或細節' ,en: 'Reason or details' })}<textarea maxLength={2000} value={details} onChange={event => setDetails(event.target.value)} rows={3} placeholder={text({ id: 'Apa yang diamati, siapa yang memberi arahan, dan apa yang perlu diperhatikan.', zh: '記下觀察到什麼、誰給了指示、接下來要注意什麼。' ,en: 'Apa that diamati, siapa that memberi arahan, and apa that perlu diperhatikan.' })} className="mt-1 block w-full rounded-lg border border-slate-300 p-2" /></label>
      <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-bold text-slate-800">{text({ id: 'Waktu kejadian', zh: '發生時間' ,en: 'When' })}<input type="datetime-local" required value={occurredAt} onChange={event => setOccurredAt(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 p-2" /></label><label className="block text-sm font-bold text-slate-800">{text({ id: 'Evaluasi lagi (opsional)', zh: '下次評估（選填）' ,en: 'Next assessment (optional)' })}<input type="date" value={reassessOn} onChange={event => setReassessOn(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 p-2" /></label></div>
      {CARE_EVENT_PHOTO_UPLOAD_ENABLED && <div className="rounded-lg border border-slate-200 bg-white p-3">
        <label htmlFor="care-timeline-photo-input" className="block text-sm font-bold text-slate-800">{text({ id: 'Foto kejadian (opsional)', zh: '事件照片（選填）' ,en: 'Photo of the incident (optional)' })}</label>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <button type="button" disabled={existingPhotoCount + photoFiles.length >= CARE_EVENT_PHOTO_LIMIT} onClick={() => cameraPhotoInputRef.current?.click()} className="min-h-11 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-bold text-indigo-800 disabled:opacity-50">📷 {text({ id: 'Ambil foto', zh: '拍照', en: 'Take Photo' })}</button>
          <button type="button" disabled={existingPhotoCount + photoFiles.length >= CARE_EVENT_PHOTO_LIMIT} onClick={() => libraryPhotoInputRef.current?.click()} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 disabled:opacity-50">🖼️ {text({ id: 'Pilih dari galeri', zh: '從相簿選取', en: 'Select from album' })}</button>
        </div>
        <input ref={cameraPhotoInputRef} id="care-timeline-camera-photo-input" type="file" accept="image/*" capture="environment" disabled={existingPhotoCount + photoFiles.length >= CARE_EVENT_PHOTO_LIMIT} onChange={selectPhotoFiles} className="sr-only" aria-describedby="care-timeline-photo-help" />
        <input ref={libraryPhotoInputRef} id="care-timeline-photo-input" type="file" accept="image/*" multiple disabled={existingPhotoCount + photoFiles.length >= CARE_EVENT_PHOTO_LIMIT} onChange={selectPhotoFiles} className="sr-only" aria-describedby="care-timeline-photo-help" />
        <p id="care-timeline-photo-help" className="mt-2 text-xs text-slate-600">{text({ id: `Maksimal ${CARE_EVENT_PHOTO_LIMIT} foto. Anda dapat mengambil foto baru atau memilih foto yang sudah ada; foto akan diperkecil ke WebP sebelum diunggah.`, zh: `最多 ${CARE_EVENT_PHOTO_LIMIT} 張；可拍新照片或選擇手機已有相片，上傳前會先縮成 WebP，列表只載入縮圖。` ,en: `You can take a new photo or choose an existing one. Up to ${CARE_EVENT_PHOTO_LIMIT} photos are allowed; each photo is resized to WebP before upload.` })}</p>
        {existingPhotoCount > 0 && <p className="mt-1 text-xs font-semibold text-slate-700">{text({ id: `${existingPhotoCount} foto sudah terlampir.`, zh: `目前已有 ${existingPhotoCount} 張照片。` ,en: `${existingPhotoCount} photos already attached.` })}</p>}
        {photoFiles.length > 0 && <ul className="mt-2 space-y-1 text-xs text-slate-700">{photoFiles.map((file, index) => <li key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1.5"><span className="min-w-0 truncate">{file.name}</span><button type="button" onClick={() => removeSelectedPhoto(index)} className="min-h-11 shrink-0 rounded-md border border-slate-300 bg-white px-2 font-bold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{text({ id: 'Hapus', zh: '移除' ,en: 'Delete' })}</button></li>)}</ul>}
      </div>}
      <button type="submit" disabled={saving} className="min-h-11 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:opacity-60">{saving ? text({ id: 'Menyimpan…', zh: '儲存中…' ,en: 'Saving...' }) : editingEntry ? text({ id: 'Simpan perubahan', zh: '儲存修改' ,en: 'Save Changes' }) : text({ id: 'Simpan catatan', zh: '儲存紀錄' ,en: 'Save Recording' })}</button>
    </form>}
    {message && <p role="status" className="mt-3 text-xs font-semibold text-slate-700">{message}</p>}
    {reassessments.length > 0 && <section className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3" aria-labelledby="reassessments-title">
      <h3 id="reassessments-title" className="text-sm font-black text-amber-950">{text({ id: 'Langkah berikutnya', zh: '下一步' ,en: 'Next' })}</h3>
      <ul className="mt-2 space-y-1">{reassessments.map(entry => <li key={entry.id} className="text-xs text-amber-950"><b>{entry.reassess_on}</b> · {entry.title}</li>)}</ul>
    </section>}
    <p className="mt-4 text-xs text-slate-500">{text({ id: 'Pembacaan sebelum dan sesudah hanya menunjukkan catatan terdekat dalam rentang laporan (maks. 48 jam), bukan bukti sebab-akibat atau saran medis.', zh: '前後讀值只顯示目前報告區間內、48 小時最接近的量測，並非因果證明或醫療建議。' ,en: 'The readings before and after show only the closest measurements within the current reporting interval, 48 hours, and are not proof of cause and effect or medical advice.' })}</p>
    <ol id="care-timeline-entries" className="mt-3 space-y-3">{loading ? <li className="text-sm text-slate-500">{text({ id: 'Memuat…', zh: '載入中…' ,en: 'Loading…' })}</li> : visibleEntries.length ? visibleEntries.map(entry => <TimelineEntry key={entry.id} entry={entry} patientId={patientId} records={records} text={text} onEdit={beginEdit} onDelete={remove} saving={saving} />) : <li className="text-sm text-slate-500">{text({ id: 'Belum ada peristiwa besar. Tambahkan saat ada hal yang ingin diingat.', zh: '還沒有大事記；遇到想留給未來自己的事，再寫下來。' ,en: 'Not yet ada peristiwa besar. Add when ada hal that ingin diingat.' })}</li>}</ol>
    {!loading && entries.length > CARE_TIMELINE_INITIAL_LIMIT && <button type="button" aria-expanded={timelineExpanded} aria-controls="care-timeline-entries" onClick={() => setTimelineExpanded(current => !current)} className="mt-3 min-h-11 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-bold text-indigo-800">{timelineExpanded ? text({ id: 'Sembunyikan catatan lama', zh: '收起較早紀錄' ,en: 'Collapse older records' }) : text({ id: 'Tampilkan catatan sebelumnya', zh: '顯示較早紀錄' ,en: 'Tampilkan record senot yetnya' })}</button>}
  </section>
}

function TimelineEntry({ entry, patientId, records, text, onEdit, onDelete, saving }: { entry: CareTimelineEntry; patientId: string; records: BpRecord[]; text: (value: LocalizedText) => string; onEdit: (entry: CareTimelineEntry) => void; onDelete: (entry: CareTimelineEntry) => void; saving: boolean }) {
  const context = findTimelineReadingContext(records, entry.occurred_at)
  const [reviewOpen, setReviewOpen] = useState(false)
  const systemSnapshot = entry.medication_change_snapshot
  const isSystemEvent = Boolean(entry.medication_plan_change_log_id && systemSnapshot)
  const isProtectedMedicationEvent = isSystemEvent || entry.event_type === 'medication_change'
  const snapshot = systemSnapshot?.action === 'deactivate' ? systemSnapshot.before : systemSnapshot?.after
  const medicationNameText = { id: snapshot?.brand_name || snapshot?.medication_id || '', zh: snapshot?.brand_name_zh || snapshot?.brand_name || snapshot?.medication_id || '' ,en: snapshot?.brand_name || snapshot?.medication_id || '' }
  const medicationName = text(medicationNameText)
  const systemAction = systemSnapshot?.action === 'create'
    ? text({ id: 'Obat ditambahkan ke daftar', zh: '新增藥單' ,en: 'Add New Menu' })
    : systemSnapshot?.action === 'update'
      ? text({ id: 'Daftar obat diperbarui', zh: '調整藥單' ,en: 'Medication list updated' })
      : text({ id: 'Obat dinonaktifkan', zh: '停用藥單' ,en: 'Discontinuation order' })
  const slotText = snapshot?.schedule_slot ? medicationSlotText(snapshot.schedule_slot) : { id: '', zh: '' ,en: '' }
  const doseLabel = snapshot?.dose_amount != null ? formatDoseAmountLocalized(snapshot.dose_amount, snapshot.dosage_form || 'tablet', 'id') : ''
  const doseLabelZh = snapshot?.dose_amount != null ? formatDoseAmountLocalized(snapshot.dose_amount, snapshot.dosage_form || 'tablet', 'zh') : ''
  const photos = normalizeCareEventPhotoPaths(entry.photo_paths, true)

  return <li className="border-l-4 border-indigo-300 pl-3">
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-800">{text(careTimelineEventText[entry.event_type])}</span><time className="text-xs text-slate-500">{dayjs(entry.occurred_at).tz(TZ).format('YYYY/MM/DD HH:mm')}</time></div>
    <h3 className="mt-1 font-bold text-slate-900">{isSystemEvent ? `${systemAction}：${medicationName}` : entry.title}</h3>
    {isSystemEvent && snapshot && <p className="mt-1 text-sm text-slate-700">{text({ id: `${slotText.id} · ${doseLabel} · ${snapshot.dose_count ?? ''} dosis`, zh: `${slotText.zh} · 每次 ${doseLabelZh} · ${snapshot.dose_count ?? ''} 次` ,en: `${slotText.en} · ${doseLabel} · ${snapshot.dose_count ?? ''} doses` })}</p>}
    {entry.details && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{entry.details}</p>}
    {entry.reassess_on && <p className="mt-1 text-xs font-semibold text-amber-800">{text({ id: `Evaluasi lagi: ${entry.reassess_on}`, zh: `下次評估：${entry.reassess_on}` ,en: `Reassess on: ${entry.reassess_on}` })}</p>}
    {photos.length > 0 && <TimelinePhotos photos={photos} text={text} />}
    <div className="mt-2 grid gap-1 rounded-lg bg-slate-50 p-2 text-xs"><p className="font-bold text-slate-700">{text({ id: 'Pembacaan terdekat', zh: '最接近的量測' ,en: 'Closest Measurement' })}</p><ContextReading label={{ id: 'Sebelum', zh: '之前' ,en: 'Before' }} record={context.before} occurredAt={entry.occurred_at} text={text} /><ContextReading label={{ id: 'Sesudah', zh: '之後' ,en: 'After' }} record={context.after} occurredAt={entry.occurred_at} text={text} /></div>
    {!isProtectedMedicationEvent && <div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={saving} onClick={() => onEdit(entry)} className="min-h-11 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{text({ id: 'Ubah', zh: '修改' ,en: 'Modification' })}</button><button type="button" disabled={saving} onClick={() => onDelete(entry)} className="min-h-11 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2">{text({ id: 'Hapus', zh: '刪除' ,en: 'DELETE' })}</button></div>}
    <button type="button" aria-expanded={reviewOpen} onClick={() => setReviewOpen(current => !current)} className="mt-2 min-h-11 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{reviewOpen ? text({ id: 'Tutup pembacaan lengkap', zh: '收起完整量測' ,en: 'Collapse full measurement' }) : text({ id: 'Lihat pembacaan lengkap', zh: '查看完整量測' ,en: 'View Full Measurement' })}</button>
    {reviewOpen && <EventReview patientId={patientId} entry={entry} text={text} />}
  </li>
}

function TimelinePhotos({ photos, text }: { photos: CareEventPhotoAttachment[]; text: (value: LocalizedText) => string }) {
  const [activePhoto, setActivePhoto] = useState<CareEventPhotoAttachment | null>(null)
  const [fullUrl, setFullUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>(() => Object.fromEntries(photos.flatMap(photo => photo.thumbnailUrl ? [[photo.path, photo.thumbnailUrl] as const] : [])))
  const [previewLoadingPaths, setPreviewLoadingPaths] = useState<Set<string>>(new Set())
  const [unavailablePreviewPaths, setUnavailablePreviewPaths] = useState<Set<string>>(new Set())
  const requestRef = useRef(0)
  const previewRequestRef = useRef(0)
  const previewAttemptsRef = useRef(new Map<string, number>())
  const photosRef = useRef(photos)
  photosRef.current = photos
  const photoSignature = photos.map(photo => `${photo.path}|${photo.thumbnail_path}|${photo.thumbnailUrl ?? ''}`).join('\u0000')

  const loadPreview = useCallback(async (photo: CareEventPhotoAttachment) => {
    const requestId = previewRequestRef.current
    const attempts = previewAttemptsRef.current.get(photo.path) ?? 0
    if (attempts >= 2) {
      // 實體檔案已刪除或權限確實不足時，重試次數用盡就要離開「載入中」，避免畫面永久卡住。
      setUnavailablePreviewPaths(current => new Set(current).add(photo.path))
      return
    }
    previewAttemptsRef.current.set(photo.path, attempts + 1)
    setPreviewLoadingPaths(current => new Set(current).add(photo.path))
    setUnavailablePreviewPaths(current => {
      const next = new Set(current)
      next.delete(photo.path)
      return next
    })
    try {
      // 縮圖失效時仍嘗試原圖，保住舊資料只剩原圖或縮圖未同步時的可見性。
      const urls = await signCareEventPhotoPathsBestEffort([photo.thumbnail_path, photo.path])
      if (previewRequestRef.current !== requestId) return
      const previewUrl = urls[photo.thumbnail_path] ?? urls[photo.path]
      if (!previewUrl) throw new Error('photo_preview_url_missing')
      setPreviewUrls(current => ({ ...current, [photo.path]: previewUrl }))
    } catch (previewError) {
      if (previewRequestRef.current !== requestId) return
      console.error('[care event photo preview error]', previewError)
      setUnavailablePreviewPaths(current => new Set(current).add(photo.path))
    } finally {
      if (previewRequestRef.current === requestId) {
        setPreviewLoadingPaths(current => {
          const next = new Set(current)
          next.delete(photo.path)
          return next
        })
      }
    }
  }, [])

  useEffect(() => {
    previewRequestRef.current += 1
    previewAttemptsRef.current.clear()
    setPreviewUrls(Object.fromEntries(photosRef.current.flatMap(photo => photo.thumbnailUrl ? [[photo.path, photo.thumbnailUrl] as const] : [])))
    setPreviewLoadingPaths(new Set())
    setUnavailablePreviewPaths(new Set())
    const missingPreviews = photosRef.current.filter(photo => !photo.thumbnailUrl)
    void Promise.all(missingPreviews.map(photo => loadPreview(photo)))
  }, [loadPreview, photoSignature])

  const openPhoto = async (photo: CareEventPhotoAttachment) => {
    const requestId = ++requestRef.current
    const previewUrl = previewUrls[photo.path] ?? photo.thumbnailUrl ?? ''
    setActivePhoto(photo); setFullUrl(previewUrl); setLoading(!previewUrl); setError(false)
    try {
      // 原圖只在點擊時簽署，讓時間線日常瀏覽主要消耗縮圖流量。
      const urls = await signCareEventPhotoPathsBestEffort([photo.path])
      if (requestRef.current !== requestId) return
      // 原圖可能因舊資料不完整而不存在；已有可用縮圖時保留它，至少不讓整張照片從畫面消失。
      if (!urls[photo.path]) {
        if (previewUrl) return
        throw new Error('photo_signed_url_missing')
      }
      setFullUrl(urls[photo.path])
    } catch (photoError) {
      if (requestRef.current !== requestId) return
      console.error('[care event original photo URL error]', photoError)
      // 原圖簽署暫時失敗時仍保留已載入的縮圖，避免一次短暫網路錯誤讓照片看起來像遺失。
      if (previewUrl) setFullUrl(previewUrl)
      else setError(true)
    } finally {
      if (requestRef.current === requestId) setLoading(false)
    }
  }

  return <>
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label={text({ id: 'Foto peristiwa', zh: '事件照片' ,en: 'Photo of the incident' })}>
      {photos.map((photo, index) => <figure key={photo.path} className="min-w-0">
        <button type="button" onClick={() => { if (!previewUrls[photo.path]) void loadPreview(photo); void openPhoto(photo) }} className="block aspect-square w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500">
          {previewUrls[photo.path] ? <img src={previewUrls[photo.path]} onError={() => { setPreviewUrls(current => { const next = { ...current }; delete next[photo.path]; return next }); void loadPreview(photo) }} alt={text({ id: 'Foto peristiwa', zh: '照護事件照片' ,en: 'Photos of care events' })} loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center p-2 text-center text-xs font-semibold text-slate-500">{previewLoadingPaths.has(photo.path) ? text({ id: 'Memuat foto…', zh: '載入照片中…' ,en: 'Loading foto…' }) : unavailablePreviewPaths.has(photo.path) ? text({ id: 'Foto tidak tersedia', zh: '照片暫時無法載入' ,en: 'Photos are temporarily unavailable' }) : text({ id: 'Memuat foto…', zh: '載入照片中…' ,en: 'Loading foto…' })}</span>}
        </button>
        <figcaption className="mt-1 text-center text-xs text-slate-500">{text({ id: `Foto ${index + 1}`, zh: `照片 ${index + 1}` ,en: `Photo ${index + 1}` })}</figcaption>
      </figure>)}
    </div>
    {activePhoto && <div role="dialog" aria-modal="true" aria-label={text({ id: 'Foto peristiwa', zh: '事件照片' ,en: 'Photo of the incident' })} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
      <div className="max-h-full w-full max-w-3xl rounded-2xl bg-white p-3 shadow-2xl">
        <div className="flex items-center justify-between gap-3"><p className="text-sm font-bold text-slate-900">{text({ id: 'Foto asli', zh: '原始照片' ,en: 'Original photo' })}</p><button type="button" onClick={() => { requestRef.current += 1; setActivePhoto(null); setFullUrl(''); setError(false) }} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-bold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{text({ id: 'Tutup', zh: '關閉' ,en: 'Close' })}</button></div>
        {loading && <p className="p-8 text-center text-sm text-slate-600">{text({ id: 'Memuat foto…', zh: '載入照片中…' ,en: 'Loading foto…' })}</p>}
        {error && <p role="alert" className="p-8 text-center text-sm text-red-700">{text({ id: 'Foto belum dapat dibuka. Periksa jaringan lalu coba lagi.', zh: '照片暫時無法開啟，請確認網路後再試。' ,en: 'The photo could not be opened at this time. Please check your network and try again.' })}</p>}
        {!loading && !error && fullUrl && <img src={fullUrl} onError={() => {
          const fallbackUrl = previewUrls[activePhoto.path] ?? activePhoto.thumbnailUrl
          if (fallbackUrl && fullUrl !== fallbackUrl) {
            // Storage 物件可能只保留縮圖；原圖載入失敗時退回已知可用的縮圖，仍讓照護者看得到事件照片。
            setFullUrl(fallbackUrl)
            return
          }
          setError(true)
        }} alt={text({ id: 'Foto asli peristiwa', zh: '照護事件原始照片' ,en: 'Original photo of the care incident' })} className="mt-3 max-h-[75vh] w-full rounded-xl object-contain" />}
      </div>
    </div>}
  </>
}

function ContextReading({ label, record, occurredAt, text }: { label: LocalizedText; record?: BpRecord; occurredAt: string; text: (value: LocalizedText) => string }) {
  if (!record) return <p className="text-slate-500">{text(label)}：{text({ id: 'tidak ada pembacaan dalam rentang laporan 48 jam', zh: '目前報告區間的 48 小時內沒有量測' ,en: 'not ada pembacaan in rentang laporan 48 jam' })}</p>
  const hours = Math.round(Math.abs(new Date(record.measured_at).getTime() - new Date(occurredAt).getTime()) / 3_600_000)
  return <p className="flex flex-wrap items-center gap-x-1 text-slate-700"><b>{text(label)}：</b><VitalReading systolic={record.systolic} diastolic={record.diastolic} pulse={record.pulse} valueClassName="text-sm font-black" /><span className="text-slate-500">({text({ id: `${hours} jam dari catatan`, zh: `距紀錄 ${hours} 小時` ,en: `${hours} hours from the record` })})</span></p>
}

function EventReview({ patientId, entry, text }: { patientId: string; entry: CareTimelineEntry; text: (value: LocalizedText) => string }) {
  const window = useMemo(() => eventReviewWindow(entry.occurred_at), [entry.occurred_at])
  const [records, setRecords] = useState<BpRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const daily = useMemo(() => summarizeEventReviewDays(records), [records])

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(false)
    void supabase.from('blood_pressure_records').select('*').eq('patient_id', patientId).gte('measured_at', window.start).lte('measured_at', window.end).order('measured_at', { ascending: true }).then(({ data, error: readError }) => {
      if (cancelled) return
      if (readError) { console.error('[event review read error]', readError); setError(true) }
      else setRecords((data ?? []) as BpRecord[])
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [patientId, window.end, window.start])

  return <section className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50/40 p-3" aria-label={text({ id: 'Tinjauan pembacaan lengkap', zh: '完整量測回顧' ,en: 'Full Measurement Review' })}>
    <h4 className="font-black text-indigo-950">{text({ id: 'Tinjauan 7 hari sebelum dan sesudah', zh: '事件前後 7 天回顧' ,en: '7 days before and after the event' })}</h4>
    <p className="mt-1 text-xs text-indigo-900">{window.startDate} — {window.endDate} · {text({ id: 'Ringkasan waktu, bukan bukti sebab-akibat atau saran medis.', zh: '僅為時間摘要，非因果證明或醫療建議。' ,en: 'Time summaries only, not proof of cause and effect or medical advice.' })}</p>
    {loading ? <p className="mt-3 text-sm text-slate-500">{text({ id: 'Memuat pembacaan…', zh: '載入量測中…' ,en: 'Loading pembacaan…' })}</p> : error ? <p className="mt-3 text-sm text-red-700">{text({ id: 'Gagal membaca pembacaan lengkap. Periksa jaringan lalu coba lagi.', zh: '無法讀取完整量測，請確認網路後重試。' ,en: 'The full measurement could not be read, please check your network and try again.' })}</p> : records.length === 0 ? <p className="mt-3 text-sm text-slate-600">{text({ id: 'Tidak ada pembacaan dalam jendela ini.', zh: '這個時間窗內沒有量測。' ,en: 'Not ada pembacaan in jendela this.' })}</p> : <>
      <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[360px] text-left text-xs"><thead className="text-slate-600"><tr><th className="pb-1 pr-3">{text({ id: 'Tanggal', zh: '日期' ,en: 'Date' })}</th><th className="pb-1 pr-3">{text({ id: 'Rata-rata', zh: '平均' ,en: 'Average' })}</th><th className="pb-1">{text({ id: 'Jumlah', zh: '筆數' ,en: 'Jumlah' })}</th></tr></thead><tbody>{daily.map(day => <tr key={day.date} className="border-t border-indigo-100"><td className="py-1.5 pr-3">{day.date}</td><td className="py-1.5 pr-3"><VitalReading systolic={day.avgSystolic} diastolic={day.avgDiastolic} pulse={day.avgPulse} showUnits={false} valueClassName="font-black" /></td><td className="py-1.5">{day.recordCount}</td></tr>)}</tbody></table></div>
      <details className="mt-3"><summary className="cursor-pointer text-xs font-bold text-indigo-800">{text({ id: `Semua ${records.length} pembacaan`, zh: `全部 ${records.length} 筆量測` ,en: `All ${records.length} readings` })}</summary><ol className="mt-2 space-y-1 border-l-2 border-indigo-200 pl-3">{records.map(record => <li key={record.id} className="flex flex-wrap items-center gap-x-2 text-xs text-slate-700"><time>{dayjs(record.measured_at).tz(TZ).format('YYYY/MM/DD HH:mm')}</time><VitalReading systolic={record.systolic} diastolic={record.diastolic} pulse={record.pulse} showUnits={false} valueClassName="font-black" /></li>)}</ol></details>
    </>}
  </section>
}

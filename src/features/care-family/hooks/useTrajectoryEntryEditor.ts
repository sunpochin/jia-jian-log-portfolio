/*
檔案用途：管理軌跡頁「新增紀錄」表單與既有手動事件的編輯／刪除狀態（照片選取、儲存、展示模式儲存滿版處理）。
所在層：src/features/care-family/hooks；依 AGENTS Rule A（狀態容器 hook）從原本的 CareTimeline.tsx 拆出，
只處理使用者手動建立的 care_timeline_entries，不涉及調藥或到期提醒（那兩者是系統資料，不能由這裡新增/修改）。
主要關聯：由 src/features/care-family/components/trajectory/TrajectoryEntryForm.tsx 使用；
儲存／刪除成功後呼叫 onSaved 通知 useCareTrajectoryFeed 重新整理合併後的時間軸。
*/
import { useCallback, useEffect, useRef, useState } from 'react'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import { supabase } from '../../../lib/supabase'
import { buildCareTimelineInsert, isValidCareTimelineDraft, type CareTimelineEntry, type CareTimelineEventType, type VisitKind } from '../../../lib/careTimeline'
import { CARE_EVENT_PHOTO_LIMIT, createCareTimelineEntryId, normalizeCareEventPhotoPaths, removeCareEventPhotoPaths, serializeCareEventPhotoPaths, uploadCareEventPhotos } from '../../../lib/careEventPhotos'
import { useI18n } from '../../../lib/i18n'
import { readErrorFields } from '../../../lib/dataErrors'
import { TZ } from '../../../lib/timezone'
import { isDemoPatientId } from '../../../lib/demoData'
import { deleteDemoCareTimelineEntry, saveDemoCareTimelineEntry } from '../../../lib/demoStorage'
import { prepareDemoCareEventPhotoUrls } from '../../../lib/demoCareEventPhotos'
import { useSaveStatus } from '../../../hooks/useSaveStatus'
import type { StoredCareEventPhoto } from '../../../types/database'

dayjs.extend(timezone)

const localDateTimeValue = () => dayjs().tz(TZ).format('YYYY-MM-DDTHH:mm')

// JPEG fallback 程式碼已併入 staging；重新開放上傳入口前，請先確認
// 20260817090000_allow_jpeg_care_event_photos.sql 這個 migration 已對 staging／production 執行過 `supabase db push`。
const CARE_EVENT_PHOTO_UPLOAD_ENABLED = true

export function useTrajectoryEntryEditor({ patientId, userEmail, onSaved, confirm, initialEventType = 'family_observation' }: {
  patientId: string
  userEmail?: string
  onSaved: () => void | Promise<void>
  confirm: (message: string, options?: { danger?: boolean }) => Promise<boolean>
  // 門診頁「看診後」預設選醫師指示（照護閉環 T5）；軌跡頁維持家屬觀察。取消編輯後也回到這個預設。
  initialEventType?: CareTimelineEventType
}) {
  const { text } = useI18n()
  const [expanded, setExpanded] = useState(false)
  // 依 AGENTS Rule B（寫入狀態統一模式）改用共用的 useSaveStatus，取代各自為政的 saving／message
  // 樣板；成功 2 秒後自動回到 idle，重新展開表單時不會再看到上一次操作留下的舊成功訊息。
  const { status: saveStatus, message, begin, succeed, fail, reset } = useSaveStatus()
  const saving = saveStatus === 'saving'
  const [eventType, setEventType] = useState<CareTimelineEventType>(initialEventType)
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [occurredAt, setOccurredAt] = useState(localDateTimeValue)
  const [reassessOn, setReassessOn] = useState('')
  // #659 S3（issue #685）：只在 eventType === 'health_visit' 時於表單顯示，但狀態本身
  // 一直存在——切換事件類型時不清空，讓照護者在門診／急診之間反覆切換時不必重填。
  const [visitKind, setVisitKind] = useState<VisitKind | ''>('')
  const [visitDepartment, setVisitDepartment] = useState('')
  const [visitInstitution, setVisitInstitution] = useState('')
  const [editingEntry, setEditingEntry] = useState<CareTimelineEntry | null>(null)
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [photoSelectionPatientId, setPhotoSelectionPatientId] = useState<string | null>(null)
  // iOS Safari 對同一個 input 同時使用 capture 與 multiple 的行為不一致；拆成兩個入口才能明確保留拍照與相簿選取。
  const cameraPhotoInputRef = useRef<HTMLInputElement>(null)
  const libraryPhotoInputRef = useRef<HTMLInputElement>(null)
  const patientIdRef = useRef(patientId)

  useEffect(() => {
    patientIdRef.current = patientId
    // 切換對象時清掉未送出的照片；否則下一次儲存可能把上一位病人的照片帶到新表單。
    setEditingEntry(null); setTitle(''); setDetails(''); setReassessOn(''); setOccurredAt(localDateTimeValue()); setExpanded(false)
    setVisitKind(''); setVisitDepartment(''); setVisitInstitution('')
    setPhotoFiles([]); setPhotoSelectionPatientId(null); reset()
    if (cameraPhotoInputRef.current) cameraPhotoInputRef.current.value = ''
    if (libraryPhotoInputRef.current) libraryPhotoInputRef.current.value = ''
  }, [patientId, reset])

  const isDemoPatient = isDemoPatientId(patientId)
  const existingPhotoCount = isDemoPatient
    ? (editingEntry?.demo_photo_urls?.length ?? 0)
    : normalizeCareEventPhotoPaths(editingEntry?.photo_paths).length

  const selectPhotoFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const pickedFiles = Array.from(event.currentTarget.files ?? [])
    event.currentTarget.value = ''
    if (pickedFiles.length === 0) return
    if (pickedFiles.some(file => !file.type.startsWith('image/'))) {
      fail(text({ id: 'Pilih file gambar yang dapat dibaca oleh browser.', zh: '請選擇瀏覽器可讀取的圖片檔案。' ,en: 'Please select an image file readable by the browser.' }))
      return
    }
    const nextFiles = [...photoFiles, ...pickedFiles]
    if (existingPhotoCount + nextFiles.length > CARE_EVENT_PHOTO_LIMIT) {
      fail(text({ id: `Maksimal ${CARE_EVENT_PHOTO_LIMIT} foto per catatan.`, zh: `每筆紀錄最多 ${CARE_EVENT_PHOTO_LIMIT} 張照片。` ,en: `Up to ${CARE_EVENT_PHOTO_LIMIT} photos per record.` }))
      return
    }
    // 先記住選圖當下的 patientId；若使用者之後切換對象，save 會拒絕混用這批照片。
    setPhotoSelectionPatientId(patientId)
    setPhotoFiles(nextFiles)
    reset()
  }

  const removeSelectedPhoto = (index: number) => {
    setPhotoFiles(current => current.filter((_, currentIndex) => currentIndex !== index))
    if (photoFiles.length <= 1) setPhotoSelectionPatientId(null)
    reset()
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (photoSelectionPatientId && photoSelectionPatientId !== patientId) {
      fail(text({ id: 'Subjek sudah berubah. Pilih ulang foto untuk subjek ini.', zh: '照護對象已切換，請重新選擇這位對象的照片。' ,en: 'The subject has been switched, please re-select a photo of this subject.' }))
      return
    }
    if (!userEmail || !isValidCareTimelineDraft(title, details)) {
      fail(text({ id: 'Isi judul (maks. 120 huruf) dan ringkasan (maks. 2.000 huruf).', zh: '請填寫標題（最多 120 字）及摘要（最多 2,000 字）。' ,en: 'Please fill in title (max 120 characters) and summary (max 2,000 characters).' }))
      return
    }
    const targetPatientId = photoSelectionPatientId ?? patientId
    const selectedFilesAtStart = [...photoFiles]
    begin()
    // 發生時間由照護者明確填寫，避免補登時誤把輸入時間當成真正發生時間。
    const draft = buildCareTimelineInsert(targetPatientId, eventType, title, details, dayjs.tz(occurredAt, TZ).toISOString(), reassessOn, userEmail, { visitKind, visitDepartment, visitInstitution })
    let uploadedPhotos: StoredCareEventPhoto[] = []
    let createdEntryId: string | null = null
    try {
      if (isDemoPatientId(targetPatientId)) {
        // 展示模式整段跳過 Supabase：照片壓成 data URI、事件寫進 demoStorage，兩者都留在這個瀏覽器。
        const newPhotoUrls = selectedFilesAtStart.length > 0 ? await prepareDemoCareEventPhotoUrls(selectedFilesAtStart) : []
        const entryId = editingEntry?.id ?? createCareTimelineEntryId()
        const existingPhotoUrls = editingEntry?.demo_photo_urls ?? []
        const nextPhotoUrls = [...existingPhotoUrls, ...newPhotoUrls]
        const persisted = saveDemoCareTimelineEntry({
          id: entryId,
          patient_id: targetPatientId,
          event_type: draft.event_type,
          title: draft.title,
          details: draft.details,
          occurred_at: draft.occurred_at,
          reassess_on: draft.reassess_on,
          created_by: draft.created_by,
          created_at: editingEntry?.created_at ?? new Date().toISOString(),
          medication_plan_id: null,
          visit_kind: draft.visit_kind,
          visit_department: draft.visit_department,
          visit_institution: draft.visit_institution,
          ...(nextPhotoUrls.length > 0 ? { demo_photo_urls: nextPhotoUrls } : {}),
        })
        // localStorage 寫入失敗（容量已滿）或這筆被照片預算裁掉時，不能照樣顯示「已儲存」；
        // 丟進下面共用的 catch，讓訪客看到跟真正儲存失敗一樣清楚的錯誤訊息。
        if (!persisted) throw new Error('demo_care_timeline_storage_full')
      } else if (editingEntry) {
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
          visit_kind: draft.visit_kind,
          visit_department: draft.visit_department,
          visit_institution: draft.visit_institution,
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
      setVisitKind(''); setVisitDepartment(''); setVisitInstitution('')
      if (cameraPhotoInputRef.current) cameraPhotoInputRef.current.value = ''
      if (libraryPhotoInputRef.current) libraryPhotoInputRef.current.value = ''
      succeed(text(editingEntry ? { id: 'Catatan perawatan diperbarui.', zh: '照護紀錄已更新。' ,en: 'Care record updated.' } : { id: 'Catatan perawatan tersimpan.', zh: '照護紀錄已儲存。' ,en: 'Care record saved.' }))
      // 若上傳期間切換了病人，下一個 effect 會載入新病人；不要用舊 closure 把舊資料刷回畫面。
      if (patientIdRef.current === targetPatientId) await onSaved()
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
      fail(text(databaseMessage.includes('daily_care_timeline_limit')
        ? { id: 'Hari ini sudah mencapai batas penambahan catatan untuk akun ini. Perbaiki atau hapus catatan hari ini bila perlu.', zh: '今天已達到此帳號的大事記新增上限；需要時可修改或刪除今天的紀錄。' ,en: 'You’ve reached the maximum number of events added to this account today; you can modify or delete today’s records if you need to.' }
        : databaseMessage === 'demo_care_timeline_storage_full'
          // 這是本機容量問題，不是網路問題；沿用「照片尚未儲存」的措辭會誤導訪客去檢查網路。
          ? { id: 'Penyimpanan lokal browser sudah penuh. Hapus catatan atau foto demo lama, lalu coba lagi.', zh: '瀏覽器本機儲存空間已滿，請刪除較舊的展示紀錄或照片後再試。' ,en: 'This browser’s local storage is full. Delete an older demo record or photo, then try again.' }
        : selectedFilesAtStart.length > 0
          ? { id: `Foto belum tersimpan. Periksa jaringan atau pilih foto lain lalu coba lagi.${detailSuffix}`, zh: `照片尚未儲存，請確認網路或換照片後再試。${detailSuffix}` ,en: `Photo was not saved. Check your connection or choose another photo and try again.${detailSuffix}` }
          : { id: `Gagal menyimpan catatan. Periksa jaringan lalu coba lagi.${detailSuffix}`, zh: `儲存照護紀錄失敗，請確認網路後重試。${detailSuffix}` ,en: `Failed to save the care record. Check your connection and try again.${detailSuffix}` }))
    }
  }

  const beginEdit = (entry: CareTimelineEntry) => {
    // 使用同一張表單修改，避免新增與編輯規則分成兩份後漏掉藥單同病人驗證。
    if (entry.medication_plan_change_log_id || entry.event_type === 'medication_change') return
    setEditingEntry(entry); setEventType(entry.event_type); setTitle(entry.title); setDetails(entry.details); setOccurredAt(dayjs(entry.occurred_at).tz(TZ).format('YYYY-MM-DDTHH:mm')); setReassessOn(entry.reassess_on ?? '')
    setVisitKind(entry.visit_kind ?? ''); setVisitDepartment(entry.visit_department ?? ''); setVisitInstitution(entry.visit_institution ?? '')
    setPhotoFiles([]); setPhotoSelectionPatientId(null); setExpanded(true); reset()
  }

  const cancelEdit = useCallback(() => {
    setEditingEntry(null); setTitle(''); setDetails(''); setReassessOn(''); setOccurredAt(localDateTimeValue()); setPhotoFiles([]); setPhotoSelectionPatientId(null); setExpanded(false)
    setVisitKind(''); setVisitDepartment(''); setVisitInstitution('')
    setEventType(initialEventType)
    if (cameraPhotoInputRef.current) cameraPhotoInputRef.current.value = ''
    if (libraryPhotoInputRef.current) libraryPhotoInputRef.current.value = ''
  }, [initialEventType])

  const remove = async (entry: CareTimelineEntry) => {
    if (entry.medication_plan_change_log_id || entry.event_type === 'medication_change') return
    // 大事記是交班脈絡，刪除前再次確認以避免把仍需追蹤的事件誤移除。
    if (!(await confirm(text({ id: 'Hapus catatan perawatan ini? Tindakan ini tidak dapat dibatalkan.', zh: '確定刪除這筆照護大事記嗎？此操作無法復原。', en: 'Delete this care record? This action cannot be undone.' }), { danger: true }))) return
    if (isDemoPatientId(patientId)) {
      // 展示模式沒有真的照片檔案要清理——data URI 本來就跟著這筆 entry 一起存在 localStorage，
      // 從清單移除（或種子事件補一筆墓碑 id）就等於整筆連同照片一起消失。
      deleteDemoCareTimelineEntry(entry.id, patientId)
      if (editingEntry?.id === entry.id) cancelEdit()
      succeed(text({ id: 'Catatan perawatan dihapus.', zh: '照護紀錄已刪除。' ,en: 'The care record has been deleted.' }))
      await onSaved()
      return
    }
    const photoPaths = normalizeCareEventPhotoPaths(entry.photo_paths).flatMap(photo => [photo.path, photo.thumbnail_path])
    begin()
    const { error } = await supabase.from('care_timeline_entries').delete().eq('id', entry.id).eq('patient_id', patientId)
    if (error) {
      console.error('[care timeline delete error]', error)
      fail(text({ id: 'Catatan tidak dapat dihapus. Periksa jaringan lalu coba lagi.', zh: '無法刪除紀錄，請確認網路後再試。' ,en: 'Unable to delete record, please check your network and try again.' }))
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
    succeed(text(photoCleanupFailed
      ? { id: 'Catatan dihapus, tetapi foto belum dapat dibersihkan. Coba lagi nanti.', zh: '照護紀錄已刪除，但照片尚未清理完成，請稍後再試。' ,en: 'The care record has been deleted, but the photo hasn’t been cleaned up yet, please try again later.' }
      : { id: 'Catatan perawatan dihapus.', zh: '照護紀錄已刪除。' ,en: 'The care record has been deleted.' }))
    await onSaved()
  }

  return {
    expanded, setExpanded,
    saving, message,
    eventType, setEventType,
    title, setTitle,
    details, setDetails,
    occurredAt, setOccurredAt,
    reassessOn, setReassessOn,
    visitKind, setVisitKind, visitDepartment, setVisitDepartment, visitInstitution, setVisitInstitution,
    editingEntry,
    photoFiles, existingPhotoCount,
    cameraPhotoInputRef, libraryPhotoInputRef,
    selectPhotoFiles, removeSelectedPhoto,
    save, beginEdit, cancelEdit, remove,
    photoUploadEnabled: CARE_EVENT_PHOTO_UPLOAD_ENABLED,
  }
}

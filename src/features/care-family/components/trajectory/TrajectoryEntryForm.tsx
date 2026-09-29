/*
檔案用途：軌跡頁「新增紀錄」按鈕與展開後的表單，讓照護者手動記下看診、家屬觀察等事件（含照片）。
所在層：src/features/care-family/components/trajectory；純呈現，狀態與儲存邏輯集中在 useTrajectoryEntryEditor。
主要關聯：由 src/features/care-family/pages/TrajectoryPage.tsx 掛載，
拆分自原 CareTimeline.tsx（issue #735，#659 D 期：拆表單與清單）。
*/
import { useI18n } from '../../../../lib/i18n'
import { CARE_TIMELINE_EVENT_TYPES, VISIT_KINDS, careTimelineEventText, visitKindText, type CareTimelineEventType, type VisitKind } from '../../../../lib/careTimeline'
import { CARE_EVENT_PHOTO_LIMIT } from '../../../../lib/careEventPhotos'
import type { useTrajectoryEntryEditor } from '../../hooks/useTrajectoryEntryEditor'

export function TrajectoryEntryForm({ editor }: { editor: ReturnType<typeof useTrajectoryEntryEditor> }) {
  const { text } = useI18n()
  const {
    expanded, setExpanded, saving, message,
    eventType, setEventType, title, setTitle, details, setDetails,
    occurredAt, setOccurredAt, reassessOn, setReassessOn,
    visitKind, setVisitKind, visitDepartment, setVisitDepartment, visitInstitution, setVisitInstitution,
    editingEntry, photoFiles, existingPhotoCount,
    cameraPhotoInputRef, libraryPhotoInputRef,
    selectPhotoFiles, removeSelectedPhoto, save, cancelEdit,
    photoUploadEnabled,
  } = editor

  return <div>
    {/* 事件新增是照護者最常用的入口；統一至少 44px 並保留可見鍵盤焦點，降低手機誤觸。 */}
    <button type="button" onClick={() => editingEntry ? cancelEdit() : setExpanded(current => !current)} className="min-h-11 w-full rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-bold text-indigo-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{expanded ? text({ id: 'Tutup', zh: '收起' ,en: 'Collapse all' }) : text({ id: '+ Tambah catatan', zh: '＋ 新增紀錄' ,en: '+ Add New Record' })}</button>
    {expanded && <form onSubmit={save} className="mt-3 space-y-3 rounded-xl bg-slate-50 p-3">
      <label className="block text-sm font-bold text-slate-800">{text({ id: 'Jenis catatan', zh: '紀錄類型' ,en: 'Record type' })}<select value={eventType} onChange={event => setEventType(event.target.value as CareTimelineEventType)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2">{CARE_TIMELINE_EVENT_TYPES.map(type => <option key={type} value={type}>{text(careTimelineEventText[type])}</option>)}</select></label>
      {/* #659 S3（issue #685）：只在看診事件顯示這三欄，其餘事件類型不需要科別／院所／就醫類型；
          狀態切換事件類型時不清空，方便照護者在門診／急診之間切換時不必重填。 */}
      {eventType === 'health_visit' && <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm font-bold text-slate-800">{text({ id: 'Jenis kunjungan', zh: '就醫類型', en: 'Visit type' })}<select value={visitKind} onChange={event => setVisitKind(event.target.value as VisitKind | '')} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2"><option value="">{text({ id: 'Tidak dipilih', zh: '未選擇', en: 'Not selected' })}</option>{VISIT_KINDS.map(kind => <option key={kind} value={kind}>{text(visitKindText[kind])}</option>)}</select></label>
        <label className="block text-sm font-bold text-slate-800">{text({ id: 'Bagian/Departemen', zh: '科別', en: 'Department' })}<input maxLength={40} value={visitDepartment} onChange={event => setVisitDepartment(event.target.value)} placeholder={text({ id: 'Contoh: Kardiologi', zh: '例如：心臟內科', en: 'Ex: Cardiology' })} className="mt-1 block w-full rounded-lg border border-slate-300 p-2" /></label>
        <label className="block text-sm font-bold text-slate-800">{text({ id: 'Rumah sakit/Klinik', zh: '院所', en: 'Institution' })}<input maxLength={80} value={visitInstitution} onChange={event => setVisitInstitution(event.target.value)} placeholder={text({ id: 'Contoh: RS Umum', zh: '例如：台大醫院', en: 'Ex: General Hospital' })} className="mt-1 block w-full rounded-lg border border-slate-300 p-2" /></label>
      </div>}
      <label className="block text-sm font-bold text-slate-800">{text({ id: 'Judul singkat', zh: '簡短標題' ,en: 'Short title' })}<input required maxLength={120} value={title} onChange={event => setTitle(event.target.value)} placeholder={text({ id: 'Contoh: Dokter meminta ukur pagi dan malam', zh: '例如：醫師指示早晚量測' ,en: 'Ex: Doctors ordered morning and evening measurements' })} className="mt-1 block w-full rounded-lg border border-slate-300 p-2" /></label>
      <label className="block text-sm font-bold text-slate-800">{text({ id: 'Alasan atau rincian', zh: '原因或細節' ,en: 'Reason or details' })}<textarea maxLength={2000} value={details} onChange={event => setDetails(event.target.value)} rows={3} placeholder={text({ id: 'Apa yang diamati, siapa yang memberi arahan, dan apa yang perlu diperhatikan.', zh: '記下觀察到什麼、誰給了指示、接下來要注意什麼。' ,en: 'Note what was observed, who gave instructions, and what to watch for next.' })} className="mt-1 block w-full rounded-lg border border-slate-300 p-2" /></label>
      <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-bold text-slate-800">{text({ id: 'Waktu kejadian', zh: '發生時間' ,en: 'When' })}<input type="datetime-local" required value={occurredAt} onChange={event => setOccurredAt(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 p-2" /></label><label className="block text-sm font-bold text-slate-800">{text({ id: 'Evaluasi lagi (opsional)', zh: '下次評估（選填）' ,en: 'Next assessment (optional)' })}<input type="date" value={reassessOn} onChange={event => setReassessOn(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 p-2" /></label></div>
      {photoUploadEnabled && <div className="rounded-lg border border-slate-200 bg-white p-3">
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
  </div>
}

/*
檔案用途：換看護時可列印的一頁雙語（繁中／印尼文）照護交接手冊——服藥時間自動帶入，禁忌、慣用作息、緊急聯絡人由家屬臨時手動填寫並直接列印，不寫回資料庫。
所在層：src/features/care-family/pages；只能從設定頁的「照護交接手冊」按鈕進入，以明確的 patientId 掛載。
主要關聯：readMedicationDay、medicationSchedule（服藥時段排序與文字）、SettingsPage。

為什麼禁忌／作息／聯絡人不存資料庫：這三項目前資料庫完全沒有對應欄位（見 issue #418 討論），
新增 schema 屬於較大的變更；v1 先讓家屬在列印當下手動輸入紙本內容，換看護時當場列印，
避免為了一次性文件貿然加欄位、卻沒有人力持續維護正確性反而造成誤導。

為什麼不用全域目前操作對象：跟 ArchivedPatientHistoryPage 一樣，直接接受明確傳入的 patientId，
不呼叫 setActiveSubject／onSubjectSelect，從結構上確保這份交接手冊只會顯示「這一位」病人的藥單，
不會因為使用者中途切換操作對象而混入或外洩另一位病人的資料。
*/
import { useEffect, useMemo, useState } from 'react'
import { careDateKey } from '../../../lib/careDay'
import { compareMedicationSlots, medicationSlotText } from '../../../lib/medicationSchedule'
import { formatDoseAmountLocalized, readMedicationDay, type MedicationPlanView } from '../../../lib/medications'
import { common, useI18n, type LocalizedText } from '../../../lib/i18n'
import dayjs from 'dayjs'
import { REPORT_TIMEZONE } from '../../../lib/recordReport'
import { PrintSourceFooter } from '../../../components/system/PrintSourceFooter'

// 手冊內容要讓新看護與家屬同時讀懂，因此標題等固定文案直接印出中文與印尼文兩種，
// 不像一般畫面文字只依目前選擇的語言顯示其中一種。
function bilingual(value: LocalizedText) {
  return `${value.zh} · ${value.id}`
}

export function CareHandbookPage({ patientId, patientName, onBack }: {
  patientId: string
  patientName: string
  onBack: () => void
}) {
  const { text } = useI18n()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [medications, setMedications] = useState<MedicationPlanView[]>([])
  const [allergiesNote, setAllergiesNote] = useState('')
  const [routineNote, setRoutineNote] = useState('')
  const [contactsNote, setContactsNote] = useState('')

  useEffect(() => {
    // 換病人時先清空上一位手動輸入的內容，避免忘記清除而把別人的禁忌／聯絡人一起印出去。
    setAllergiesNote('')
    setRoutineNote('')
    setContactsNote('')
    setLoading(true)
    setError(null)
    let cancelled = false
    readMedicationDay(patientId, careDateKey())
      .then(day => { if (!cancelled) setMedications(day.plans) })
      .catch(() => { if (!cancelled) setError(text({ id: 'Gagal memuat daftar obat.', zh: '藥單載入失敗。' ,en: "Failed loading daftar medication." })) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId])

  const scheduledGroups = useMemo(() => {
    const groups = new Map<string, MedicationPlanView[]>()
    for (const plan of medications) {
      if (plan.as_needed) continue
      groups.set(plan.schedule_slot, [...(groups.get(plan.schedule_slot) ?? []), plan])
    }
    return [...groups.entries()].sort(([left], [right]) => compareMedicationSlots(left, right))
  }, [medications])
  const asNeededMedications = useMemo(() => medications.filter(plan => plan.as_needed), [medications])

  const generatedAt = dayjs().tz(REPORT_TIMEZONE).format('YYYY/MM/DD HH:mm')

  return (
    <section className="min-h-full bg-slate-50 px-5 pt-5 pb-8 text-gray-900 care-handbook-container">
      <button
        type="button"
        onClick={onBack}
        className="print-hidden -ml-1 flex min-h-11 items-center gap-1 rounded-lg px-1 text-sm font-bold text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
      >
        <span aria-hidden="true">←</span>
        {text({ id: 'Kembali ke Pengaturan', zh: '返回設定' ,en: "Back to Settings" })}
      </button>

      <header className="mt-2">
        <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">
          {bilingual({ id: 'Buku Panduan Serah Terima Perawatan', zh: '換看護交接照護手冊' ,en: "Buku Panduan Serah Terima Care" })}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">{patientName}</h1>
        <p className="mt-1 text-sm text-gray-500 print-hidden">
          {text({ id: 'Isi kolom di bawah lalu cetak. Isian tidak disimpan ke server.', zh: '請在下方欄位填寫後直接列印；輸入內容不會存到伺服器。' ,en: "Isi kolom in bawah lalu cetak. Isian not disimpan to server." })}
        </p>
        {/* 只在列印時顯示產生時間，畫面上不需要；跟血壓報告的做法一致。 */}
        <p className="hidden care-handbook-print-only text-xs text-slate-500">
          {bilingual({ id: 'Dibuat:', zh: '產生時間：' ,en: "Dibuat:" })} {generatedAt}
        </p>
      </header>

      <div className="print-hidden mt-4">
        <button
          type="button"
          onClick={() => window.print()}
          className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-800 shadow-sm"
        >
          <span aria-hidden="true" className="mr-1">▧</span>
          {text({ id: 'Cetak / Simpan PDF', zh: '列印 / 存為 PDF' ,en: "Cetak / Save PDF" })}
        </button>
      </div>

      {/* 服藥時間：資料齊全，直接從今日藥單自動帶入，避免家屬手動抄錄藥名與劑量出錯。 */}
      <section className="care-handbook-section mt-4 rounded-2xl border border-slate-200 bg-white p-4" aria-labelledby="handbook-medications-title">
        <h2 id="handbook-medications-title" className="text-sm font-extrabold text-slate-950">
          {bilingual({ id: 'Jadwal Minum Obat', zh: '服藥時間' ,en: "Schedule Take Medication" })}
        </h2>
        {loading && <p role="status" className="mt-2 text-xs text-slate-500">{text(common.loading)}</p>}
        {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
        {!loading && !error && medications.length === 0 && (
          <p className="mt-2 text-xs text-slate-500">{bilingual({ id: 'Tidak ada obat aktif.', zh: '目前沒有使用中的藥物。' ,en: "No medication active." })}</p>
        )}
        {!loading && !error && medications.length > 0 && (
          <div className="mt-2 space-y-2">
            {scheduledGroups.map(([slot, plans]) => (
              <div key={slot}>
                <p className="text-xs font-bold text-slate-500">{bilingual(medicationSlotText(slot))}</p>
                <ul className="mt-1 space-y-0.5">
                  {plans.map(plan => (
                    <li key={plan.id} className="text-xs text-slate-800">
                      {plan.medication.brand_name_zh || plan.medication.brand_name}
                      {plan.medication.brand_name_id ? ` (${plan.medication.brand_name_id})` : ''}
                      {' · '}
                      {formatDoseAmountLocalized(plan.dose_amount, plan.medication.dosage_form, 'zh')}
                      {' / '}
                      {formatDoseAmountLocalized(plan.dose_amount, plan.medication.dosage_form, 'id')}
                      {plan.dose_count > 1 ? ` × ${plan.dose_count}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {asNeededMedications.length > 0 && (
              <div>
                <p className="text-xs font-bold text-slate-500">{bilingual({ id: 'Bila perlu', zh: '需要時服用' ,en: "Bila perlu" })}</p>
                <ul className="mt-1 space-y-0.5">
                  {asNeededMedications.map(plan => (
                    <li key={plan.id} className="text-xs text-slate-800">
                      {plan.medication.brand_name_zh || plan.medication.brand_name}
                      {plan.medication.brand_name_id ? ` (${plan.medication.brand_name_id})` : ''}
                      {' · '}
                      {formatDoseAmountLocalized(plan.dose_amount, plan.medication.dosage_form, 'zh')}
                      {' / '}
                      {formatDoseAmountLocalized(plan.dose_amount, plan.medication.dosage_form, 'id')}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      <ManualNoteSection
        id="handbook-allergies"
        title={{ id: 'Alergi & Pantangan', zh: '禁忌與過敏' ,en: "Alergi & Pantangan" }}
        placeholder={{ id: 'Contoh: alergi kacang, hindari makanan pedas', zh: '例如：對花生過敏、避免辛辣食物' ,en: "Example: alergi kacang, hinfrom food pedas" }}
        value={allergiesNote}
        onChange={setAllergiesNote}
      />
      <ManualNoteSection
        id="handbook-routine"
        title={{ id: 'Rutinitas Harian', zh: '慣用作息' ,en: "Rutthistas Harian" }}
        placeholder={{ id: 'Contoh: bangun 06:30, tidur siang 13:00–14:30', zh: '例如：06:30 起床、午休 13:00–14:30' ,en: "Example: bangun 06:30, tidur afternoon 13:00–14:30" }}
        value={routineNote}
        onChange={setRoutineNote}
      />
      <ManualNoteSection
        id="handbook-contacts"
        title={{ id: 'Kontak Darurat', zh: '緊急聯絡人' ,en: "Kontak Darurat" }}
        placeholder={{ id: 'Nama dan nomor telepon, satu baris per orang', zh: '姓名與電話，每行一位' ,en: "Name and nomor telepon, satu baris per people" }}
        value={contactsNote}
        onChange={setContactsNote}
      />

      <p className="mt-4 text-xs text-slate-400 print-hidden">
        {text({ id: `Buku panduan ini hanya berisi data ${patientName}.`, zh: `此手冊僅包含「${patientName}」一人的資料。` ,en: `Buku panduan this only berisi data ${patientName}.` })}
      </p>
      <PrintSourceFooter />
    </section>
  )
}

function ManualNoteSection({ id, title, placeholder, value, onChange }: {
  id: string
  title: LocalizedText
  placeholder: LocalizedText
  value: string
  onChange: (value: string) => void
}) {
  return (
    <section className="care-handbook-section mt-4 rounded-2xl border border-slate-200 bg-white p-4" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="text-sm font-extrabold text-slate-950">{bilingual(title)}</h2>
      <textarea
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={bilingual(placeholder)}
        rows={3}
        className="print-hidden mt-2 w-full rounded-xl border border-slate-200 p-2 text-sm text-slate-800"
      />
      {/* 瀏覽器列印 textarea 時常只印出目前捲動到的內容；改用純文字區塊鏡射同一份輸入，確保整段文字都會出現在紙本上。 */}
      <p className="hidden care-handbook-print-only whitespace-pre-wrap text-xs text-slate-800">
        {value || '—'}
      </p>
    </section>
  )
}

/*
檔案用途：顯示目前照護對象並讓使用者切換，少量對象用分段按鈕、較多對象用下拉選單。
所在層：src/components；供輸入、看資料與服藥頁共用的病人選擇控制項。
主要關聯：接收 App 的已授權 PatientIdentity 清單，只回傳 patient UUID；圖示規則集中在 lib/auth 的 patientIcon。
*/
import { useMemo } from 'react'
import { patientIcon, type PatientIdentity } from '../../lib/auth'
import { useI18n, type LocalizedText } from '../../lib/i18n'

// 三種照護對象分類各給獨立顏色，避免自己、人類家人、寵物在選單中視覺混淆而記錯資料歸屬。
type SubjectCategory = 'self' | 'human' | 'pet'

function subjectCategory(patient: Pick<PatientIdentity, 'isOwnPatient' | 'careRecipientType'>): SubjectCategory {
  if (patient.isOwnPatient) return 'self'
  if (patient.careRecipientType === 'human') return 'human'
  return 'pet'
}

const CATEGORY_STYLES: Record<SubjectCategory, { active: string; solid: string; badge: string; label: LocalizedText }> = {
  self: {
    // 700 色階確保白字對比度達 WCAG AA（4.5:1）門檻，600 色階（尤其 amber/emerald）不夠。
    active: 'border border-blue-300 bg-blue-700 text-white shadow-sm',
    solid: 'bg-blue-700 text-white',
    badge: 'bg-blue-100 text-blue-800',
    label: { id: 'Saya sendiri', zh: '我自己' ,en: 'Myself' },
  },
  human: {
    active: 'border border-emerald-300 bg-emerald-700 text-white shadow-sm',
    solid: 'bg-emerald-700 text-white',
    badge: 'bg-emerald-100 text-emerald-800',
    label: { id: 'Anggota keluarga', zh: '人類家人' ,en: 'Family member' },
  },
  pet: {
    active: 'border border-amber-300 bg-amber-700 text-white shadow-sm',
    solid: 'bg-amber-700 text-white',
    badge: 'bg-amber-100 text-amber-800',
    label: { id: 'Hewan peliharaan', zh: '寵物' ,en: 'Pet' },
  },
}

export function SubjectSwitcher({ patientId, patients, onSelect }: { patientId: string; patients: PatientIdentity[]; onSelect?: (patientId: string) => void }) {
  const { text } = useI18n()

  // 為防止來源資料庫權限或跨狀態清單傳入重複 UUID，先過濾出唯一的對象；避免 React key 衝突與選單重複渲染。
  const uniquePatients = useMemo(() => {
    const seen = new Set<string>()
    return patients.filter(patient => {
      if (!patient.patientId || seen.has(patient.patientId)) return false
      seen.add(patient.patientId)
      return true
    })
  }, [patients])

  // UUID 只負責選取；名稱必須隨同一筆病人資料傳入，避免各頁退回模糊的「量測對象」。
  const selected = uniquePatients.find(patient => patient.patientId === patientId)
  if (!uniquePatients.length) return null

  // 為什麼不 fallback 到清單第一位：這個元件顯示的名字代表「接下來會寫入誰」。
  // 找不到目前 patientId 時若靜默改顯示別人，畫面會宣稱在記錄 A、資料卻寫進 B（例如已歸檔對象殘留）。
  // 寧可明確擋下並要求重新選擇，也不能讓健康數值掛到錯的人身上。
  if (!selected) return <div role="alert" className="flex min-h-12 w-full flex-col justify-center gap-1 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2">
    <span className="text-sm font-bold text-amber-900">{text({ id: 'Penerima perawatan ini tidak tersedia di sini', zh: '此照護對象在這個頁面無法使用' ,en: 'This care recipient is not available on this page' })}</span>
    {uniquePatients.length > 0 && <button type="button" onClick={() => onSelect?.(uniquePatients[0].patientId)} className="self-start rounded-lg text-xs font-bold text-amber-900 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700">
      {text({ id: `Ganti ke ${uniquePatients[0].displayName}`, zh: `改為 ${uniquePatients[0].displayName}` ,en: `Switch to ${uniquePatients[0].displayName}` })}
    </button>}
  </div>

  // 為防止同名對象（如新舊同名寵物）或已歸檔歷史在選單中無法區分，對已歸檔加記「(已歸檔)」，若連狀態都完全同名則補上 UUID 前綴區隔。
  const getPatientLabel = (patient: PatientIdentity) => {
    const icon = patientIcon(patient)
    const archivedTag = patient.archivedAt ? ` (${text({ id: 'Diarsipkan', zh: '已歸檔' ,en: 'Archived' })})` : ''
    const sameNameCount = uniquePatients.filter(p => p.displayName === patient.displayName && Boolean(p.archivedAt) === Boolean(patient.archivedAt)).length
    const idSuffix = sameNameCount > 1 ? ` #${patient.patientId.slice(0, 4)}` : ''
    return `${icon} ${patient.displayName}${idSuffix}${archivedTag}`
  }

  const selectedCategory = CATEGORY_STYLES[subjectCategory(selected)]

  if (uniquePatients.length === 1) return <span className={`flex h-12 w-full items-center gap-1.5 rounded-xl px-3 py-2 text-base font-bold ${selectedCategory.solid}`}>{getPatientLabel(selected)}</span>
  if (uniquePatients.length > 3) return <div className="flex w-full flex-col gap-1">
    {/* 顏色只是輔助提示，選單旁另外用文字標明目前分類，避免色弱使用者或色彩本身不夠明顯時仍然混淆對象。 */}
    <span className={`self-start rounded-md px-2 py-0.5 text-xs font-bold ${selectedCategory.badge}`}>{text(selectedCategory.label)}</span>
    <label className="flex h-12 w-full items-center gap-2 rounded-xl border border-gray-200 bg-gray-100 px-3 text-sm font-bold text-gray-700">
      <span className="shrink-0">{text({ id: 'Pilih', zh: '選擇' ,en: 'Select' })}</span>
      {/* 名稱長短與人數都無法預測；超過三位改用原生選單，才能在手機保留完整名字而不擠壓每個按鈕。 */}
      <select value={selected.patientId} onChange={event => onSelect?.(event.target.value)} aria-label={text({ id: 'Pilih penerima perawatan', zh: '選擇照護對象' ,en: 'Select a care recipient' })} className="min-w-0 flex-1 cursor-pointer bg-transparent text-base font-bold text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900">
        {uniquePatients.map(patient => <option key={patient.patientId} value={patient.patientId}>{getPatientLabel(patient)}</option>)}
      </select>
    </label>
  </div>
  return <div className="flex w-full flex-col gap-1">
    <span className={`self-start rounded-md px-2 py-0.5 text-xs font-bold ${selectedCategory.badge}`}>{text(selectedCategory.label)}</span>
    <div role="group" aria-label={text({ id: 'Pilih orang yang diukur', zh: '選擇量測對象' ,en: 'Select the person being measured' })} className="flex min-h-12 w-full rounded-2xl border border-gray-200/50 bg-gray-100 p-1">
      {uniquePatients.map(patient => {
        const active = patient.patientId === patientId
        const category = CATEGORY_STYLES[subjectCategory(patient)]
        // 病人切換會直接改變後續量測對象；每個選項維持 44px 觸控高度，並以分類色系區分自己、人類家人、寵物三種對象，鍵盤焦點仍不依賴顏色。
        return <button key={patient.patientId} type="button" aria-pressed={active} onClick={() => onSelect?.(patient.patientId)} className={`min-h-11 flex-1 whitespace-nowrap rounded-xl px-3 text-base font-bold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-inset active:scale-98 ${active ? category.active : 'text-gray-500 hover:text-gray-800'}`}>
          {getPatientLabel(patient)}
        </button>
      })}
    </div>
  </div>
}

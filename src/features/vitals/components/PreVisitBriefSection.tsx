/*
檔案用途：在醫師版血壓報告中呈現「就診前摘要」——依 src/lib/preVisitBrief.ts 規則引擎算出的觀察與最多
3 個回診提問，純陳述已記錄事實並列提問，不下因果推論。⚠️ 健康安全語意變更，依 AGENTS.md 由主刀 Agent
或使用者最終審查後才可合併；不得自行判定「措辭沒問題」就跳過審查。
照護閉環 T3（issue #947，#847 delta #8）起，R4（醫師指示回顧，來自照護紀錄的 reassess_on）與 R2／R3
（藥量倒數／回診抽血逾期，來自到期提醒的 due_date）分成「照護筆記」「排程提醒」兩個小節顯示，讓使用者
看得出兩種來源的權限與正式程度不同（規劃文件 Q4：不統一兩個欄位，只在 UI 加來源標籤）。
照護閉環 T4（issue #948，delta #7）：有提問的項目（R1–R5）旁可選擇顯示「加入問題清單」按鈕，把觀察＋提問
落地成一筆 patient_visit_questions；按鈕只在螢幕上出現，列印時隱藏。
所在層：src/features/vitals/components；由 RecordReport 放在「近期醫療軌跡」之後、「資料限制」之前呈現。
主要關聯：src/lib/preVisitBrief.ts（規則引擎）、src/lib/preVisitSources.ts（讀取狀態，沿用 TrajectorySection
既有的「來源不可用」三語文案慣例）、src/features/vitals/hooks/useAddBriefToVisitQuestions.ts（按鈕狀態）、
docs/product/care-loop-domain-model.md §3 Q1／Q4。
*/
import { useI18n, type LocalizedText } from '../../../lib/i18n'
import type { PreVisitBriefItem, PreVisitBriefRuleId } from '../../../lib/preVisitBrief'
import type { PreVisitSourceStatuses } from '../../../lib/preVisitSources'
import type { BriefAdoptionStatus, PreVisitBriefAdoption } from '../hooks/useAddBriefToVisitQuestions'

const SECTION_TITLE: LocalizedText = { id: 'Ringkasan sebelum kunjungan', zh: '就診前摘要', en: 'Pre-visit brief' }

// 為什麼要多這句免責：這個區塊把「觀察」與「問題」並排呈現，外觀上容易被誤讀成系統已經下了
// 因果判斷；明講「只並列事實與提問」才符合規劃文件 §4 的措辭契約，且要在螢幕與列印都看得到。
const DISCLAIMER_TEXT: LocalizedText = {
  id: 'Ringkasan ini hanya menampilkan fakta yang tercatat berdampingan dengan pertanyaan; tidak menunjukkan hubungan sebab-akibat.',
  zh: '就診前摘要只並列已記錄的事實與提問，不代表因果關係。',
  en: 'This brief only lists recorded facts alongside questions; it does not imply causation.',
}

// 零項目時印固定文案，不補一個通用問題湊數（規劃文件 §5.2 驗收條件）。
const EMPTY_STATE_TEXT: LocalizedText = {
  id: 'Tidak ada perubahan obat atau pengingat jatuh tempo yang bisa dibandingkan pada rentang ini.',
  zh: '區間內沒有可對照的藥單異動或逾期提醒。',
  en: 'No medication changes or overdue reminders to compare in this period.',
}

const SOURCE_UNAVAILABLE_TEXT: Record<keyof PreVisitSourceStatuses, LocalizedText> = {
  medicationChanges: { id: 'Riwayat perubahan obat belum dapat dibaca; item terkait obat tidak dihitung.', zh: '藥單異動紀錄暫時無法讀取，相關項目未計入。', en: 'Medication change history could not be read; related items were not computed.' },
  timelineEntries: { id: 'Catatan arahan dokter belum dapat dibaca; item terkait tidak dihitung.', zh: '醫師指示紀錄暫時無法讀取，相關項目未計入。', en: 'Doctor-instruction records could not be read; related items were not computed.' },
  dueReminders: { id: 'Pengingat jatuh tempo belum dapat dibaca; item terkait tidak dihitung.', zh: '到期提醒暫時無法讀取，相關項目未計入。', en: 'Due reminders could not be read; related items were not computed.' },
  labResults: { id: 'Hasil lab belum dapat dibaca; item terkait tidak dihitung.', zh: '檢驗值暫時無法讀取，相關項目未計入。', en: 'Lab results could not be read; related items were not computed.' },
}

// 來源分組（規劃文件 Q4）：R4 讀 care_timeline_entries 的 doctor_instruction 事件（reassess_on 只是其中可選的
// 「之後要再看一下」標記），只要 can_record 就能寫，是低摩擦的照護筆記；R2／R3 讀 care_due_reminders.due_date，
// 要 can_manage_medication 才能建立，是有明確排程規則的到期日。兩者混在同一個清單裡，使用者分不出哪個比較
// 「正式」，所以各自成一個小節並標上來源。R1／R5／R6 是量測、檢驗值與涵蓋率的對照，維持在主清單，不另外標籤。
// 文案不能把每一筆 R4 都說成「重新評估標記」：buildR4Items 收的是所有醫師指示，沒填 reassess_on 的占多數
// （Codex review PR #953 P2）。
type PreVisitSourceGroup = 'primary' | 'careNotes' | 'scheduledReminders'

const RULE_SOURCE_GROUP: Record<PreVisitBriefRuleId, PreVisitSourceGroup> = {
  R1: 'primary', R5: 'primary', R6: 'primary',
  R4: 'careNotes',
  R2: 'scheduledReminders', R3: 'scheduledReminders',
}

const SOURCE_GROUP_META: Record<Exclude<PreVisitSourceGroup, 'primary'>, { label: LocalizedText; caption: LocalizedText }> = {
  careNotes: {
    label: { id: 'Catatan perawatan', zh: '照護筆記', en: 'Care notes' },
    caption: { id: 'Arahan dokter dari riwayat perawatan; sebagian disertai tanggal evaluasi ulang.', zh: '來自照護紀錄的醫師指示，部分附有重新評估日期。', en: 'Doctor instructions from the care history; some carry a reassessment date.' },
  },
  scheduledReminders: {
    label: { id: 'Pengingat terjadwal', zh: '排程提醒', en: 'Scheduled reminders' },
    caption: { id: 'Pengingat dengan tanggal jatuh tempo yang sudah ditetapkan.', zh: '有明確到期日的排程提醒。', en: 'Reminders that already have a due date.' },
  },
}

// 按鈕文案依狀態切換；「已在清單」用 disabled 按鈕而不是拿掉按鈕，讓使用者知道這一項已經處理過，
// 而不是以為功能壞了。
const ADOPTION_BUTTON_TEXT: Record<BriefAdoptionStatus, LocalizedText> = {
  loading: { id: 'Memuat daftar…', zh: '清單載入中…', en: 'Loading the list…' },
  available: { id: 'Tambah ke daftar pertanyaan', zh: '加入問題清單', en: 'Add to question list' },
  saving: { id: 'Menambahkan…', zh: '加入中…', en: 'Adding…' },
  added: { id: 'Sudah ada di daftar', zh: '已在清單', en: 'Already on the list' },
  stale: { id: 'Data asal sudah tidak ada', zh: '來源已不存在', en: 'Source no longer exists' },
  error: { id: 'Gagal, coba lagi', zh: '加入失敗，再試一次', en: 'Failed, try again' },
}

export function groupPreVisitBriefItems(items: PreVisitBriefItem[]): Record<PreVisitSourceGroup, PreVisitBriefItem[]> {
  // 排名／取 3 已在規則引擎完成；這裡只依來源分組，各組內維持原本的優先序，不重新排序。
  const groups: Record<PreVisitSourceGroup, PreVisitBriefItem[]> = { primary: [], careNotes: [], scheduledReminders: [] }
  for (const item of items) groups[RULE_SOURCE_GROUP[item.ruleId]].push(item)
  return groups
}

// 用一般函式而不是巢狀元件：render 測試（tests/unit/helpers/elementTree.ts）只攤平元素樹、不遞迴呼叫
// 巢狀函式元件；用函式回傳 JSX 讓主清單與兩個小節共用同一份項目標記，測試也看得到內容。
function renderBriefItems(items: PreVisitBriefItem[], text: (copy: LocalizedText) => string, adoption?: PreVisitBriefAdoption) {
  return (
    <ol className="mt-2 space-y-2">
      {items.map(item => {
        const adoptionStatus = adoption && item.question ? adoption.statusOf(item) : null
        return (
          <li key={`${item.ruleId}-${item.dedupeId}`} className="border-l-4 border-indigo-300 pl-2">
            <p className="text-xs print:text-[11px] text-slate-800">{text(item.observation)}</p>
            {item.question && (
              <p className="mt-0.5 text-xs print:text-[11px] font-bold text-indigo-800">{text(item.question)}</p>
            )}
            {/* 只有可寫路徑（BloodPressureReportPanel 掛了 adoption）且有提問的項目才有按鈕；R6 沒有提問，
                規劃文件 Q1 明講不會被加入。print-hidden：列印給醫師的紙本不該出現操作按鈕。 */}
            {adoption && adoptionStatus && (
              <button
                type="button"
                disabled={adoptionStatus === 'loading' || adoptionStatus === 'saving' || adoptionStatus === 'added' || adoptionStatus === 'stale'}
                aria-disabled={adoptionStatus === 'loading' || adoptionStatus === 'saving' || adoptionStatus === 'added' || adoptionStatus === 'stale' ? true : undefined}
                onClick={() => adoption.add(item)}
                className={`print-hidden mt-1 min-h-9 rounded-lg border px-2.5 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 disabled:cursor-default ${adoptionStatus === 'added' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : adoptionStatus === 'error' ? 'border-red-300 bg-red-50 text-red-800' : adoptionStatus === 'stale' ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-indigo-300 bg-white text-indigo-800 active:bg-indigo-50'}`}
              >
                {text(ADOPTION_BUTTON_TEXT[adoptionStatus])}
              </button>
            )}
          </li>
        )
      })}
    </ol>
  )
}

export function PreVisitBriefSection({ items, sourceStatus, adoption }: {
  items: PreVisitBriefItem[]
  sourceStatus: PreVisitSourceStatuses
  // 省略＝純呈現（列印預覽、封存對象唯讀歷史頁、非人類病人）；帶入＝每個有提問的項目顯示「加入問題清單」按鈕。
  adoption?: PreVisitBriefAdoption
}) {
  const { text } = useI18n()
  const unavailableSources = (Object.keys(sourceStatus) as Array<keyof PreVisitSourceStatuses>).filter(key => sourceStatus[key] === 'unavailable')
  const groups = groupPreVisitBriefItems(items)

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3" aria-labelledby="pre-visit-brief-title">
      <p id="pre-visit-brief-title" className="text-xs print:text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-600">{text(SECTION_TITLE)}</p>
      <p className="mt-1 text-xs print:text-[10px] text-slate-500">{text(DISCLAIMER_TEXT)}</p>

      {unavailableSources.length > 0 && (
        <ul className="mt-2 space-y-1">
          {unavailableSources.map(key => (
            <li key={key} role="alert" className="rounded-lg bg-amber-50 px-2 py-1.5 text-xs print:text-[10px] text-amber-900">{text(SOURCE_UNAVAILABLE_TEXT[key])}</li>
          ))}
        </ul>
      )}

      {items.length === 0 && (
        <p className="mt-2 text-xs print:text-[10px] text-slate-500">{text(EMPTY_STATE_TEXT)}</p>
      )}

      {adoption?.errorMessage && (
        <p role="alert" className="print-hidden mt-2 rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-800">{text(adoption.errorMessage)}</p>
      )}

      {groups.primary.length > 0 && renderBriefItems(groups.primary, text, adoption)}

      {(['careNotes', 'scheduledReminders'] as const).map(group => groups[group].length > 0 && (
        <section key={group} className="mt-3" aria-labelledby={`pre-visit-brief-${group}-title`}>
          <p id={`pre-visit-brief-${group}-title`} className="text-xs print:text-[10px] font-bold text-slate-700">{text(SOURCE_GROUP_META[group].label)}</p>
          <p className="text-[11px] print:text-[9px] text-slate-500">{text(SOURCE_GROUP_META[group].caption)}</p>
          {renderBriefItems(groups[group], text, adoption)}
        </section>
      ))}
    </div>
  )
}

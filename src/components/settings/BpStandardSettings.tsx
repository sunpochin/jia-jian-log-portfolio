/*
檔案用途：issue #898 C——照護者在這裡選這位病人的血壓判讀標準模板（或自訂目標帶），
        並看到「現在用哪一份」與「哪一份已排程、從何時起生效」。
所在層：src/components/settings；自給自足元件，只接 patientId／isDemoMode／canManageMedication，
        自己管狀態、自己呼叫 lib，比照 CareAnomalyAlertSettings 慣例，避免 SettingsPage 的
        props 清單再變長；canManageMedication 直接來自 SettingsPage 既有的 availablePatients。
主要關聯：src/lib/bpStandards.ts（讀寫與生效區間解析）、src/types/database/bpStandard.ts（模板定義）、
        docs/product/blood-pressure-standard-templates.md §3、§5。

這個面板刻意**不**提供「修改現行標準的門檻」：換標準是新增一段生效區間，舊區間只會被結束，
歷史判讀因此不會被改寫（issue #897）。UI 也必須讓使用者理解這件事，所以下方有一行明說。
*/
import { useEffect, useMemo, useState } from 'react'
import { useI18n, type LocalizedText } from '../../lib/i18n'
import { useSaveStatus } from '../../hooks/useSaveStatus'
import { describeSaveError } from '../../lib/dataErrors'
import {
  currentInterval,
  scheduledIntervals,
  setBpStandard,
  type BpStandardInterval,
} from '../../lib/bpStandards'
import { useBpEvaluator } from '../../features/vitals/hooks/useBpEvaluator'
import {
  BP_STANDARD_KEYS,
  CUSTOM_ALLOWED_BOUNDS,
  CUSTOM_DEFAULT_BOUNDS,
  assertCustomBounds,
  resolveBpStandard,
  targetSystolicBand,
  type BpCustomBounds,
  type BpStandardKey,
} from '../../types/database/bpStandard'

const TITLE: LocalizedText = { id: 'Standar penilaian tekanan darah', zh: '血壓判讀標準', en: 'Blood pressure standard' }
const HELP: LocalizedText = {
  id: 'Pilih standar yang dipakai untuk menilai tekanan darah orang ini. Dokter dapat menetapkan target yang lebih ketat setelah operasi, atau lebih longgar untuk lansia. Ini bukan diagnosis — ikuti anjuran dokter.',
  zh: '選擇這位照護對象的血壓判讀依據。醫師可能在術後訂出更嚴格的目標，或對高齡者放寬。這不是診斷，請依醫師指示設定。',
  en: 'Choose the standard used to interpret this person’s blood pressure. A doctor may set a stricter target after surgery, or a more relaxed one for an older adult. This is not a diagnosis — follow your doctor’s instructions.',
}
// 生效日期化最容易被誤解的一點：使用者以為換標準會把過去的紀錄一起重算。說清楚比事後解釋便宜。
const EFFECTIVE_NOTICE: LocalizedText = {
  id: 'Perubahan berlaku mulai sekarang. Catatan lama tetap dinilai dengan standar yang berlaku saat itu.',
  zh: '變更從現在起生效。過去的紀錄仍以當時生效的標準判讀，不會被重新上色。',
  en: 'Changes take effect from now on. Past records keep the standard that was in force at the time.',
}
const DEMO_NOTICE: LocalizedText = { id: 'Pengaturan ini tidak tersedia dalam mode demo.', zh: '展示模式不提供這項設定。', en: 'This setting is not available in demo mode.' }
// 資料庫只允許 can_manage_medication 的照護者寫入這張表（見 migration 的 RLS policy），
// 只讀權限的家人能選卻在儲存時被 RLS 拒絕會很困惑——直接鎖住並說明原因。
const READ_ONLY_NOTICE: LocalizedText = {
  id: 'Hanya pengelola pengobatan yang dapat mengubah standar ini.',
  zh: '只有被授權管理醫囑的家屬能調整這項設定。',
  en: 'Only caregivers authorized to manage medication can change this standard.',
}
const NOT_CONFIGURED: LocalizedText = {
  id: 'Belum diatur — memakai standar dewasa umum.',
  zh: '尚未設定——目前使用一般成人標準。',
  en: 'Not set — using the general adult standard.',
}
// 讀取失敗與「查過了、確實沒設定」是兩件事，文案必須分得出來：後者可以安心地繼續用一般成人標準，
// 前者代表我們還不知道這位病人的目標，照護者看到的顏色暫時不可信。
const READ_FAILED: LocalizedText = {
  id: 'Gagal membaca standar penilaian. Warna sementara memakai standar dewasa umum.',
  zh: '無法讀取判讀標準，畫面暫時以一般成人標準上色。',
  en: 'Could not read the interpretation standard; colours temporarily use the general adult standard.',
}
const RETRY: LocalizedText = { id: 'Coba lagi', zh: '重試', en: 'Retry' }
const CURRENT_LABEL: LocalizedText = { id: 'Sedang berlaku', zh: '現在生效', en: 'Currently in force' }
const SCHEDULED_LABEL: LocalizedText = { id: 'Terjadwal', zh: '已排程', en: 'Scheduled' }
const NOTE_LABEL: LocalizedText = { id: 'Sumber (mis. kunjungan mana)', zh: '依據（例如哪次門診）', en: 'Source (e.g. which visit)' }
const SAVE_LABEL: LocalizedText = { id: 'Simpan standar', zh: '儲存標準', en: 'Save standard' }
const BOUND_LABELS: Record<keyof BpCustomBounds, LocalizedText> = {
  systolicMin: { id: 'Sistolik minimum', zh: '收縮壓目標下限', en: 'Systolic target minimum' },
  systolicMax: { id: 'Sistolik maksimum', zh: '收縮壓目標上限', en: 'Systolic target maximum' },
  diastolicMin: { id: 'Diastolik minimum', zh: '舒張壓目標下限', en: 'Diastolic target minimum' },
  diastolicMax: { id: 'Diastolik maksimum', zh: '舒張壓目標上限', en: 'Diastolic target maximum' },
}
const BOUND_ORDER: Array<keyof BpCustomBounds> = ['systolicMin', 'systolicMax', 'diastolicMin', 'diastolicMax']

// 自訂目標的輸入錯誤直接對照 assertCustomBounds 丟出的三種原因，不把 Error.message（英文）
// 原樣丟到畫面上——看護看到的必須是印尼文（AGENTS.md §3.6）。
const BOUNDS_ERROR: LocalizedText = {
  id: `Target harus bilangan bulat, minimum < maksimum, sistolik ${CUSTOM_ALLOWED_BOUNDS.systolicMin}–${CUSTOM_ALLOWED_BOUNDS.systolicMax}, diastolik ${CUSTOM_ALLOWED_BOUNDS.diastolicMin}–${CUSTOM_ALLOWED_BOUNDS.diastolicMax}.`,
  zh: `目標必須是整數、下限小於上限，收縮壓 ${CUSTOM_ALLOWED_BOUNDS.systolicMin}–${CUSTOM_ALLOWED_BOUNDS.systolicMax}、舒張壓 ${CUSTOM_ALLOWED_BOUNDS.diastolicMin}–${CUSTOM_ALLOWED_BOUNDS.diastolicMax}。`,
  en: `Targets must be whole numbers with minimum < maximum, systolic ${CUSTOM_ALLOWED_BOUNDS.systolicMin}–${CUSTOM_ALLOWED_BOUNDS.systolicMax} and diastolic ${CUSTOM_ALLOWED_BOUNDS.diastolicMin}–${CUSTOM_ALLOWED_BOUNDS.diastolicMax}.`,
}

function describeInterval(interval: BpStandardInterval): LocalizedText {
  const standard = resolveBpStandard(interval.templateKey, interval.customBounds ?? undefined)
  const band = targetSystolicBand(standard)
  const range = band ? ` ${band.min}–${band.max} mmHg` : ''
  return {
    zh: `${standard.names.zh}${range}`,
    id: `${standard.names.id}${range}`,
    en: `${standard.names.en}${range}`,
  }
}

export function BpStandardSettingsPanel({ patientId, isDemoMode, canManageMedication }: { patientId: string; isDemoMode: boolean; canManageMedication: boolean }) {
  const { text } = useI18n()
  // Codex review（PR #905，P1）：這個面板原本自己讀一份 intervals，存檔後也只重讀自己那一份。
  // 於是換完標準走回「今天」或血壓輸入頁，那些畫面仍然用 Provider 裡**舊的** resolver 判讀，
  // 要整頁重載或切換病人才會更新——一個會改變健康判讀的設定，不能有這種延遲。
  // 改成與 Provider 共用同一份狀態：面板讀它、存完呼叫它的 reload()，全 app 同時換掉。
  const evaluator = useBpEvaluator()
  const [selectedKey, setSelectedKey] = useState<BpStandardKey>('general_adult')
  const [bounds, setBounds] = useState<BpCustomBounds>(CUSTOM_DEFAULT_BOUNDS)
  const [note, setNote] = useState('')
  const [boundsError, setBoundsError] = useState(false)
  // 表單目前顯示的是哪一位病人的值。切換病人時用它判斷「該重置了」，
  // 而不是只在「新病人有生效區間」時才覆寫——見下方 effect。
  const [formFor, setFormFor] = useState<string | null>(null)
  const save = useSaveStatus()

  // 這個面板的 patientId 與 Provider 綁的必須是同一位；兩者都來自 App 的 selectedPatientId，
  // 不一致代表 Provider 還沒跟上（或掛錯地方），這時不得拿另一位病人的區間來填這張表單。
  const inSync = evaluator.patientId === patientId
  // useMemo 不是為了效能：不同步時每次 render 都會生出一個新的 []，那個新身分會讓下方的
  // effect 與 useMemo 每一幀都重跑，等於把「切換病人時重置一次」變成「每次 render 都重置」，
  // 使用者打到一半的輸入會被清掉。
  const intervals = useMemo(() => (inSync ? evaluator.intervals : []), [inSync, evaluator.intervals])
  const loading = !isDemoMode && (!inSync || evaluator.loading)
  const loadError = inSync ? evaluator.error : null

  useEffect(() => {
    if (loading) return
    // Codex review（PR #905，P1）：原本只有「新病人有生效區間」時才覆寫表單，否則保留前一位的值。
    // 於是從一位設了自訂目標的病人切到一位尚未設定的病人，畫面上會顯示、而且可以直接按下儲存
    // **前一位病人的目標帶與門診備註**。所以一律先重置成預設，再填入屬於這位病人的值。
    if (formFor === patientId) return
    const active = currentInterval(intervals)
    // 預選「現在生效的那一份」，不是最後一列：排了未來生效的區間時，最後一列還沒生效，
    // 預選它會讓畫面看起來像已經在用了（同 currentInterval 的理由）。
    setSelectedKey((active?.templateKey as BpStandardKey) ?? 'general_adult')
    setBounds(active?.customBounds ?? CUSTOM_DEFAULT_BOUNDS)
    setNote(active?.prescribedNote ?? '')
    setBoundsError(false)
    setFormFor(patientId)
  }, [patientId, loading, intervals, formFor])

  const active = useMemo(() => currentInterval(intervals), [intervals])
  const scheduled = useMemo(() => scheduledIntervals(intervals), [intervals])

  const handleSave = async () => {
    if (isDemoMode) return
    if (selectedKey === 'custom') {
      // 引擎層的 assertCustomBounds 與資料庫 CHECK 是同一組規則的兩道防線；這裡先跑是為了
      // 讓照護者看到看得懂的三語訊息，而不是一個 Postgres constraint 名稱。
      try { assertCustomBounds(bounds) } catch { setBoundsError(true); return }
    }
    setBoundsError(false)
    save.begin()
    try {
      await setBpStandard(patientId, {
        templateKey: selectedKey,
        bounds: selectedKey === 'custom' ? bounds : undefined,
        prescribedNote: note.trim() || null,
      })
      // 讓 Provider 重讀，不在本地拼一列假的區間：RPC 會順便結束舊區間並蓋上伺服器時間，
      // 本地猜出來的 effective_from 與資料庫實際寫入的值會差幾百毫秒，而那正是解析邊界的依據。
      // 走 Provider 也代表清單、圖表、報告與異常示警在同一刻一起換成新標準。
      evaluator.reload()
      save.succeed(text({ id: 'Standar disimpan.', zh: '標準已儲存。', en: 'Standard saved.' }))
    } catch (error) {
      console.error('[bp standard save error]', error)
      save.fail(text(describeSaveError(error)))
    }
  }

  const busy = save.status === 'saving'
  const readOnly = !isDemoMode && !canManageMedication
  const fieldsDisabled = isDemoMode || readOnly || busy

  return (
    <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-4" aria-labelledby="bp-standard-settings-title">
      <h2 id="bp-standard-settings-title" className="font-bold text-gray-900">{text(TITLE)}</h2>
      <p className="mt-1 text-sm text-gray-500">{text(HELP)}</p>

      {isDemoMode && <p className="mt-3 rounded-xl bg-gray-100 px-3 py-2 text-xs text-gray-600">{text(DEMO_NOTICE)}</p>}
      {readOnly && !loading && <p className="mt-3 rounded-xl bg-gray-100 px-3 py-2 text-xs text-gray-600">{text(READ_ONLY_NOTICE)}</p>}

      {!isDemoMode && loading && <p className="mt-3 text-sm text-gray-500">{text({ id: 'Memuat…', zh: '載入中…', en: 'Loading…' })}</p>}

      {!isDemoMode && !loading && loadError != null && (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          {text(READ_FAILED)}
          <button type="button" onClick={() => evaluator.reload()} className="ml-2 underline">{text(RETRY)}</button>
        </p>
      )}

      {!loading && loadError == null && (
        <>
          <dl className="mt-3 space-y-1 rounded-xl bg-gray-50 px-3 py-2 text-xs">
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-bold text-gray-600">{text(CURRENT_LABEL)}:</dt>
              <dd className="font-semibold text-gray-900">{active ? text(describeInterval(active)) : text(NOT_CONFIGURED)}</dd>
            </div>
            {/* 排程中的區間一定要說出來，否則使用者排了「下次回診起改用新目標」卻在畫面上看不到，會以為沒存到。 */}
            {scheduled.map(interval => (
              <div key={interval.id} className="flex flex-wrap gap-x-2">
                <dt className="font-bold text-gray-600">{text(SCHEDULED_LABEL)}:</dt>
                <dd className="text-gray-700">
                  {text(describeInterval(interval))} · {new Date(interval.effectiveFrom).toLocaleDateString()}
                </dd>
              </div>
            ))}
          </dl>

          <fieldset className="mt-4" disabled={fieldsDisabled}>
            <legend className="sr-only">{text(TITLE)}</legend>
            <div className="space-y-2">
              {BP_STANDARD_KEYS.map(key => {
                const standard = resolveBpStandard(key, key === 'custom' ? bounds : undefined)
                return (
                  <label key={key} className="flex min-h-11 items-start gap-3 rounded-xl border border-gray-200 px-3 py-2">
                    <input
                      type="radio"
                      name="bp-standard"
                      value={key}
                      checked={selectedKey === key}
                      onChange={() => setSelectedKey(key)}
                      className="mt-1 h-4 w-4 shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-gray-900">{text(standard.names)}</span>
                      <span className="block text-xs text-gray-500">{text(standard.descriptions)}</span>
                    </span>
                  </label>
                )
              })}
            </div>

            {selectedKey === 'custom' && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                {BOUND_ORDER.map(field => (
                  <label key={field} className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-gray-600">{text(BOUND_LABELS[field])}</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={String(bounds[field])}
                      onChange={e => setBounds(previous => ({ ...previous, [field]: e.target.valueAsNumber }))}
                      className="min-h-11 rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                ))}
              </div>
            )}

            {boundsError && (
              <p role="alert" className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{text(BOUNDS_ERROR)}</p>
            )}

            <label className="mt-3 flex flex-col gap-1">
              <span className="text-xs font-semibold text-gray-600">{text(NOTE_LABEL)}</span>
              <input
                type="text"
                value={note}
                maxLength={200}
                onChange={e => setNote(e.target.value)}
                className="min-h-11 rounded-xl border border-gray-300 px-3 py-2 text-sm"
              />
            </label>

            <p className="mt-3 rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600">{text(EFFECTIVE_NOTICE)}</p>

            <button
              type="button"
              onClick={() => void handleSave()}
              className="mt-3 min-h-11 w-full rounded-xl bg-brand-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              {text(SAVE_LABEL)}
            </button>
          </fieldset>
        </>
      )}

      {save.status === 'ok' && <p className="mt-2 text-xs font-semibold text-emerald-700">{save.message}</p>}
      {save.status === 'err' && <p role="alert" className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{save.message}</p>}
    </section>
  )
}

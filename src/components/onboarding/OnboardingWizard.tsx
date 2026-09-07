/*
檔案用途：首次使用時顯示的三題引導精靈（照顧誰／誰記錄／要記什麼），完成後把答案換算成每日照護模組開關。
所在層：src/components/onboarding 畫面層；只負責收集答案與呈現，實際寫入 Supabase／Demo 由 App.tsx 透過 onComplete 處理。
主要關聯：lib/onboardingWizard（選項與換算規則）、lib/dailyCareModules（模組清單與物種篩選）、App.tsx（觸發時機與儲存）。
*/
import { useMemo, useState } from 'react'
import { useI18n, type LocalizedText } from '../../lib/i18n'
import { DAILY_CARE_MODULES, isModuleApplicableToSpecies, type DailyCareModuleId } from '../../lib/dailyCareModules'
import { ONBOARDING_CARE_TARGET_OPTIONS, ONBOARDING_RECORDER_OPTIONS, recommendedOnboardingModuleIds, type OnboardingCareTarget, type OnboardingRecorder } from '../../lib/onboardingWizard'

const TOTAL_STEPS = 3

export function OnboardingWizard({ initialCareTarget, canUseMedication, saving, error, onComplete, onSkip }: {
  initialCareTarget?: OnboardingCareTarget
  canUseMedication: boolean
  saving: boolean
  error: LocalizedText | null
  onComplete: (careTarget: OnboardingCareTarget, recorder: OnboardingRecorder, selectedModuleIds: DailyCareModuleId[]) => void | Promise<void>
  onSkip: () => void
}) {
  const { text } = useI18n()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [careTarget, setCareTarget] = useState<OnboardingCareTarget | null>(initialCareTarget ?? null)
  const [recorder, setRecorder] = useState<OnboardingRecorder | null>(null)
  const [selectedModuleIds, setSelectedModuleIds] = useState<Set<DailyCareModuleId> | null>(null)
  // 記住上次是用哪組答案算出建議值，這樣「上一步」再回到第三題時不會把使用者剛改過的勾選重算掉。
  const [seededFrom, setSeededFrom] = useState<string | null>(null)

  // 沒有服藥權限時，服藥模組即使勾了也會被 visibleDailyCareModules() 擋掉，變成看不出原因的死選項；
  // 設定頁用 permissionLocked 處理同一件事，精靈直接不列出，避免第一次使用就先踩一個無效選項。
  const applicableModules = useMemo(
    () => careTarget
      ? DAILY_CARE_MODULES.filter(module => isModuleApplicableToSpecies(module, careTarget) && (module.id !== 'medication' || canUseMedication))
      : [],
    [careTarget, canUseMedication],
  )

  const goToStep3 = (nextRecorder: OnboardingRecorder) => {
    if (!careTarget) return
    setRecorder(nextRecorder)
    const seedKey = `${careTarget}:${nextRecorder}`
    if (seedKey !== seededFrom) {
      // 只有答案真的變了才重算建議值；否則沿用使用者已經調整過的勾選。
      setSelectedModuleIds(new Set(recommendedOnboardingModuleIds(careTarget, nextRecorder).filter(id => id !== 'medication' || canUseMedication)))
      setSeededFrom(seedKey)
    }
    setStep(3)
  }

  const toggleModule = (moduleId: DailyCareModuleId, enabled: boolean) => {
    setSelectedModuleIds(previous => {
      const next = new Set(previous ?? [])
      if (enabled) next.add(moduleId)
      else next.delete(moduleId)
      return next
    })
  }

  const finish = () => {
    if (!careTarget || !recorder || !selectedModuleIds) return
    void onComplete(careTarget, recorder, [...selectedModuleIds])
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-gray-50 px-5 py-10 text-gray-900">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-indigo-700">{text({ id: `Langkah ${step} dari ${TOTAL_STEPS}`, zh: `第 ${step} / ${TOTAL_STEPS} 題` ,en: `Langkah ${step} from ${TOTAL_STEPS}` })}</p>
        <button type="button" onClick={onSkip} disabled={saving} className="min-h-11 text-sm font-semibold text-gray-500 underline disabled:opacity-60">
          {text({ id: 'Lewati, atur nanti', zh: '略過，稍後再設定' ,en: "Lewati, atur nanti" })}
        </button>
      </div>

      <section className="mt-4 rounded-3xl bg-white p-6 shadow-sm">
        {step === 1 && (
          <fieldset>
            <legend className="text-xl font-black">{text({ id: 'Siapa yang Anda rawat?', zh: '照顧誰？' ,en: "Siapa that You rawat?" })}</legend>
            <p className="mt-2 text-sm text-gray-500">{text({ id: 'Ini menentukan item perawatan yang relevan untuknya.', zh: '這會決定接下來要顯示哪些相關的照護項目。' ,en: "This menentukan item care that relevan fornya." })}</p>
            <div className="mt-4 space-y-2">
              {ONBOARDING_CARE_TARGET_OPTIONS.map(option => (
                <label key={option.value} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl bg-gray-50 px-3 py-2 text-sm">
                  <input type="radio" name="onboarding-care-target" checked={careTarget === option.value} onChange={() => setCareTarget(option.value)} className="h-5 w-5 accent-indigo-600" />
                  <span className="font-semibold text-gray-900">{text(option.label)}</span>
                </label>
              ))}
            </div>
            <button type="button" disabled={!careTarget} onClick={() => setStep(2)} className="mt-6 w-full rounded-xl bg-indigo-700 px-4 py-3 font-bold text-white disabled:opacity-60">
              {text({ id: 'Lanjut', zh: '下一步' ,en: "Next" })}
            </button>
          </fieldset>
        )}

        {step === 2 && (
          <fieldset>
            <legend className="text-xl font-black">{text({ id: 'Siapa yang akan mencatat?', zh: '誰記錄？' ,en: "Siapa that will record?" })}</legend>
            <p className="mt-2 text-sm text-gray-500">{text({ id: 'Ini hanya menentukan item awal; Anda tetap bisa mengubahnya di Pengaturan.', zh: '這只是決定一開始顯示的項目，之後仍可以在設定頁調整。' ,en: "This only menentukan item awal; You tetap can mengubahnya in Settings." })}</p>
            <div className="mt-4 space-y-2">
              {ONBOARDING_RECORDER_OPTIONS.map(option => (
                <label key={option.value} className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl bg-gray-50 px-3 py-2 text-sm">
                  <input type="radio" name="onboarding-recorder" checked={recorder === option.value} onChange={() => setRecorder(option.value)} className="mt-0.5 h-5 w-5 accent-indigo-600" />
                  <span>
                    <span className="block font-semibold text-gray-900">{text(option.label)}</span>
                    <span className="mt-0.5 block text-xs text-gray-500">{text(option.description)}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-6 flex gap-3">
              <button type="button" onClick={() => setStep(1)} className="min-h-12 flex-1 rounded-xl border border-gray-300 px-4 py-3 font-bold text-gray-700">{text({ id: 'Kembali', zh: '上一步' ,en: "Back" })}</button>
              <button type="button" disabled={!recorder} onClick={() => recorder && goToStep3(recorder)} className="min-h-12 flex-1 rounded-xl bg-indigo-700 px-4 py-3 font-bold text-white disabled:opacity-60">{text({ id: 'Lanjut', zh: '下一步' ,en: "Next" })}</button>
            </div>
          </fieldset>
        )}

        {step === 3 && selectedModuleIds && (
          <fieldset>
            <legend className="text-xl font-black">{text({ id: 'Apa yang ingin dicatat?', zh: '要記什麼？' ,en: "Apa that ingin direcord?" })}</legend>
            <p className="mt-2 text-sm text-gray-500">{text({ id: 'Kami sudah memilihkan beberapa; centang atau hapus sesuai kebutuhan.', zh: '我們先幫你勾選建議項目，你可以再自行增減。' ,en: "We already memilihkan beberapa; centang or delete sesuai tobutuhan." })}</p>
            <div className="mt-4 space-y-2">
              {applicableModules.map(module => (
                <label key={module.id} htmlFor={`onboarding-module-${module.id}`} className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2 text-sm">
                  <span className="font-semibold text-gray-900">{text(module.label)}</span>
                  <input
                    id={`onboarding-module-${module.id}`}
                    type="checkbox"
                    checked={selectedModuleIds.has(module.id)}
                    disabled={saving}
                    onChange={event => toggleModule(module.id, event.target.checked)}
                    className="h-5 w-5 shrink-0 accent-indigo-600"
                  />
                </label>
              ))}
            </div>
            {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{text(error)}</p>}
            <div className="mt-6 flex gap-3">
              <button type="button" disabled={saving} onClick={() => setStep(2)} className="min-h-12 flex-1 rounded-xl border border-gray-300 px-4 py-3 font-bold text-gray-700 disabled:opacity-60">{text({ id: 'Kembali', zh: '上一步' ,en: "Back" })}</button>
              <button type="button" disabled={saving || selectedModuleIds.size === 0} onClick={finish} className="min-h-12 flex-1 rounded-xl bg-indigo-700 px-4 py-3 font-bold text-white disabled:opacity-60">
                {saving ? text({ id: 'Menyimpan…', zh: '正在儲存…' ,en: "Saving…" }) : text({ id: 'Selesai', zh: '完成設定' ,en: "Done" })}
              </button>
            </div>
          </fieldset>
        )}
      </section>
    </main>
  )
}

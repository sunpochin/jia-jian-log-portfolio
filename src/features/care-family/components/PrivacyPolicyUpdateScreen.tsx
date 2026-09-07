/*
檔案用途：在隱私政策版本更新後取得使用者明確確認，避免登入 session 恢復時靜默改寫法律稽核時間。
所在層：src/features/care-family/components 同意流程畫面層；由 App.tsx 在健康資料畫面前呈現。
主要關聯：使用 lib/legalConsent.ts 寫入帳號層政策接受，並連結公開 PrivacyPage 與 TermsPage。
*/
import { useState } from 'react'
import { useI18n, type LocalizedText } from '../../../lib/i18n'
import { recordAccountLegalAcceptance } from '../../../lib/legalConsent'
import { signOut } from '../../../lib/auth'

export function PrivacyPolicyUpdateScreen({ onAccepted }: { onAccepted: () => Promise<void> }) {
  const { text } = useI18n()
  const [checked, setChecked] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<LocalizedText | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!checked) return
    setSaving(true)
    setError(null)
    try {
      // 為什麼先寫入再放行：privacy_acknowledged_at 必須對應使用者按下確認的動作，不能由讀取狀態順便產生。
      await recordAccountLegalAcceptance()
      await onAccepted()
    } catch (cause) {
      console.error('[privacy policy acknowledgement error]', cause)
      setError({
        id: 'Pembaruan kebijakan belum dapat disimpan. Silakan coba lagi.',
        zh: '隱私權政策確認暫時無法保存，請再試一次。',
        en: 'The privacy policy acknowledgement could not be saved. Please try again.',
      })
    } finally {
      setSaving(false)
    }
  }

  return <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-gray-50 px-5 py-10 text-gray-900">
    <div className="flex justify-end"><button onClick={() => void signOut()} className="text-sm text-gray-600 underline">{text({ id: 'Keluar', zh: '登出', en: 'Sign out' })}</button></div>
    <section className="mt-5 rounded-3xl bg-white p-6 shadow-sm">
      <p className="text-sm font-bold text-indigo-700">{text({ id: 'Pembaruan kebijakan privasi', zh: '隱私權政策更新', en: 'Privacy Policy Update' })}</p>
      <h1 className="mt-2 text-2xl font-black">{text({ id: 'Sebelum melanjutkan', zh: '繼續使用前', en: 'Before you continue' })}</h1>
      <p className="mt-3 text-sm leading-6 text-gray-700">{text({
        id: 'Kebijakan Privasi telah diperbarui untuk menjelaskan kunjungan halaman dan peristiwa anonim yang membantu kami memahami alur pengenalan. Peristiwa ini tidak mengirim identitas atau nilai kesehatan.',
        zh: '《隱私權政策》已更新，補充說明頁面瀏覽與匿名事件如何協助我們了解介紹流程。這些事件不會送出身分資料或健康數值。',
        en: 'The Privacy Policy has been updated to explain page visits and anonymous events that help us understand the introduction flow. These events do not send identity information or health values.',
      })}</p>
      <div className="mt-4 flex gap-3 text-sm">
        <a href="/privacy" className="font-bold text-blue-700 underline">{text({ id: 'Baca Kebijakan Privasi', zh: '閱讀隱私權政策', en: 'Read the Privacy Policy' })}</a>
        <a href="/terms" className="font-bold text-blue-700 underline">{text({ id: 'Baca Syarat Layanan', zh: '閱讀服務條款', en: 'Read the Terms of Service' })}</a>
      </div>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="flex items-start gap-3 rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-sm leading-6 text-indigo-950">
          <input required type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} className="mt-1 h-4 w-4" />
          <span>{text({
            id: 'Saya telah membaca Kebijakan Privasi dan Syarat Layanan yang berlaku, termasuk penjelasan tentang analitik anonim.',
            zh: '我已閱讀目前適用的《隱私權政策》與《服務條款》，包括匿名分析的說明。',
            en: 'I have read the current Privacy Policy and Terms of Service, including the explanation of anonymous analytics.',
          })}</span>
        </label>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{text(error)}</p>}
        <button type="submit" disabled={!checked || saving} className="w-full rounded-xl bg-indigo-700 px-4 py-3 font-bold text-white disabled:opacity-60">
          {saving ? text({ id: 'Menyimpan…', zh: '正在保存…', en: 'Saving…' }) : text({ id: 'Setuju dan lanjutkan', zh: '確認並繼續', en: 'Acknowledge and continue' })}
        </button>
      </form>
    </section>
  </main>
}

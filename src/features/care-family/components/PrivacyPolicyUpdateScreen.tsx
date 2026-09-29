/*
檔案用途：在隱私政策版本更新後取得使用者明確確認，避免登入 session 恢復時靜默改寫法律稽核時間。
所在層：src/features/care-family/components 同意流程畫面層；由 App.tsx 在健康資料畫面前呈現。
主要關聯：使用 lib/legalConsent.ts 寫入帳號層政策接受，並連結公開 PrivacyPage 與 TermsPage。
2026-09-25（issue #424）：更新摘要改為說明本次新增的 Telegram／LINE／Resend 揭露與唯讀分享連結——這個畫面是既有使用者在升版後
唯一會看到的變更摘要，若仍停留在上一版的「匿名分析、不送健康數值」，會讓使用者在誤導的摘要下確認新政策。
唯讀分享連結另升為 2026-09-25.2（PR #922）；只接受過 2026-09-25 的使用者會再看到本畫面一次，
摘要與勾選文字必須同時提到兩者：從更舊版本直接升上來的人兩項都沒看過，缺一項就等於那一項沒有告知。
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
        id: 'Kebijakan Privasi telah diperbarui untuk mencantumkan layanan notifikasi dan email di luar Taiwan: Telegram dan LINE dapat menerima nama penerima perawatan dan nilai tekanan darah melalui notifikasi, dan Resend mengirim email undangan keluarga. Kebijakan ini juga menjelaskan tautan berbagi baca-saja: anggota keluarga yang diberi izin dapat membuat tautan berbatas waktu (bawaan 24 jam, paling lama 7 hari) agar orang di luar aplikasi, termasuk yang berada di luar Taiwan, dapat melihat ringkasan tekanan darah atau perawatan; siapa pun yang memegang tautan dapat melihatnya, dan fitur ini belum ditinjau oleh pengacara atau petugas perlindungan data pribadi. Baca Kebijakan Privasi untuk rincian data yang dikirim dan cara memilih.',
        zh: '《隱私權政策》已更新，補充列出台灣以外的通知與寄信服務：Telegram 與 LINE 會透過通知收到照護對象姓名與血壓數值，Resend 負責寄送家庭邀請信。另外也說明「唯讀分享連結」：被授權的家屬可以建立有期限的連結（預設 24 小時、最長 7 天），讓 App 以外的人（可能在台灣以外）查看血壓或照護摘要；任何拿到連結的人都能查看，本功能也未經律師或個資專責人員審閱。送出哪些資料、如何選用，請閱讀《隱私權政策》。',
        en: 'The Privacy Policy has been updated to list notification and email services outside Taiwan: Telegram and LINE can receive the care recipient’s name and blood-pressure values through notifications, and Resend sends family invitation emails. It also explains read-only share links: authorized family members can create time-limited links (24 hours by default, 7 days at most) that let people outside the app, including people outside Taiwan, view a blood-pressure or care summary; anyone holding a link can view it, and this feature has not been reviewed by a lawyer or a data-protection specialist. Read the Privacy Policy for what is sent and how to opt in.',
      })}</p>
      <div className="mt-4 flex gap-3 text-sm">
        <a href="/privacy" className="font-bold text-blue-700 underline">{text({ id: 'Baca Kebijakan Privasi', zh: '閱讀隱私權政策', en: 'Read the Privacy Policy' })}</a>
        <a href="/terms" className="font-bold text-blue-700 underline">{text({ id: 'Baca Syarat Layanan', zh: '閱讀服務條款', en: 'Read the Terms of Service' })}</a>
      </div>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="flex items-start gap-3 rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-sm leading-6 text-indigo-950">
          <input required type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} className="mt-1 h-4 w-4" />
          <span>{text({
            id: 'Saya telah membaca Kebijakan Privasi dan Syarat Layanan yang berlaku, termasuk penjelasan tentang layanan notifikasi dan email pihak ketiga serta tautan berbagi baca-saja.',
            zh: '我已閱讀目前適用的《隱私權政策》與《服務條款》，包括第三方通知與寄信服務，以及唯讀分享連結的說明。',
            en: 'I have read the current Privacy Policy and Terms of Service, including the explanation of third-party notification and email services and of read-only share links.',
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

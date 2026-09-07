/*
檔案用途：在首次建立或查看健康紀錄前取得可證明的健康資料明確同意。
所在層：src/components 同意流程畫面層；由 App.tsx 在已登入後、照護資料載入前顯示。
主要關聯：連結公開的 HealthDataNoticePage，並透過 lib/legalConsent.ts 寫入受限資料庫 RPC。
*/
import { useState } from 'react'
import { useI18n, type LocalizedText } from '../../../lib/i18n'
import { recordHealthDataConsent, type ConsentType } from '../../../lib/legalConsent'
import { signOut } from '../../../lib/auth'

export function HealthDataConsentScreen({ onAccepted }: { onAccepted: () => Promise<void> }) {
  const { text } = useI18n()
  const [checked, setChecked] = useState(false)
  const [consentType, setConsentType] = useState<ConsentType>('self')
  const [authorizationBasis, setAuthorizationBasis] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<LocalizedText | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!checked || (consentType === 'authorized_representative' && !authorizationBasis.trim())) return
    setSaving(true)
    setError(null)
    try {
      await recordHealthDataConsent(consentType, authorizationBasis)
      await onAccepted()
    } catch (cause) {
      console.error('[health data consent error]', cause)
      setError({ id: 'Persetujuan belum dapat disimpan. Silakan coba lagi.', zh: '暫時無法保存同意，請再試一次。', en: 'There was an error saving your consent, please try again.' })
    } finally {
      setSaving(false)
    }
  }

  return <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-gray-50 px-5 py-10 text-gray-900">
    <div className="flex justify-end"><button onClick={() => void signOut()} className="text-sm text-gray-600 underline">{text({ id: 'Keluar', zh: '登出', en: 'Sign out' })}</button></div>
    <section className="mt-5 rounded-3xl bg-white p-6 shadow-sm">
      <p className="text-sm font-bold text-indigo-700">{text({ id: 'Persetujuan data kesehatan', zh: '健康資料同意', en: 'Health Information Consent' })}</p>
      <h1 className="mt-2 text-2xl font-black">{text({ id: 'Sebelum mulai mencatat', zh: '開始建立健康紀錄前', en: 'Before you start recording' })}</h1>
      <p className="mt-3 text-sm leading-6 text-gray-700">{text({ id: 'Catatan tekanan darah, obat, dan perawatan adalah data kesehatan sensitif. Bacalah pemberitahuan ini lalu berikan persetujuan yang jelas.', zh: '血壓、藥物與照護紀錄屬敏感健康資料。請先閱讀告知事項，再明確作出同意。', en: 'Blood pressure, medication, and care records are sensitive health information. Read this notice and provide clear consent before continuing.' })}</p>
      <a href="/health-data-notice" className="mt-4 inline-block font-bold text-blue-700 underline">{text({ id: 'Baca Pemberitahuan Pengumpulan Data Pribadi', zh: '閱讀個人資料蒐集告知事項', en: 'Read the Personal Information Collection Notice' })}</a>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <fieldset>
          <legend className="text-sm font-bold">{text({ id: 'Anda memberikan persetujuan sebagai', zh: '您是以何種身分提供同意', en: 'In what capacity did you provide your consent?' })}</legend>
          <label className="mt-2 flex gap-2 text-sm"><input type="radio" checked={consentType === 'self'} onChange={() => setConsentType('self')} />{text({ id: 'Pemilik data sendiri', zh: '資料當事人本人', en: 'The data subject' })}</label>
          <label className="mt-2 flex gap-2 text-sm"><input type="radio" checked={consentType === 'authorized_representative'} onChange={() => setConsentType('authorized_representative')} />{text({ id: 'Perwakilan yang berwenang', zh: '具授權的代理人', en: 'Authorized Agent' })}</label>
        </fieldset>
        {consentType === 'authorized_representative' && <label className="block text-sm font-bold">{text({ id: 'Hubungan dan dasar kewenangan', zh: '與當事人的關係及授權依據', en: 'Relationship and authorization basis' })}<input required maxLength={200} value={authorizationBasis} onChange={event => setAuthorizationBasis(event.target.value)} className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2.5" placeholder={text({ id: 'Contoh: anak, dengan persetujuan ibu', zh: '例如：子女，經母親同意', en: 'Example: child, with the mother’s consent' })} /></label>}
        <label className="flex items-start gap-3 rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-sm leading-6 text-indigo-950"><input required type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} className="mt-1 h-4 w-4" /><span>{text({ id: 'Saya telah membaca Pemberitahuan Pengumpulan Data Pribadi dan menyetujui JiaJian Log mengumpulkan, memproses, serta menggunakan data kesehatan dan medis sesuai tujuan yang dijelaskan.', zh: '我已閱讀《個人資料蒐集告知事項》，並同意家健錄依所述目的蒐集、處理及利用我的健康與醫療資料。', en: 'I have read the Personal Information Collection Notice and consent to the collection, processing and use of my health and medical information for the stated purposes.' })}</span></label>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{text(error)}</p>}
        <button disabled={!checked || saving || (consentType === 'authorized_representative' && !authorizationBasis.trim())} className="w-full rounded-xl bg-indigo-700 px-4 py-3 font-bold text-white disabled:opacity-60">{saving ? text({ id: 'Menyimpan…', zh: '正在保存…', en: 'Saving' }) : text({ id: 'Setuju dan mulai menggunakan', zh: '同意並開始使用', en: 'Agree and get started' })}</button>
      </form>
    </section>
  </main>
}

/*
檔案用途：唯讀分享連結 Stage 3a 的產生／列出／撤銷管理畫面；只對有 can_share_readonly 能力的病人顯示。
所在層：src/features/care-family/components；由 SettingsPage 掛載。
主要關聯：src/lib/shareLinks.ts、supabase RPC fetch_shareable_patients／create／list／revoke_patient_share_link。
*/
import { useEffect, useState } from 'react'
import { useI18n, type LocalizedText, type Locale } from '../../../lib/i18n'
import { useConfirm } from '../../../hooks/useConfirm'
import { describeSaveError } from '../../../lib/dataErrors'
import { readLegalConsent, type ConsentType, type LegalConsent } from '../../../lib/legalConsent'
import { HealthDataConsentScreen } from './HealthDataConsentScreen'
import {
  createShareLink,
  fetchShareablePatients,
  fetchShareLinks,
  revokeShareLink,
  buildShareLinkUrl,
  SHARE_LINK_EXPIRY_OPTIONS,
  type ShareablePatient,
  type ShareLink,
  type ShareLinkExpiryHours,
} from '../../../lib/shareLinks'

// 分享是額外的資料外傳能力，同意文字要明確說明「拿到連結的人可以看」與「App 管不到截圖／轉寄」，
// 不能只用一個沒有說明的 checkbox 交差；文字目前是草稿版本（見 SHARE_CONSENT_TEXT_VERSION）。
const CONSENT_NOTICE: LocalizedText = {
  id: 'Siapa pun yang memegang tautan ini dapat melihat ringkasan tekanan darah hari ini. Aplikasi tidak dapat mencegah tangkapan layar atau penerusan tautan. Anda dapat mencabut tautan ini kapan saja.',
  zh: '任何拿到這個連結的人都可以看到今天的血壓摘要；App 無法阻止對方截圖或轉傳連結。你可以隨時撤銷這個連結。', en: "Siapa pun that memegang tautan this can view ringkasan blood pressure days this. Aplikasi cannot mencegah tangkapan layar or penerusan tautan. You can mencabut tautan this kapan saja.",
}

function expiryLabel(hours: ShareLinkExpiryHours): LocalizedText {
  if (hours === 24) return { id: '24 jam', zh: '24 小時' ,en: "24 hours" }
  if (hours === 72) return { id: '3 hari', zh: '3 天' ,en: "3 days" }
  return { id: '7 hari (maksimum)', zh: '7 天（上限）' ,en: "7 days (maksimum)" }
}

function formatExpiry(iso: string, locale: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString(locale)
}

// 目前唯一支援的兩種語言對應的 BCP-47 tag；畫面文字已經靠 useI18n 的 locale 切換，
// 由伺服器產生的日期字串也要用同一個 locale，不能讓瀏覽器／裝置語言悄悄決定顯示語言。
function dateLocaleTag(locale: Locale): string {
  return locale === 'zh' ? 'zh-TW' : locale === 'id' ? 'id-ID' : 'en-US'
}

function requiredConsentType(patient: ShareablePatient): ConsentType {
  return patient.isOwnPatient ? 'self' : 'authorized_representative'
}

type PatientLinksState = {
  loading: boolean
  links: ShareLink[]
  error: string | null
}

type CreatedLink = { linkId: string; url: string }

export type ShareLinkManagementProps = { isDemoMode: boolean }

export function ShareLinkManagement({ isDemoMode }: ShareLinkManagementProps) {
  const { text, locale } = useI18n()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [patients, setPatients] = useState<ShareablePatient[]>([])
  const [loadingPatients, setLoadingPatients] = useState(true)
  const [legalConsent, setLegalConsent] = useState<LegalConsent | null>(null)
  const [consentGateOpen, setConsentGateOpen] = useState(false)
  const [linksByPatient, setLinksByPatient] = useState<Record<string, PatientLinksState>>({})
  const [authorizationBasisByPatient, setAuthorizationBasisByPatient] = useState<Record<string, string>>({})
  const [expiryByPatient, setExpiryByPatient] = useState<Record<string, ShareLinkExpiryHours>>({})
  const [creatingPatientId, setCreatingPatientId] = useState<string | null>(null)
  const [createdLinkByPatient, setCreatedLinkByPatient] = useState<Record<string, CreatedLink>>({})
  const [message, setMessage] = useState('')

  const reloadLegalConsent = async () => setLegalConsent(await readLegalConsent())

  useEffect(() => {
    // Demo 沒有真正的 Supabase session／RLS，分享連結涉及真實 token 與資料庫寫入，不套用到 Demo 展示帳號。
    if (isDemoMode) { setLoadingPatients(false); return }
    let cancelled = false
    Promise.all([fetchShareablePatients(), readLegalConsent()])
      .then(([nextPatients, nextConsent]) => {
        if (cancelled) return
        setPatients(nextPatients)
        setLegalConsent(nextConsent)
      })
      .catch(error => {
        // 讀取失敗就整段不顯示；分享是額外能力，不能因為查詢失敗而顯示「你沒有分享對象」誤導使用者。
        console.error('[fetch shareable patients error]', error)
      })
      .finally(() => { if (!cancelled) setLoadingPatients(false) })
    return () => { cancelled = true }
  }, [isDemoMode])

  const loadLinks = async (patientId: string) => {
    setLinksByPatient(prev => ({ ...prev, [patientId]: { loading: true, links: prev[patientId]?.links ?? [], error: null } }))
    try {
      const links = await fetchShareLinks(patientId)
      setLinksByPatient(prev => ({ ...prev, [patientId]: { loading: false, links, error: null } }))
    } catch (error) {
      console.error('[fetch share links error]', error)
      setLinksByPatient(prev => ({ ...prev, [patientId]: { loading: false, links: [], error: text({ id: 'Tidak dapat memuat tautan.', zh: '無法讀取連結清單。' ,en: "Could not loading tautan." }) } }))
    }
  }

  useEffect(() => {
    for (const patient of patients) void loadLinks(patient.patientId)
    // patients 只在掛載時載入一次，這裡刻意不把 loadLinks 放進依賴陣列，避免每次 re-render 都重新拉全部清單。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patients])

  const handleCreate = async (patient: ShareablePatient) => {
    const basis = authorizationBasisByPatient[patient.patientId]?.trim() ?? ''
    if (!patient.isOwnPatient && basis.length === 0) {
      setMessage(text({ id: 'Isi dasar otorisasi Anda sebelum membuat tautan.', zh: '請先填寫代理授權依據再產生連結。' ,en: "Isi dasar otorisasi You before create tautan." }))
      return
    }
    // 分享要用的 consent_type 必須跟帳號目前的健康同意一致；不一致就導去完整的告知＋明確同意畫面，
    // 不能在這裡順手覆寫帳號同意紀錄——那需要使用者看到完整說明才能算數。
    if (legalConsent?.consent_type !== requiredConsentType(patient)) {
      setConsentGateOpen(true)
      return
    }
    if (!(await confirm(text(CONSENT_NOTICE)))) return

    setCreatingPatientId(patient.patientId)
    setMessage('')
    try {
      const expiryHours = expiryByPatient[patient.patientId] ?? 24
      const created = await createShareLink({
        patientId: patient.patientId,
        consentType: requiredConsentType(patient),
        authorizationBasis: patient.isOwnPatient ? undefined : basis,
        expiryHours,
      })
      setCreatedLinkByPatient(prev => ({ ...prev, [patient.patientId]: { linkId: created.linkId, url: buildShareLinkUrl(window.location.origin, created.token) } }))
      await loadLinks(patient.patientId)
    } catch (error) {
      console.error('[create share link error]', error)
      setMessage(text(describeSaveError(error, { id: 'Tautan tidak dapat dibuat.', zh: '無法建立分享連結。' ,en: "Tautan cannot dibuat." })))
    } finally {
      setCreatingPatientId(null)
    }
  }

  const handleRevoke = async (patientId: string, linkId: string) => {
    if (!(await confirm(text({ id: 'Cabut tautan ini? Penerima tidak akan bisa melihat ringkasan lagi.', zh: '確定撤銷這個連結嗎？對方之後將無法再看到摘要。' ,en: "Cabut tautan this? Penerima not will can view ringkasan lagi." }), { danger: true }))) return
    try {
      await revokeShareLink(linkId)
      // 剛產生、還顯示在「請立刻複製」面板裡的那個連結一旦被撤銷就不該繼續留著；
      // 否則畫面會一直提示一個其實已經失效的網址。
      setCreatedLinkByPatient(prev => {
        if (prev[patientId]?.linkId !== linkId) return prev
        const next = { ...prev }
        delete next[patientId]
        return next
      })
      await loadLinks(patientId)
    } catch (error) {
      console.error('[revoke share link error]', error)
      alert(text(describeSaveError(error, { id: 'Tidak dapat mencabut tautan.', zh: '無法撤銷連結。' ,en: "Could not mencabut tautan." })))
    }
  }

  const copyLink = async (url: string) => {
    if (!navigator.clipboard) {
      setMessage(text({ id: 'Browser tidak mendukung API clipboard.', zh: '瀏覽器不支援剪貼簿 API。' ,en: "Browser not mendukung API clipboard." }))
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setMessage(text({ id: 'Tautan disalin.', zh: '已複製連結。' ,en: "Tautan disalin." }))
    } catch {
      setMessage(text({ id: 'Tidak dapat menyalin.', zh: '無法複製連結。' ,en: "Could not menyalin." }))
    }
  }

  if (loadingPatients || patients.length === 0) return null

  return (
    <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-4">
      {confirmDialog}

      {consentGateOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-white">
          <button
            type="button"
            onClick={() => setConsentGateOpen(false)}
            className="absolute right-4 top-4 z-10 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-bold text-gray-700"
          >
            {text({ id: 'Batal', zh: '取消' ,en: "Cancel" })}
          </button>
          <HealthDataConsentScreen onAccepted={async () => { await reloadLegalConsent(); setConsentGateOpen(false) }} />
        </div>
      )}

      <h2 className="font-bold text-gray-900">{text({ id: 'Tautan Berbagi Baca-Saja', zh: '唯讀分享連結' ,en: "Tautan Berbagi Baca-Saja" })}</h2>
      <p className="mt-1 text-sm text-gray-500">{text(CONSENT_NOTICE)}</p>

      <div className="mt-4 space-y-4">
        {patients.map(patient => {
          const linksState = linksByPatient[patient.patientId]
          const activeLinks = (linksState?.links ?? []).filter(link => !link.revokedAt && new Date(link.expiresAt).getTime() > Date.now())
          const createdUrl = createdLinkByPatient[patient.patientId]
          return (
            <article key={patient.patientId} className="rounded-xl bg-gray-50 p-3 text-sm">
              <p className="font-semibold text-gray-800">{patient.displayName}</p>

              {!patient.isOwnPatient && (
                <label className="mt-2 block text-xs font-bold text-gray-700">
                  {text({ id: 'Dasar otorisasi (mis. anak, wali)', zh: '代理授權依據（例如：子女、法定代理人）' ,en: "Dasar otorisasi (mis. anak, wali)" })}
                  <input
                    type="text"
                    maxLength={200}
                    value={authorizationBasisByPatient[patient.patientId] ?? ''}
                    onChange={event => setAuthorizationBasisByPatient(prev => ({ ...prev, [patient.patientId]: event.target.value }))}
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
              )}

              <label className="mt-2 block text-xs font-bold text-gray-700">
                {text({ id: 'Masa berlaku', zh: '有效期限' ,en: "Masa berlaku" })}
                <select
                  value={expiryByPatient[patient.patientId] ?? 24}
                  onChange={event => setExpiryByPatient(prev => ({ ...prev, [patient.patientId]: Number(event.target.value) as ShareLinkExpiryHours }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                >
                  {SHARE_LINK_EXPIRY_OPTIONS.map(hours => (
                    <option key={hours} value={hours}>{text(expiryLabel(hours))}</option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                disabled={creatingPatientId === patient.patientId}
                onClick={() => void handleCreate(patient)}
                className="mt-3 w-full rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                {creatingPatientId === patient.patientId
                  ? text({ id: 'Membuat…', zh: '建立中…' ,en: "Membuat…" })
                  : text({ id: 'Buat tautan baru', zh: '產生新連結' ,en: "Buat tautan new" })}
              </button>

              {createdUrl && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                  <p className="text-xs font-bold text-amber-900">{text({ id: 'Salin sekarang — tautan ini tidak akan ditampilkan lagi.', zh: '請立刻複製——這個連結不會再顯示第二次。' ,en: "Salin now — tautan this not will shown lagi." })}</p>
                  <p className="mt-1 break-all text-xs text-gray-700">{createdUrl.url}</p>
                  <button type="button" onClick={() => void copyLink(createdUrl.url)} className="mt-2 rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-blue-700 shadow-sm">
                    {text({ id: 'Salin tautan', zh: '複製連結' ,en: "Salin tautan" })}
                  </button>
                </div>
              )}

              <div className="mt-3 border-t border-gray-200 pt-2">
                <p className="text-xs font-bold text-gray-600">{text({ id: 'Tautan aktif', zh: '目前有效的連結' ,en: "Tautan active" })}</p>
                {linksState?.loading && <p className="text-xs text-gray-400">{text({ id: 'Memuat…', zh: '載入中…' ,en: "Loading…" })}</p>}
                {linksState?.error && <p className="text-xs text-red-500">{linksState.error}</p>}
                {!linksState?.loading && !linksState?.error && activeLinks.length === 0 && (
                  <p className="text-xs text-gray-400">{text({ id: 'Belum ada tautan aktif.', zh: '目前沒有有效的連結。' ,en: "No tautan active." })}</p>
                )}
                <ul className="mt-1 space-y-1">
                  {activeLinks.map(link => (
                    <li key={link.linkId} className="flex items-center justify-between gap-2 text-xs text-gray-600">
                      <span>{text({ id: 'Berlaku hingga', zh: '有效至' ,en: "Berlaku hingga" })} {formatExpiry(link.expiresAt, dateLocaleTag(locale))}</span>
                      <button type="button" onClick={() => void handleRevoke(patient.patientId, link.linkId)} className="shrink-0 rounded-lg border border-red-200 px-2 py-0.5 font-bold text-red-600">
                        {text({ id: 'Cabut', zh: '撤銷' ,en: "Cabut" })}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          )
        })}
      </div>

      {message && <p role="status" className="mt-3 text-xs font-semibold text-gray-600">{message}</p>}
    </section>
  )
}

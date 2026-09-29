/*
檔案用途：唯讀分享連結 Stage 3a 的產生／列出／撤銷管理畫面；只對有 can_share_readonly 能力的病人顯示。
所在層：src/features/care-family/components；由 SettingsPage 掛載。
主要關聯：src/lib/shareLinks.ts、../shareConsentNotice.ts（依 scope 的同意文字）、
  supabase RPC fetch_shareable_patients／create／list／revoke_patient_share_link。
2026-09-25（#424 D／G、自評 §4 第 1、3 項）：同意文字改為依 scope 定稿版；代理同意從自由文字改成
  「關係下拉＋必勾聲明」，伺服器端 RPC 也會拒絕缺任一項的代理同意。
2026-09-25（ADR-009 T4，#938）：每位病人可選連結內容範圍（預設「兩週照護摘要（含藥單）」，仍可選「只有今日血壓」）；
  建立前的確認文字與送給 RPC 的 scope 都由同一個選擇決定，清單以標籤標示每條連結的範圍。
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
  PROXY_RELATIONSHIPS,
  SHARE_LINK_EXPIRY_OPTIONS,
  SHARE_LINK_SCOPE_VERSION,
  SHARE_SCOPE_LABELS,
  SHARE_SCOPE_VERSIONS,
  shareScopeLabel,
  type ProxyRelationship,
  type ShareablePatient,
  type ShareLink,
  type ShareLinkExpiryHours,
  type ShareScopeVersion,
} from '../../../lib/shareLinks'
import { shareConsentNotice } from '../shareConsentNotice'

// 分享是額外的資料外傳能力，同意文字要明確說明「拿到連結的人可以看」與「App 管不到截圖／轉寄」，
// 不能只用一個沒有說明的 checkbox 交差。文字一律由「這位病人目前選的 scope」挑：
// 建立的連結是哪個 scope，同意畫面就必須描述那個 scope 實際會回的內容（#424 F1、自評 R2）。
// 這裡不再有一個寫死的 CONSENT_NOTICE 常數，避免選單改了、文字卻還是預設那一段。
const scopeNotice = (scope: ShareScopeVersion): LocalizedText => shareConsentNotice(scope)

// 舊資料列可能帶本版不認得的 scope（回滾或未來版本）：shareScopeLabel 會給三語的「未知」字樣並附識別碼，不猜成任一版。
const scopeLabel = shareScopeLabel

function relationshipLabel(relationship: ProxyRelationship): LocalizedText {
  if (relationship === 'spouse') return { id: 'Pasangan', zh: '配偶', en: 'Spouse' }
  if (relationship === 'child') return { id: 'Anak', zh: '子女', en: 'Child' }
  return { id: 'Anggota keluarga lain', zh: '其他家屬', en: 'Other family member' }
}

// 勾選文字刻意講明「我不是法院指定的監護人」：成年長輩沒有監護宣告時，家屬在法律上不是法定代理人
// （自評 §2.1、風險 R1）；這一句是 owner 在 #424 D 決定「不驗證監護文件、但要揭露此限制」的落點。
// 鍵順序刻意是 id、zh、en：tests/unit/i18n.test.ts 對本檔逐條比對 en 是否誤抄印尼文，只認這個順序。
const PROXY_ATTESTATION: LocalizedText = {
  id: 'Penerima perawatan tidak dapat memberikan persetujuan sendiri karena demensia atau alasan lain; saya memutuskan atas nama mereka sebagai anggota keluarga pengasuh utama, dan saya memahami bahwa saya bukan wali yang ditunjuk pengadilan.',
  zh: '照護對象因失智或其他原因，無法自行表示同意；我以主要照顧家屬的身分代為決定，並了解我不是法院指定的監護人。',
  en: 'The care recipient cannot give consent themselves because of dementia or another reason; I am deciding on their behalf as the main family caregiver, and I understand I am not a court-appointed guardian.',
}

type ProxyConsentDraft = { relationship: ProxyRelationship | ''; incapacityAttested: boolean }

const EMPTY_PROXY_DRAFT: ProxyConsentDraft = { relationship: '', incapacityAttested: false }

function expiryLabel(hours: ShareLinkExpiryHours): LocalizedText {
  if (hours === 24) return { id: '24 jam', zh: '24 小時', en: '24 hours' }
  if (hours === 72) return { id: '3 hari', zh: '3 天', en: '3 days' }
  return { id: '7 hari (maksimum)', zh: '7 天（上限）', en: '7 days (maximum)' }
}

function formatExpiry(iso: string, locale: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString(locale)
}

// 目前支援的三種語言（zh／id／en）各自對應的 BCP-47 tag；畫面文字已經靠 useI18n 的 locale 切換，
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
  const [proxyDraftByPatient, setProxyDraftByPatient] = useState<Record<string, ProxyConsentDraft>>({})
  const [expiryByPatient, setExpiryByPatient] = useState<Record<string, ShareLinkExpiryHours>>({})
  const [scopeByPatient, setScopeByPatient] = useState<Record<string, ShareScopeVersion>>({})
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
      setLinksByPatient(prev => ({ ...prev, [patientId]: { loading: false, links: [], error: text({ id: 'Tidak dapat memuat tautan.', zh: '無法讀取連結清單。', en: 'Unable to load links.' }) } }))
    }
  }

  useEffect(() => {
    for (const patient of patients) void loadLinks(patient.patientId)
    // patients 只在掛載時載入一次，這裡刻意不把 loadLinks 放進依賴陣列，避免每次 re-render 都重新拉全部清單。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patients])

  const updateProxyDraft = (patientId: string, patch: Partial<ProxyConsentDraft>) => {
    setProxyDraftByPatient(prev => ({ ...prev, [patientId]: { ...(prev[patientId] ?? EMPTY_PROXY_DRAFT), ...patch } }))
  }

  const handleCreate = async (patient: ShareablePatient) => {
    const proxyDraft = proxyDraftByPatient[patient.patientId] ?? EMPTY_PROXY_DRAFT
    // 前端先擋是為了給清楚的提示；真正的防線在 create_patient_share_link RPC，缺任一項一樣會被拒絕。
    if (!patient.isOwnPatient && (proxyDraft.relationship === '' || !proxyDraft.incapacityAttested)) {
      setMessage(text({ id: 'Pilih hubungan Anda dengan penerima perawatan dan centang pernyataan persetujuan perwakilan sebelum membuat tautan.', zh: '請先選擇你與照護對象的關係，並勾選代理同意聲明，再產生連結。', en: 'Choose your relationship to the care recipient and tick the proxy consent statement before creating a link.' }))
      return
    }
    // 分享要用的 consent_type 必須跟帳號目前的健康同意一致；不一致就導去完整的告知＋明確同意畫面，
    // 不能在這裡順手覆寫帳號同意紀錄——那需要使用者看到完整說明才能算數。
    if (legalConsent?.consent_type !== requiredConsentType(patient)) {
      setConsentGateOpen(true)
      return
    }
    // 確認文字與送出的 scope 讀同一個變數：同意到的內容就是連結會回的內容。
    const scopeVersion = scopeByPatient[patient.patientId] ?? SHARE_LINK_SCOPE_VERSION
    if (!(await confirm(text(scopeNotice(scopeVersion))))) return

    setCreatingPatientId(patient.patientId)
    setMessage('')
    try {
      const expiryHours = expiryByPatient[patient.patientId] ?? 24
      const created = await createShareLink({
        patientId: patient.patientId,
        consentType: requiredConsentType(patient),
        proxyConsent: patient.isOwnPatient || proxyDraft.relationship === ''
          ? undefined
          : { relationship: proxyDraft.relationship, incapacityAttested: proxyDraft.incapacityAttested },
        expiryHours,
        scopeVersion,
      })
      setCreatedLinkByPatient(prev => ({ ...prev, [patient.patientId]: { linkId: created.linkId, url: buildShareLinkUrl(window.location.origin, created.token) } }))
      // 每條連結都要重新同意（/privacy 也這樣告知）：建立成功後清空關係與聲明勾選，下一條連結必須重新選、重新勾。
      setProxyDraftByPatient(prev => ({ ...prev, [patient.patientId]: EMPTY_PROXY_DRAFT }))
      await loadLinks(patient.patientId)
    } catch (error) {
      console.error('[create share link error]', error)
      setMessage(text(describeSaveError(error, { id: 'Tautan tidak dapat dibuat.', zh: '無法建立分享連結。', en: 'Unable to create share link.' })))
    } finally {
      setCreatingPatientId(null)
    }
  }

  const handleRevoke = async (patientId: string, linkId: string) => {
    if (!(await confirm(text({ id: 'Cabut tautan ini? Penerima tidak akan bisa melihat ringkasan lagi.', zh: '確定撤銷這個連結嗎？對方之後將無法再看到摘要。', en: 'Revoke this link? The recipient will no longer be able to view the summary.' }), { danger: true }))) return
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
      alert(text(describeSaveError(error, { id: 'Tidak dapat mencabut tautan.', zh: '無法撤銷連結。', en: 'Unable to revoke link.' })))
    }
  }

  const copyLink = async (url: string) => {
    if (!navigator.clipboard) {
      setMessage(text({ id: 'Browser tidak mendukung API clipboard.', zh: '瀏覽器不支援剪貼簿 API。', en: 'This browser does not support the clipboard API.' }))
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setMessage(text({ id: 'Tautan disalin.', zh: '已複製連結。', en: 'Link copied.' }))
    } catch {
      setMessage(text({ id: 'Tidak dapat menyalin.', zh: '無法複製連結。', en: 'Unable to copy link.' }))
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
            {text({ id: 'Batal', zh: '取消', en: 'Cancel' })}
          </button>
          <HealthDataConsentScreen onAccepted={async () => { await reloadLegalConsent(); setConsentGateOpen(false) }} />
        </div>
      )}

      <h2 className="font-bold text-gray-900">{text({ id: 'Tautan Berbagi Baca-Saja', zh: '唯讀分享連結', en: 'Read-only share links' })}</h2>
      {/* 完整同意文字放在每位病人的範圍選單下方（依所選 scope 切換）與建立前的確認框；這裡只說明「每條連結固定一種範圍」。 */}
      <p className="mt-1 text-sm text-gray-500">{text({ id: 'Setiap tautan memiliki satu cakupan isi yang ditetapkan saat dibuat dan tidak berubah setelahnya; teks persetujuan di bawah pilihan cakupan menjelaskan apa yang akan dilihat penerima.', zh: '每條連結在建立時固定一種內容範圍，之後不會改變；範圍選單下方的同意文字說明對方會看到什麼。', en: 'Each link has one content scope fixed when it is created and it does not change afterwards; the consent text under the scope selector explains what the recipient will see.' })}</p>

      <div className="mt-4 space-y-4">
        {patients.map(patient => {
          const linksState = linksByPatient[patient.patientId]
          const activeLinks = (linksState?.links ?? []).filter(link => !link.revokedAt && new Date(link.expiresAt).getTime() > Date.now())
          const createdUrl = createdLinkByPatient[patient.patientId]
          return (
            <article key={patient.patientId} className="rounded-xl bg-gray-50 p-3 text-sm">
              <p className="font-semibold text-gray-800">{patient.displayName}</p>

              {!patient.isOwnPatient && (
                <fieldset className="mt-2 space-y-2">
                  <legend className="text-xs font-bold text-gray-700">{text({ id: 'Persetujuan perwakilan', zh: '代理同意', en: 'Proxy consent' })}</legend>
                  {/* 自評 §4 第 4 項：本人能理解時優先讓本人同意；代理同意只是本人無法同意時的退路。 */}
                  <p className="text-xs text-gray-500">{text({ id: 'Jika penerima perawatan dapat memahami hal ini, utamakan persetujuan dari dirinya sendiri.', zh: '照護對象如果能理解這件事，請優先讓本人自己同意。', en: 'If the care recipient can understand this, ask for their own consent first.' })}</p>
                  <label className="block text-xs font-bold text-gray-700">
                    {text({ id: 'Hubungan Anda dengan penerima perawatan', zh: '你與照護對象的關係', en: 'Your relationship to the care recipient' })}
                    <select
                      required
                      value={proxyDraftByPatient[patient.patientId]?.relationship ?? ''}
                      onChange={event => updateProxyDraft(patient.patientId, { relationship: event.target.value as ProxyRelationship | '' })}
                      className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="" disabled>{text({ id: 'Pilih…', zh: '請選擇…', en: 'Choose…' })}</option>
                      {PROXY_RELATIONSHIPS.map(relationship => (
                        <option key={relationship} value={relationship}>{text(relationshipLabel(relationship))}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-start gap-2 text-xs text-gray-700">
                    <input
                      type="checkbox"
                      required
                      checked={proxyDraftByPatient[patient.patientId]?.incapacityAttested ?? false}
                      onChange={event => updateProxyDraft(patient.patientId, { incapacityAttested: event.target.checked })}
                      className="mt-0.5 h-4 w-4 shrink-0"
                    />
                    <span>{text(PROXY_ATTESTATION)}</span>
                  </label>
                </fieldset>
              )}

              <label className="mt-2 block text-xs font-bold text-gray-700">
                {text({ id: 'Isi tautan', zh: '連結內容範圍', en: 'Link contents' })}
                <select
                  value={scopeByPatient[patient.patientId] ?? SHARE_LINK_SCOPE_VERSION}
                  onChange={event => setScopeByPatient(prev => ({ ...prev, [patient.patientId]: event.target.value as ShareScopeVersion }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                >
                  {SHARE_SCOPE_VERSIONS.map(scope => (
                    <option key={scope} value={scope}>{text(SHARE_SCOPE_LABELS[scope])}</option>
                  ))}
                </select>
              </label>
              {/* §6 A：建立前的告知。跟著上面的選單即時切換，按「產生新連結」時還會再以確認框顯示同一段。 */}
              <p className="mt-1 text-xs leading-relaxed text-gray-500">{text(scopeNotice(scopeByPatient[patient.patientId] ?? SHARE_LINK_SCOPE_VERSION))}</p>

              <label className="mt-2 block text-xs font-bold text-gray-700">
                {text({ id: 'Masa berlaku', zh: '有效期限', en: 'Valid for' })}
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
                  ? text({ id: 'Membuat…', zh: '建立中…', en: 'Creating…' })
                  : text({ id: 'Buat tautan baru', zh: '產生新連結', en: 'Create new link' })}
              </button>

              {createdUrl && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                  <p className="text-xs font-bold text-amber-900">{text({ id: 'Salin sekarang — tautan ini tidak akan ditampilkan lagi.', zh: '請立刻複製——這個連結不會再顯示第二次。', en: 'Copy now — this link will not be shown again.' })}</p>
                  <p className="mt-1 break-all text-xs text-gray-700">{createdUrl.url}</p>
                  <button type="button" onClick={() => void copyLink(createdUrl.url)} className="mt-2 rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-blue-700 shadow-sm">
                    {text({ id: 'Salin tautan', zh: '複製連結', en: 'Copy link' })}
                  </button>
                </div>
              )}

              <div className="mt-3 border-t border-gray-200 pt-2">
                <p className="text-xs font-bold text-gray-600">{text({ id: 'Tautan aktif', zh: '目前有效的連結', en: 'Active links' })}</p>
                {linksState?.loading && <p className="text-xs text-gray-400">{text({ id: 'Memuat…', zh: '載入中…', en: 'Loading…' })}</p>}
                {linksState?.error && <p className="text-xs text-red-500">{linksState.error}</p>}
                {!linksState?.loading && !linksState?.error && activeLinks.length === 0 && (
                  <p className="text-xs text-gray-400">{text({ id: 'Belum ada tautan aktif.', zh: '目前沒有有效的連結。', en: 'No active links.' })}</p>
                )}
                <ul className="mt-1 space-y-1">
                  {activeLinks.map(link => (
                    <li key={link.linkId} className="flex items-center justify-between gap-2 text-xs text-gray-600">
                      <span>
                        {/* 標示範圍：含藥單的連結被轉傳時損失量級不同，撤銷前要能一眼分辨（設計 §5）。 */}
                        <span className="mr-1 rounded-md bg-gray-200 px-1.5 py-0.5 font-bold text-gray-700">{text(scopeLabel(link.scopeVersion))}</span>
                        {text({ id: 'Berlaku hingga', zh: '有效至', en: 'Valid until' })} {formatExpiry(link.expiresAt, dateLocaleTag(locale))}
                      </span>
                      <button type="button" onClick={() => void handleRevoke(patient.patientId, link.linkId)} className="shrink-0 rounded-lg border border-red-200 px-2 py-0.5 font-bold text-red-600">
                        {text({ id: 'Cabut', zh: '撤銷', en: 'Revoke' })}
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

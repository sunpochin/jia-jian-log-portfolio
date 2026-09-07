/*
檔案用途：管理家庭成員邀請、權限檢視與成員移除介面。
所在層：src/components；為設定頁面內的子元件。
主要關聯：由 SettingsPage 載入，透由 Supabase RPC 操作成員存取權。
*/
import { useEffect, useState } from 'react'
import { useI18n } from '../../../lib/i18n'
import { describeSaveError } from '../../../lib/dataErrors'
import { useConfirm } from '../../../hooks/useConfirm'
import {
  fetchHouseholdMembers,
  addHouseholdMember,
  removeHouseholdMember,
  fetchHouseholdManagementPatients,
  fetchHouseholdPatientAccess,
  setHouseholdPatientAccess,
  type HouseholdMemberInfo,
  type HouseholdRole,
  type ManagedPatient,
  type PatientAccessGrant,
} from '../../../lib/tenant'

export function HouseholdMemberManagement() {
  const { text } = useI18n()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [members, setMembers] = useState<HouseholdMemberInfo[]>([])
  const [patients, setPatients] = useState<ManagedPatient[]>([])
  const [grants, setGrants] = useState<PatientAccessGrant[]>([])
  const [loading, setLoading] = useState(true)
  const [isOwner, setIsOwner] = useState<boolean | null>(null)
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState<HouseholdRole>('caregiver')
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const reload = async () => {
    setLoading(true)
    try {
      const [nextMembers, nextPatients, nextGrants] = await Promise.all([
        fetchHouseholdMembers(),
        fetchHouseholdManagementPatients(),
        fetchHouseholdPatientAccess(),
      ])
      setMembers(nextMembers)
      setPatients(nextPatients)
      setGrants(nextGrants)
      setIsOwner(true)
    } catch (error) {
      // 只有 owner 能載入完整 email 與授權矩陣；失敗時直接隱藏，不能讓 UI 假裝任何家庭成員都能管理。
      console.error('[household management authorization error]', error)
      setIsOwner(false)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void reload() }, [])

  const handleAddMember = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!newEmail.trim()) return
    setStatus('saving')
    setMessage('')
    try {
      await addHouseholdMember(newEmail, newRole)
      setNewEmail('')
      await reload()
      setMessage(text({ id: 'Anggota ditambahkan. Pilih izin pasien mereka di bawah.', zh: '已新增成員；請在下方選擇可照護的病人。' ,en: 'Member added; please select a patient to care for below.' }))
      setStatus('idle')
    } catch (error) {
      // 錯誤原文只進 console；畫面一律走共用的雙語判斷，避免把 RPC 原始英文訊息直接顯示給看護。
      console.error('[add household member error]', error)
      setMessage(text(describeSaveError(error, { id: 'Gagal menambah anggota.', zh: '無法新增家庭成員。' ,en: 'Unable to add family member.' })))
      setStatus('error')
    }
  }

  const handleRemoveMember = async (userId: string, memberEmail: string) => {
    const confirmMessage = text({ id: `Hapus ${memberEmail} dari keluarga?`, zh: `確定要把 ${memberEmail} 從家庭成員中移除嗎？` ,en: `Remove ${memberEmail} from the family?` })
    if (!(await confirm(confirmMessage))) return
    try {
      await removeHouseholdMember(userId)
      await reload()
      setMessage(text({ id: 'Anggota berhasil dihapus.', zh: '已成功移除家庭成員。' ,en: 'Family member successfully removed.' }))
    } catch (error) {
      console.error('[remove household member error]', error)
      alert(text(describeSaveError(error, { id: 'Gagal menghapus anggota.', zh: '無法移除家庭成員。' ,en: 'Unable to remove family member.' })))
    }
  }

  const grantFor = (email: string, patientId: string) => grants.find(grant => grant.profile_email.toLowerCase() === email.toLowerCase() && grant.patient_id === patientId)

  const updateAccess = async (email: string, patientId: string, canRecord: boolean, canManageMedication: boolean) => {
    try {
      // 修改能力前由後端再驗一次 owner、家庭與病人歸屬，因為 checkbox 不能當作安全邊界。
      await setHouseholdPatientAccess(email, patientId, canRecord, canManageMedication)
      await reload()
    } catch (error) {
      console.error('[set patient access error]', error)
      alert(text(describeSaveError(error, { id: 'Izin tidak dapat diubah.', zh: '無法變更授權。' ,en: 'Unable to change license.' })))
      await reload()
    }
  }

  if (loading || isOwner === false) return null

  return (
    <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-4">
      {confirmDialog}
      <h2 className="font-bold text-gray-900">{text({ id: 'Anggota & Izin Perawatan', zh: '家庭成員與照護授權' ,en: 'Family Members and Care Authorization' })}</h2>
      <p className="mt-1 text-sm text-gray-500">
        {text({ id: 'Keanggotaan keluarga tidak otomatis memberi akses data. Atur izin per pasien.', zh: '加入家庭不會自動看到資料；請逐一設定每位病人的授權。' ,en: 'Joining a family does not automatically see the data; please set the authorization for each patient individually.' })}
      </p>

      <div className="mt-4 space-y-3">
        {members.map(member => (
          <article key={member.user_id} className="rounded-xl bg-gray-50 p-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="block font-semibold text-gray-800">{member.email}</span>
                <span className="text-xs text-gray-400">
                  {member.role === 'owner'
                    ? text({ id: 'Pemilik', zh: '建立者' ,en: 'Developer' })
                    : member.role === 'caregiver'
                      ? text({ id: 'Pengasuh', zh: '看護' ,en: 'Pengasuh' })
                      : text({ id: 'Pengamat', zh: '檢視者' ,en: 'Viewer' })}
                </span>
              </div>
              {member.role !== 'owner' && (
                <button type="button" onClick={() => void handleRemoveMember(member.user_id, member.email)} className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-bold text-red-600 active:bg-red-50">
                  {text({ id: 'Hapus', zh: '移除' ,en: 'Delete' })}
                </button>
              )}
            </div>

            <div className="mt-3 space-y-2 border-t border-gray-200 pt-3">
              {patients.map(patient => {
                const grant = grantFor(member.email, patient.patient_id)
                const canView = Boolean(grant)
                return (
                  <div key={patient.patient_id} className="rounded-lg border border-gray-200 bg-white p-2.5">
                    <p className="font-semibold text-gray-700">{patient.display_name}</p>
                    <label className="mt-2 flex items-center gap-2 text-xs text-gray-700">
                      <input type="checkbox" checked={canView} onChange={event => void updateAccess(member.email, patient.patient_id, event.target.checked ? grant?.can_record ?? false : false, event.target.checked ? grant?.can_manage_medication ?? false : false)} />
                      {text({ id: 'Lihat data', zh: '可查看資料' ,en: 'Data viewable' })}
                    </label>
                    <label className="mt-2 flex items-center gap-2 text-xs text-gray-700">
                      <input type="checkbox" disabled={!canView} checked={grant?.can_record ?? false} onChange={event => void updateAccess(member.email, patient.patient_id, event.target.checked, grant?.can_manage_medication ?? false)} />
                      {text({ id: 'Catat tekanan darah, suhu & obat', zh: '可填血壓、體溫與服藥紀錄' ,en: 'Fillable Blood Pressure, Temperature, and Medication Records' })}
                    </label>
                    <label className="mt-2 flex items-center gap-2 text-xs text-gray-700">
                      <input type="checkbox" disabled={!canView} checked={grant?.can_manage_medication ?? false} onChange={event => void updateAccess(member.email, patient.patient_id, grant?.can_record ?? false, event.target.checked)} />
                      {text({ id: 'Ubah rencana obat', zh: '可調整藥單' ,en: 'Adjustable menu' })}
                    </label>
                  </div>
                )
              })}
            </div>
          </article>
        ))}
      </div>

      <form onSubmit={handleAddMember} className="mt-4 space-y-3 border-t border-gray-100 pt-3">
        <label className="block text-xs font-bold text-gray-700">
          {text({ id: 'Email Google anggota baru', zh: '新增成員 Google Email' ,en: 'Add member Google Email' })}
          <input type="email" required value={newEmail} onChange={event => setNewEmail(event.target.value)} placeholder="contoh@gmail.com" className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
        </label>
        <div className="flex gap-2">
          <select value={newRole} onChange={event => setNewRole(event.target.value as HouseholdRole)} className="rounded-xl border border-gray-300 px-3 py-2 text-sm">
            <option value="caregiver">{text({ id: 'Pengasuh', zh: '看護' ,en: 'Pengasuh' })}</option>
            <option value="viewer">{text({ id: 'Pengamat', zh: '檢視者' ,en: 'Viewer' })}</option>
            <option value="owner">{text({ id: 'Pemilik bersama', zh: '共同管理者' ,en: 'Co-administrator' })}</option>
          </select>
          <button type="submit" disabled={status === 'saving'} className="flex-1 rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-60">
            {text({ id: 'Tambah anggota', zh: '新增成員' ,en: 'Add Members' })}
          </button>
        </div>
        {message && <p role="status" className="text-xs font-semibold text-gray-600">{message}</p>}
      </form>
    </section>
  )
}

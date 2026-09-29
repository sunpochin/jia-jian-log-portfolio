/*
檔案用途：/admin「藥品目錄」分頁的畫面——列出使用者建立的共用藥品，提供核對通過／取消核對、
         改身分、合併到另一筆藥品三個目錄管理員（curator）專用動作。
所在層：src/features/system-admin/components；只由 AdminPage.tsx 的「藥品目錄」分頁呼叫。
主要關聯：useMedicationCatalogCuration（狀態與動作）、docs/product/shared-medication-catalog.md §4.6。
範圍說明：文件 §4.6 的「採用某位病人的覆蓋外觀為共用」動作依賴單位 D（病人層外觀覆蓋，issue #759）
         的資料表，本次單位 E 合併時單位 D 尚未完成，這裡刻意不做那個動作；「是否有病人層覆蓋」欄位
         同理留待單位 D 完成後再補。
*/
import { useEffect, useState } from 'react'
import type { LocalizedText } from '../../../lib/i18n'
import { useI18n } from '../../../lib/i18n'
import type { CuratableMedicationRow, EditMedicationIdentityInput } from '../../../lib/medicationCatalogCuration'
import { useMedicationCatalogCuration } from '../hooks/useMedicationCatalogCuration'

const VERIFICATION_LABELS: Record<CuratableMedicationRow['verificationStatus'], LocalizedText> = {
  official: { id: 'Data resmi', zh: '官方資料', en: 'Official data' },
  manually_verified: { id: 'Sudah diperiksa', zh: '已核對', en: 'Verified' },
  unverified: { id: 'Belum diperiksa', zh: '未核對', en: 'Unverified' },
}

const PRODUCT_KIND_LABEL: Record<CuratableMedicationRow['productKind'], LocalizedText> = {
  drug: { id: 'Obat', zh: '藥品', en: 'Medication' },
  supplement: { id: 'Suplemen', zh: '營養品', en: 'Supplement' },
}

type EditFormState = {
  brandName: string
  brandNameZh: string
  genericName: string
  dosageForm: string
  productKind: 'drug' | 'supplement'
  strengthMg: string
  strengthLabel: string
}

function toEditFormState(row: CuratableMedicationRow): EditFormState {
  return {
    brandName: row.brandName,
    brandNameZh: row.brandNameZh ?? '',
    genericName: row.genericName,
    dosageForm: row.dosageForm,
    productKind: row.productKind,
    strengthMg: row.strengthMg != null ? String(row.strengthMg) : '',
    strengthLabel: row.strengthLabel ?? '',
  }
}

export function MedicationCatalogCurationPanel() {
  const { text } = useI18n()
  const { rows, hasMore, loading, loadingMore, loadError, fetchRows, loadOnce, loadMore, actionSaving, actionErrors, verify, unverify, editIdentity, merge } = useMedicationCatalogCuration()
  const [reasonByRow, setReasonByRow] = useState<Record<string, string>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditFormState | null>(null)
  const [mergingId, setMergingId] = useState<string | null>(null)
  const [mergeTargetByRow, setMergeTargetByRow] = useState<Record<string, string>>({})

  // 這個分頁元件只在切到「藥品目錄」tab 才會掛載（見 AdminPage.tsx），掛載時載入一次即可；
  // loadOnce 內部以 ref 防重複呼叫，即使因為 hook 每次重渲染都拿到新的函式參考也不會重複打 RPC。
  useEffect(() => {
    loadOnce()
  }, [loadOnce])

  const reasonFor = (id: string) => (reasonByRow[id] ?? '').trim()
  const setReason = (id: string, value: string) => setReasonByRow(current => ({ ...current, [id]: value }))

  const startEdit = (row: CuratableMedicationRow) => {
    setEditingId(row.id)
    setMergingId(null)
    setEditForm(toEditFormState(row))
  }

  const submitEdit = async (row: CuratableMedicationRow) => {
    if (!editForm) return
    const input: EditMedicationIdentityInput = {
      brandName: editForm.brandName.trim(),
      brandNameZh: editForm.brandNameZh.trim(),
      genericName: editForm.genericName.trim(),
      dosageForm: editForm.dosageForm.trim(),
      productKind: editForm.productKind,
      strengthMg: editForm.productKind === 'supplement' ? null : (Number(editForm.strengthMg) || null),
      strengthLabel: editForm.strengthLabel.trim(),
    }
    // 只有動作真的成功才收合表單；失敗時（驗證錯誤、權限、網路）保留 curator 已填的內容，
    // 錯誤訊息顯示在卡片下方，不用逼他們重打一次整份表單（PR #797 review）。
    const succeeded = await editIdentity(row.id, input, reasonFor(row.id))
    if (succeeded) {
      setEditingId(null)
      setEditForm(null)
    }
  }

  const submitMerge = async (row: CuratableMedicationRow) => {
    const target = (mergeTargetByRow[row.id] ?? '').trim()
    if (!target) return
    const succeeded = await merge(row.id, target, reasonFor(row.id))
    if (succeeded) setMergingId(null)
  }

  return (
    <div>
      <p className="mb-3 rounded bg-amber-50 p-3 text-sm text-amber-900">
        {text({
          id: 'Hanya berisi obat/suplemen yang ditambahkan pengguna dan belum digabungkan. Setiap tindakan memerlukan alasan dan dicatat di riwayat audit.',
          zh: '只列出使用者建立、尚未被合併的共用藥品／營養品；每個動作都需要填寫原因，並會留下稽核紀錄。',
          en: 'Lists only user-added medications/supplements that have not been merged away. Every action requires a reason and is recorded in the audit log.',
        })}
      </p>

      {loading && <p className="text-sm text-gray-500">{text({ id: 'Memuat…', zh: '載入中…', en: 'Loading…' })}</p>}
      {loadError && (
        <div className="rounded bg-red-50 p-3">
          <p className="text-sm text-red-500">{text(loadError)}</p>
          <button onClick={fetchRows} className="mt-2 px-3 py-1.5 bg-red-600 text-white hover:bg-red-700 rounded-lg text-sm font-semibold transition cursor-pointer">
            {text({ id: 'Coba lagi', zh: '重試', en: 'Try again' })}
          </button>
        </div>
      )}

      {!loading && !loadError && rows.length === 0 && (
        <p className="text-sm text-gray-500">{text({ id: 'Belum ada data.', zh: '目前沒有任何資料。', en: 'No data yet.' })}</p>
      )}

      <div className="space-y-2">
        {rows.map(row => {
          const saving = actionSaving[row.id] === true
          const error = actionErrors[row.id]
          const isEditing = editingId === row.id && editForm
          const isMerging = mergingId === row.id
          return (
            <div key={row.id} className="rounded-lg border border-gray-250 bg-white p-3 shadow-sm">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-semibold text-gray-900">{row.brandName}</span>
                {row.brandNameZh && <span className="text-sm text-gray-600">{row.brandNameZh}</span>}
                <span className="text-xs text-gray-500">{row.genericName}</span>
              </div>
              <div className="mt-1 text-xs text-gray-600">
                {row.strengthLabel ?? (row.strengthMg != null ? `${row.strengthMg} mg` : '—')} · {row.dosageForm}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">{text(PRODUCT_KIND_LABEL[row.productKind])}</span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">{text(VERIFICATION_LABELS[row.verificationStatus])}</span>
                {row.sharedWithOthers === true && (
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800">
                    {text({ id: 'Dipakai keluarga lain', zh: '其他家庭也在用', en: 'Used by other families' })}
                  </span>
                )}
              </div>

              {!isEditing && !isMerging && (
                <div className="mt-2 border-t border-gray-100 pt-2">
                  <label className="flex items-center gap-1.5 text-xs text-gray-700 mb-1.5">
                    <span>{text({ id: 'Alasan', zh: '原因', en: 'Reason' })}：</span>
                    <input
                      type="text"
                      value={reasonByRow[row.id] ?? ''}
                      onChange={e => setReason(row.id, e.target.value)}
                      placeholder={text({ id: 'Wajib diisi untuk setiap tindakan', zh: '每個動作都必填', en: 'Required for every action' })}
                      className="flex-1 rounded border border-gray-250 px-1.5 py-0.5 text-xs"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {row.verificationStatus !== 'manually_verified' ? (
                      <button
                        disabled={saving || !reasonFor(row.id)}
                        onClick={() => verify(row.id, reasonFor(row.id))}
                        className="px-2.5 py-1 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 rounded text-xs font-semibold transition cursor-pointer"
                      >
                        {text({ id: 'Tandai sudah diperiksa', zh: '核對通過', en: 'Mark as verified' })}
                      </button>
                    ) : (
                      <button
                        disabled={saving || !reasonFor(row.id)}
                        onClick={() => unverify(row.id, reasonFor(row.id))}
                        className="px-2.5 py-1 bg-gray-200 text-gray-800 hover:bg-gray-300 disabled:opacity-50 rounded text-xs font-semibold transition cursor-pointer"
                      >
                        {text({ id: 'Batalkan status diperiksa', zh: '取消核對', en: 'Unmark as verified' })}
                      </button>
                    )}
                    <button
                      disabled={saving}
                      onClick={() => startEdit(row)}
                      className="px-2.5 py-1 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 rounded text-xs font-semibold transition cursor-pointer"
                    >
                      {text({ id: 'Ubah identitas', zh: '改身分', en: 'Edit identity' })}
                    </button>
                    <button
                      disabled={saving}
                      onClick={() => { setMergingId(row.id); setEditingId(null) }}
                      className="px-2.5 py-1 bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 rounded text-xs font-semibold transition cursor-pointer"
                    >
                      {text({ id: 'Gabungkan ke…', zh: '合併到…', en: 'Merge into…' })}
                    </button>
                    {saving && <span className="self-center text-xs text-gray-400">{text({ id: 'Menyimpan…', zh: '儲存中…', en: 'Saving…' })}</span>}
                  </div>
                </div>
              )}

              {isEditing && editForm && (
                <div className="mt-2 border-t border-gray-100 pt-2 space-y-1.5">
                  <input value={editForm.brandName} onChange={e => setEditForm({ ...editForm, brandName: e.target.value })} placeholder={text({ id: 'Nama merek', zh: '品名', en: 'Brand name' })} className="w-full rounded border border-gray-250 px-1.5 py-1 text-xs" />
                  <input value={editForm.brandNameZh} onChange={e => setEditForm({ ...editForm, brandNameZh: e.target.value })} placeholder={text({ id: 'Nama merek (Mandarin)', zh: '中文品名', en: 'Brand name (Chinese)' })} className="w-full rounded border border-gray-250 px-1.5 py-1 text-xs" />
                  <input value={editForm.genericName} onChange={e => setEditForm({ ...editForm, genericName: e.target.value })} placeholder={text({ id: 'Nama generik', zh: '學名', en: 'Generic name' })} className="w-full rounded border border-gray-250 px-1.5 py-1 text-xs" />
                  <input value={editForm.dosageForm} onChange={e => setEditForm({ ...editForm, dosageForm: e.target.value })} placeholder={text({ id: 'Bentuk sediaan', zh: '劑型', en: 'Dosage form' })} className="w-full rounded border border-gray-250 px-1.5 py-1 text-xs" />
                  <label className="flex items-center gap-1.5 text-xs text-gray-700">
                    <span>{text({ id: 'Jenis', zh: '種類', en: 'Type' })}：</span>
                    <select value={editForm.productKind} onChange={e => setEditForm({ ...editForm, productKind: e.target.value as 'drug' | 'supplement' })} className="rounded border border-gray-250 px-1.5 py-0.5 text-xs">
                      <option value="drug">{text(PRODUCT_KIND_LABEL.drug)}</option>
                      <option value="supplement">{text(PRODUCT_KIND_LABEL.supplement)}</option>
                    </select>
                  </label>
                  {editForm.productKind === 'supplement' ? (
                    <input value={editForm.strengthLabel} onChange={e => setEditForm({ ...editForm, strengthLabel: e.target.value })} placeholder={text({ id: 'Dosis pada kemasan', zh: '包裝上的劑量', en: 'Strength as printed on the package' })} className="w-full rounded border border-gray-250 px-1.5 py-1 text-xs" />
                  ) : (
                    <input value={editForm.strengthMg} onChange={e => setEditForm({ ...editForm, strengthMg: e.target.value })} placeholder="mg" inputMode="decimal" className="w-full rounded border border-gray-250 px-1.5 py-1 text-xs" />
                  )}
                  <label className="flex items-center gap-1.5 text-xs text-gray-700">
                    <span>{text({ id: 'Alasan', zh: '原因', en: 'Reason' })}：</span>
                    <input type="text" value={reasonByRow[row.id] ?? ''} onChange={e => setReason(row.id, e.target.value)} className="flex-1 rounded border border-gray-250 px-1.5 py-0.5 text-xs" />
                  </label>
                  <div className="flex gap-2">
                    <button disabled={saving || !reasonFor(row.id)} onClick={() => submitEdit(row)} className="px-2.5 py-1 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 rounded text-xs font-semibold transition cursor-pointer">
                      {text({ id: 'Simpan', zh: '儲存', en: 'Save' })}
                    </button>
                    <button disabled={saving} onClick={() => { setEditingId(null); setEditForm(null) }} className="px-2.5 py-1 bg-gray-200 text-gray-800 hover:bg-gray-300 rounded text-xs font-semibold transition cursor-pointer">
                      {text({ id: 'Batal', zh: '取消', en: 'Cancel' })}
                    </button>
                  </div>
                </div>
              )}

              {isMerging && (
                <div className="mt-2 border-t border-gray-100 pt-2 space-y-1.5">
                  <input
                    value={mergeTargetByRow[row.id] ?? ''}
                    onChange={e => setMergeTargetByRow(current => ({ ...current, [row.id]: e.target.value }))}
                    placeholder={text({ id: 'ID obat tujuan (canonical)', zh: '目標藥品 ID（保留下來的那一筆）', en: 'Target medication ID (the one to keep)' })}
                    className="w-full rounded border border-gray-250 px-1.5 py-1 text-xs"
                  />
                  <label className="flex items-center gap-1.5 text-xs text-gray-700">
                    <span>{text({ id: 'Alasan', zh: '原因', en: 'Reason' })}：</span>
                    <input type="text" value={reasonByRow[row.id] ?? ''} onChange={e => setReason(row.id, e.target.value)} className="flex-1 rounded border border-gray-250 px-1.5 py-0.5 text-xs" />
                  </label>
                  <div className="flex gap-2">
                    <button disabled={saving || !reasonFor(row.id) || !(mergeTargetByRow[row.id] ?? '').trim()} onClick={() => submitMerge(row)} className="px-2.5 py-1 bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 rounded text-xs font-semibold transition cursor-pointer">
                      {text({ id: 'Gabungkan', zh: '合併', en: 'Merge' })}
                    </button>
                    <button disabled={saving} onClick={() => setMergingId(null)} className="px-2.5 py-1 bg-gray-200 text-gray-800 hover:bg-gray-300 rounded text-xs font-semibold transition cursor-pointer">
                      {text({ id: 'Batal', zh: '取消', en: 'Cancel' })}
                    </button>
                  </div>
                </div>
              )}

              {error && <p className="mt-1.5 text-xs text-red-600">{text(error)}</p>}
            </div>
          )
        })}
      </div>

      {hasMore && (
        <div className="mt-3 flex justify-center">
          <button
            disabled={loadingMore}
            onClick={loadMore}
            className="px-3 py-1.5 bg-gray-200 text-gray-800 hover:bg-gray-300 disabled:opacity-50 rounded-lg text-sm font-semibold transition cursor-pointer"
          >
            {text(loadingMore ? { id: 'Memuat…', zh: '載入中…', en: 'Loading…' } : { id: 'Muat lebih banyak', zh: '載入更多', en: 'Load more' })}
          </button>
        </div>
      )}
    </div>
  )
}

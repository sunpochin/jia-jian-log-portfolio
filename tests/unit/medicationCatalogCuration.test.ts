/*
檔案用途：驗證共用藥品目錄管理員資料層（src/lib/medicationCatalogCuration.ts）組出的 RPC 參數形狀，
         以及 client 端的必填原因防呆。
所在層：tests/unit；只使用 Supabase client mock，不連線真正的 Supabase。
主要關聯：src/lib/medicationCatalogCuration.ts、supabase/migrations/20260915120000_add_medication_catalog_curator_rpcs.sql。
*/
import { beforeEach, describe, expect, mock, test } from 'bun:test'

let rpcCalls: Array<{ fn: string; args: unknown }> = []
let rpcResult: { data: unknown; error: unknown } = { data: null, error: null }
const supabase = {
  rpc: (fn: string, args: unknown) => {
    rpcCalls.push({ fn, args })
    return Promise.resolve(rpcResult)
  },
  from: () => {
    throw new Error('not used in this test file')
  },
}

mock.module('../../src/lib/supabase', () => ({ supabase }))

const { editMedicationIdentity, listMedicationCatalogChanges, mergeMedications, unverifyMedication, verifyMedication } = await import('../../src/lib/medicationCatalogCuration')

beforeEach(() => {
  rpcCalls = []
  rpcResult = { data: null, error: null }
})

describe('verifyMedication / unverifyMedication', () => {
  test('verify 呼叫 curate_medication_catalog 並帶上動作、id、空 payload 與原因', async () => {
    await verifyMedication('med-1', '看過藥袋照片')
    expect(rpcCalls).toEqual([{ fn: 'curate_medication_catalog', args: { p_action: 'verify', p_medication_id: 'med-1', p_payload: {}, p_reason: '看過藥袋照片' } }])
  })

  test('unverify 呼叫同一支 RPC，動作換成 unverify', async () => {
    await unverifyMedication('med-1', '核對後發現有誤')
    expect(rpcCalls[0]).toMatchObject({ fn: 'curate_medication_catalog', args: { p_action: 'unverify' } })
  })

  test('原因是空白字串時，client 端就擋下，不送出 RPC', async () => {
    await expect(verifyMedication('med-1', '   ')).rejects.toThrow('A reason is required')
    expect(rpcCalls).toHaveLength(0)
  })

  test('RPC 回傳錯誤時原樣拋出', async () => {
    rpcResult = { data: null, error: new Error('rpc failed') }
    await expect(verifyMedication('med-1', '原因')).rejects.toThrow('rpc failed')
  })
})

describe('editMedicationIdentity', () => {
  test('營養品：strength_mg 一律送 null，即使呼叫端傳了數字', async () => {
    await editMedicationIdentity('med-2', {
      brandName: 'Formula AREDS 2', brandNameZh: '', genericName: 'lutein', dosageForm: 'capsule',
      productKind: 'supplement', strengthMg: 999, strengthLabel: '800 IU',
    }, '改成營養品')
    expect(rpcCalls[0].args).toMatchObject({
      p_action: 'edit_identity',
      p_payload: { product_kind: 'supplement', strength_mg: null, strength_label: '800 IU' },
    })
  })

  test('藥品：strength_mg 照送，strength_label 照送（可能是複方標示）', async () => {
    await editMedicationIdentity('med-3', {
      brandName: 'Aspirin', brandNameZh: '', genericName: 'aspirin', dosageForm: 'tablet',
      productKind: 'drug', strengthMg: 100, strengthLabel: '',
    }, '修正劑量')
    expect(rpcCalls[0].args).toMatchObject({ p_action: 'edit_identity', p_payload: { product_kind: 'drug', strength_mg: 100 } })
  })
})

describe('mergeMedications', () => {
  test('組出 target_medication_id payload，並解析回傳的合併結果', async () => {
    rpcResult = { data: { merged_into_medication_id: 'med-canonical', reassigned_plan_count: 3 }, error: null }
    const result = await mergeMedications('med-dup', 'med-canonical', '重複的營養品')
    expect(rpcCalls[0].args).toMatchObject({ p_action: 'merge', p_medication_id: 'med-dup', p_payload: { target_medication_id: 'med-canonical' } })
    expect(result).toEqual({ mergedIntoMedicationId: 'med-canonical', reassignedPlanCount: 3 })
  })

  test('回傳形狀不符時退回安全預設值，不讓畫面因未定義欄位而壞掉', async () => {
    rpcResult = { data: {}, error: null }
    const result = await mergeMedications('med-dup', 'med-canonical', '原因')
    expect(result).toEqual({ mergedIntoMedicationId: 'med-canonical', reassignedPlanCount: 0 })
  })
})

describe('listMedicationCatalogChanges', () => {
  test('把 snake_case 欄位轉成 camelCase', async () => {
    rpcResult = {
      data: [{
        id: 'log-1', medication_id: 'med-1', action: 'verify', actor_email: 'curator@example.com',
        reason: '看過藥袋照片', recorded_at: '2026-09-15T00:00:00Z', before_snapshot: null, after_snapshot: { verification_status: 'manually_verified' },
      }],
      error: null,
    }
    const rows = await listMedicationCatalogChanges('med-1', 10)
    expect(rows).toEqual([{
      id: 'log-1', medicationId: 'med-1', action: 'verify', actorEmail: 'curator@example.com',
      reason: '看過藥袋照片', recordedAt: '2026-09-15T00:00:00Z', beforeSnapshot: null, afterSnapshot: { verification_status: 'manually_verified' },
    }])
    expect(rpcCalls[0]).toEqual({ fn: 'list_medication_catalog_changes', args: { p_medication_id: 'med-1', p_limit: 10 } })
  })
})

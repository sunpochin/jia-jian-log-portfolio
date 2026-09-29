/*
檔案用途：驗證健保健康存摺欄位對照表移植後的內容與原始 HealthWorkbench 版本一致。
所在層：tests/unit；保護 src/lib/adapters/nhi/fieldmap.ts 不被無意間改動欄位代碼或中文名稱。
主要關聯：src/lib/adapters/nhi/fieldmap.ts；docs/product/nhi-health-passbook-integration.md §7.1。
*/
import { describe, expect, test } from 'bun:test'
import { SECTIONS, R1, R1_1, R3, R3_1, R6, R7, R8, R9, R10, R11, R11_1 } from '../../src/lib/adapters/nhi/fieldmap'

describe('nhi/fieldmap', () => {
  test('SECTIONS 涵蓋 r1–r14 並使用官方節區中文名稱', () => {
    expect(SECTIONS.r1).toBe('西醫門診資料')
    expect(SECTIONS.r7).toBe('檢驗檢查結果')
    expect(SECTIONS.r8).toBe('影像或病理檢查資料')
    expect(Object.keys(SECTIONS)).toHaveLength(14)
  })

  test('R1 保留主診斷、部分負擔與健保支付點數欄位', () => {
    expect(R1['r1.8']).toBe('主診斷碼')
    expect(R1['r1.9']).toBe('主診斷名稱')
    expect(R1['r1.12']).toBe('部分負擔金額')
    expect(R1['r1.13']).toBe('健保支付點數')
  })

  test('R1_1／R3_1 是巢狀醫囑欄位，含醫囑代碼與給藥日數', () => {
    expect(R1_1['r1_1.1']).toBe('醫囑代碼')
    expect(R1_1['r1_1.4']).toBe('給藥日數')
    expect(R3_1['r3_1.4']).toBe('牙位代碼')
    expect(R3_1['r3_1.6']).toBe('給藥日數')
  })

  test('R7 檢驗結果欄位含結果值與參考值', () => {
    expect(R7['r7.11']).toBe('結果值')
    expect(R7['r7.12']).toBe('參考值')
  })

  test('R8 影像病理報告欄位是 r8.10（自由文字，含未跳脫控制字元風險）', () => {
    expect(R8['r8.10']).toBe('影像或病理報告')
  })

  test('R10 成人預防保健涵蓋身高體重與 BMI', () => {
    expect(R10['r10.6']).toBe('身高cm')
    expect(R10['r10.7']).toBe('體重kg')
    expect(R10['r10.8']).toBe('BMI')
  })

  test('R11／R11_1 癌症篩檢的篩檢類別與檢查結果欄位存在', () => {
    expect(R11['r11.1']).toBe('篩檢類別')
    expect(R11_1['r11_1.3']).toBe('檢查結果')
  })

  test('R3／R6／R9 至少有一個代表性欄位可對照', () => {
    expect(R3['r3.7']).toBe('疾病分類碼')
    expect(R6['r6.3']).toBe('疫苗中文名稱')
    expect(R9['r9.10']).toBe('處置名稱')
  })
})

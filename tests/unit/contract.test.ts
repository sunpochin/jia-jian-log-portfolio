import { describe, it, expect } from 'bun:test'
import { getAlertLevel } from '../../src/types/database'
import contractTests from '../bp-contract-tests.json'

describe('getAlertLevel Contract Tests', () => {
  // 將測試案例從單一 it 區塊拆分為動態生成的獨立 it 區塊，
  // 這樣做是為了避免當其中一個合約測試案例失敗時，
  // 整個測試區塊立刻中斷，導致後面其他案例無法執行。
  // 同時，獨立的 it 區塊能讓測試報告清楚呈現具體是哪一組輸入數值（sys/dia/pul）發生不符合預期的錯誤，
  // 大幅降低排查回歸（regression）問題時的除錯時間。
  contractTests.forEach((tc, index) => {
    it(`Case ${index + 1}: sys=${tc.sys}, dia=${tc.dia}, pul=${tc.pul} -> ${tc.expected.webAlertLevel}`, () => {
      const level = getAlertLevel(tc.sys, tc.dia, tc.pul)
      expect(level).toBe(tc.expected.webAlertLevel)
    })
  })
})


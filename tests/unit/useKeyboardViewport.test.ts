/*
檔案用途：驗證軟鍵盤 viewport 壓縮判定的邊界。
所在層：tests/unit；保護手機 compact input mode 的純判定規則。
主要關聯：對應 src/hooks/useKeyboardViewport.ts，由 App 與照護輸入頁共用。
*/
import { describe, expect, test } from 'bun:test'
import { isKeyboardViewportOpen } from '../../src/hooks/useKeyboardViewport'

describe('isKeyboardViewportOpen', () => {
  test('ignores small browser toolbar changes', () => {
    expect(isKeyboardViewportOpen(844, 700)).toBe(false)
  })

  test('detects a software keyboard shrinking the visual viewport', () => {
    expect(isKeyboardViewportOpen(844, 600, 1, true)).toBe(true)
  })

  test('does not treat zoom as a keyboard without an editable focus', () => {
    expect(isKeyboardViewportOpen(844, 600, 1.25, false)).toBe(false)
  })

  test('keeps compact mode while focus moves to the save button', () => {
    expect(isKeyboardViewportOpen(844, 600, 1, false, true)).toBe(true)
  })
})

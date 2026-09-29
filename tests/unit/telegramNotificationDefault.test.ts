/*
檔案用途：驗證血壓 Telegram adapter 的預設 Supabase Function 路徑。
所在層：tests/unit；用本地 mock 確認正式呼叫不會繞過登入 session 或洩漏健康數值。
主要關聯：src/lib/telegramNotification.ts、blood-pressure-notifier Edge Function 與 InputPage。
*/
import { beforeEach, describe, expect, mock, test } from 'bun:test'

let called: { functionName: string; options: unknown } | null = null
let error: unknown = null
const supabase = {
  functions: {
    invoke: async (functionName: string, options: unknown) => {
      called = { functionName, options }
      return { error }
    },
  },
}

mock.module('../../src/lib/supabase', () => ({ supabase }))

const { sendTelegramNotification } = await import('../../src/lib/telegramNotification')

const request = { recordId: 'record-1', patientId: 'patient-1' }

beforeEach(() => {
  called = null
  error = null
})

describe('sendTelegramNotification default invoke', () => {
  test('uses the authenticated Supabase Function when no adapter override is supplied', async () => {
    await sendTelegramNotification(request)
    // 契約版本走 header（PR #988 Codex P1）：body 仍恰好是兩個 UUID，與已部署的舊 Function 相容。
    expect(called).toEqual({ functionName: 'blood-pressure-notifier', options: { body: request, headers: { 'x-delivery-contract': '2' } } })
  })

  test('reports a default Supabase Function failure', async () => {
    error = new Error('function unavailable')
    await expect(sendTelegramNotification(request)).rejects.toThrow('Blood pressure notification failed')
  })
})

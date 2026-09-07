/*
檔案用途：驗證血壓 Telegram 通知前端 adapter 的 session 呼叫與錯誤邊界。
所在層：tests/unit；保護前端只傳固定 UUID，不把健康數值或公開 Worker key 放進通知請求。
主要關聯：src/lib/telegramNotification.ts、InputPage 與 blood-pressure-notifier Edge Function。
*/
import { describe, expect, test } from 'bun:test'
import { sendTelegramNotification } from '../../src/lib/telegramNotification'

const request = {
  recordId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  patientId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
}

describe('sendTelegramNotification', () => {
  test('invokes the authenticated Edge Function with only the record and patient UUIDs', async () => {
    let calledWith: { functionName: string; body: unknown } | null = null
    await sendTelegramNotification(request, async (functionName, options) => {
      calledWith = { functionName, body: options.body }
      return { error: null }
    })

    expect(calledWith).toEqual({ functionName: 'blood-pressure-notifier', body: request })
  })

  test('surfaces an Edge Function failure without pretending the notification was sent', async () => {
    await expect(sendTelegramNotification(request, async () => ({ error: new Error('function unavailable') }))).rejects.toThrow(
      'Blood pressure notification failed',
    )
  })
})

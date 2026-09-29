/*
檔案用途：驗證個人化通知綁定前端呼叫層的解析、URL 組裝與錯誤路徑，注入假 rpc 不碰網路。
所在層：tests/unit；純函式測試，不連線 Supabase。
主要關聯：src/lib/messagingLinks.ts、current_messaging_link_status／create_messaging_link_token／
unlink_messaging_channel RPC（issue #599）。
*/
import { describe, expect, test } from 'bun:test'
import { createMessagingLinkUrl, fetchMessagingLinkStatus, unlinkMessagingChannel } from '../../src/lib/messagingLinks'
import { supabase } from '../../src/lib/supabase'

describe('fetchMessagingLinkStatus', () => {
  test('uses the real Supabase adapter when no test rpc override is supplied', async () => {
    const originalRpc = supabase.rpc
    try {
      // 預設 adapter 只應負責把函式名轉給 session-scoped client；測試替換方法，不連線外部服務。
      supabase.rpc = (async () => ({ data: [{ channel: 'telegram', linked: true, linked_at: null, notification_tier: 'none' }], error: null })) as typeof supabase.rpc
      await expect(fetchMessagingLinkStatus()).resolves.toEqual([{ channel: 'telegram', linked: true, linkedAt: null, notificationTier: 'none' }])
    } finally {
      supabase.rpc = originalRpc
    }
  })

  test('parses rows for both channels into MessagingLinkStatus', async () => {
    const rpc = async () => ({
      data: [
        { channel: 'telegram', linked: true, linked_at: '2026-09-07T12:00:00.000Z', notification_tier: 'personal' },
        { channel: 'line', linked: false, linked_at: null, notification_tier: 'personal' },
      ],
      error: null,
    })
    const statuses = await fetchMessagingLinkStatus(rpc)
    expect(statuses).toEqual([
      { channel: 'telegram', linked: true, linkedAt: '2026-09-07T12:00:00.000Z', notificationTier: 'personal' },
      { channel: 'line', linked: false, linkedAt: null, notificationTier: 'personal' },
    ])
  })

  test('defaults notificationTier to none for anything other than the literal "personal"', async () => {
    const rpc = async () => ({ data: [{ channel: 'telegram', linked: false, linked_at: null, notification_tier: 'unexpected' }], error: null })
    const statuses = await fetchMessagingLinkStatus(rpc)
    expect(statuses[0].notificationTier).toBe('none')
  })

  test('rethrows the rpc error', () => {
    const rpc = async () => ({ data: null, error: new Error('boom') })
    expect(fetchMessagingLinkStatus(rpc)).rejects.toThrow('boom')
  })
})

describe('createMessagingLinkUrl', () => {
  const originalBotUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME

  test('builds a t.me deep link from the raw token for telegram', async () => {
    import.meta.env.VITE_TELEGRAM_BOT_USERNAME = 'jia_jian_log_bot'
    const rpc = async () => ({ data: 'a'.repeat(48), error: null })
    const url = await createMessagingLinkUrl('telegram', rpc)
    expect(url).toBe(`https://t.me/jia_jian_log_bot?start=${'a'.repeat(48)}`)
    import.meta.env.VITE_TELEGRAM_BOT_USERNAME = originalBotUsername
  })

  test('throws when VITE_TELEGRAM_BOT_USERNAME is not configured, instead of building a broken link', async () => {
    import.meta.env.VITE_TELEGRAM_BOT_USERNAME = ''
    const rpc = async () => ({ data: 'a'.repeat(48), error: null })
    expect(createMessagingLinkUrl('telegram', rpc)).rejects.toThrow('VITE_TELEGRAM_BOT_USERNAME')
    import.meta.env.VITE_TELEGRAM_BOT_USERNAME = originalBotUsername
  })

  test('rejects a missing or empty token from the rpc', () => {
    const rpc = async () => ({ data: '', error: null })
    expect(createMessagingLinkUrl('telegram', rpc)).rejects.toThrow('Messaging link token could not be created.')
  })

  test('rethrows the rpc error before touching the token', () => {
    const rpc = async () => ({ data: null, error: new Error('rate limited') })
    expect(createMessagingLinkUrl('telegram', rpc)).rejects.toThrow('rate limited')
  })

  test('builds a line.me oaMessage deep link with a prefilled /link <token> message for line', async () => {
    const originalBasicId = import.meta.env.VITE_LINE_OA_BASIC_ID
    import.meta.env.VITE_LINE_OA_BASIC_ID = 'fake-oa-basic-id'
    const rpc = async () => ({ data: 'b'.repeat(48), error: null })
    const url = await createMessagingLinkUrl('line', rpc)
    expect(url).toBe(`https://line.me/R/oaMessage/%40fake-oa-basic-id/?${encodeURIComponent(`/link ${'b'.repeat(48)}`)}`)
    import.meta.env.VITE_LINE_OA_BASIC_ID = originalBasicId
  })

  // 回歸：LINE Developers Console 顯示的 basic ID 帶 @，照抄貼進環境變數不能組出 @@ 開頭、點了打不開的連結。
  test('builds the same link whether VITE_LINE_OA_BASIC_ID is pasted with or without the leading @', async () => {
    const originalBasicId = import.meta.env.VITE_LINE_OA_BASIC_ID
    const rpc = async () => ({ data: 'b'.repeat(48), error: null })
    import.meta.env.VITE_LINE_OA_BASIC_ID = '@fake-oa-basic-id'
    const withAt = await createMessagingLinkUrl('line', rpc)
    import.meta.env.VITE_LINE_OA_BASIC_ID = ' fake-oa-basic-id '
    const withoutAt = await createMessagingLinkUrl('line', rpc)
    import.meta.env.VITE_LINE_OA_BASIC_ID = originalBasicId
    expect(withAt).toBe(withoutAt)
    expect(withAt).toStartWith('https://line.me/R/oaMessage/%40fake-oa-basic-id/?')
    expect(withAt).not.toContain('%40%40')
    expect(withAt).not.toContain('@@')
  })

  test('treats a bare @ as not configured instead of building a link to an empty LINE ID', async () => {
    const originalBasicId = import.meta.env.VITE_LINE_OA_BASIC_ID
    import.meta.env.VITE_LINE_OA_BASIC_ID = '@'
    const rpc = async () => ({ data: 'a'.repeat(48), error: null })
    await expect(createMessagingLinkUrl('line', rpc)).rejects.toThrow('VITE_LINE_OA_BASIC_ID')
    import.meta.env.VITE_LINE_OA_BASIC_ID = originalBasicId
  })

  test('throws when VITE_LINE_OA_BASIC_ID is not configured, instead of building a broken link', async () => {
    const originalBasicId = import.meta.env.VITE_LINE_OA_BASIC_ID
    import.meta.env.VITE_LINE_OA_BASIC_ID = ''
    const rpc = async () => ({ data: 'a'.repeat(48), error: null })
    await expect(createMessagingLinkUrl('line', rpc)).rejects.toThrow('VITE_LINE_OA_BASIC_ID')
    import.meta.env.VITE_LINE_OA_BASIC_ID = originalBasicId
  })
})

describe('unlinkMessagingChannel', () => {
  test('calls the rpc with the channel and resolves on success', async () => {
    let calledWith: unknown
    const rpc = async (functionName: string, args?: Record<string, unknown>) => {
      calledWith = { functionName, args }
      return { data: null, error: null }
    }
    await unlinkMessagingChannel('telegram', rpc)
    expect(calledWith).toEqual({ functionName: 'unlink_messaging_channel', args: { p_channel: 'telegram' } })
  })

  test('rethrows the rpc error', () => {
    const rpc = async () => ({ data: null, error: new Error('not linked') })
    expect(unlinkMessagingChannel('telegram', rpc)).rejects.toThrow('not linked')
  })
})

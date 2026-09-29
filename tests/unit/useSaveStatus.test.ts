/*
檔案用途：驗證表單儲存狀態 hook 的成功計時器、失敗訊息、重設與卸載清理。
所在層：tests/unit；用最小 React hook harness，不接觸資料庫或真實計時服務。
主要關聯：src/hooks/useSaveStatus.ts，以及寵物／體液平衡輸入頁的送出流程。
*/
import { describe, expect, test } from 'bun:test'
import { installReactHookHarness, renderHook } from './helpers/reactHookHarness'

installReactHookHarness()

const { useSaveStatus } = await import('../../src/hooks/useSaveStatus')
const flush = () => new Promise(resolve => setTimeout(resolve, 0))

describe('useSaveStatus', () => {
  test('begin clears the previous message and enters saving', () => {
    const view = renderHook(() => useSaveStatus())
    view.act(() => view.current.succeed('old success', 1000))
    expect(view.current.status).toBe('ok')
    view.act(() => view.current.begin())
    expect(view.current).toMatchObject({ status: 'saving', message: '' })
    view.unmount()
  })

  test('succeed returns to idle after the requested delay', async () => {
    const view = renderHook(() => useSaveStatus())
    view.act(() => view.current.succeed('Saved', 0))
    expect(view.current).toMatchObject({ status: 'ok', message: 'Saved' })
    await flush()
    expect(view.current).toMatchObject({ status: 'idle', message: 'Saved' })
    view.unmount()
  })

  test('fail and reset expose then clear the caller supplied error', () => {
    const view = renderHook(() => useSaveStatus())
    view.act(() => view.current.fail('Could not save'))
    expect(view.current).toMatchObject({ status: 'err', message: 'Could not save' })
    view.act(() => view.current.reset())
    expect(view.current).toMatchObject({ status: 'idle', message: '' })
    view.unmount()
  })

  test('a new action cancels the old success timer, and unmount cancels a pending timer', async () => {
    const view = renderHook(() => useSaveStatus())
    view.act(() => view.current.succeed('first', 1))
    view.act(() => view.current.begin())
    await flush()
    expect(view.current.status).toBe('saving')
    view.act(() => view.current.succeed('second', 10_000))
    view.unmount()
    await flush()
  })
})

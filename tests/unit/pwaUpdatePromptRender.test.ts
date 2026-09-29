/*
檔案用途：鎖住原生殼內不掛載 useRegisterSW／不輪詢更新（issue #812）；原生殼的 dist/ 是打包快照，
         Service Worker 在 capacitor://localhost 上的行為未定義，永遠檢查不到新版本。
所在層：tests/unit；不啟動真的瀏覽器，只驗證原生殼分支在第一次 render 就提早返回、完全不呼叫更新 hook。
主要關聯：src/components/system/PwaUpdatePrompt.tsx、src/lib/platform.ts。
*/
import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { installReactHookHarness, renderHook } from './helpers/reactHookHarness'

installReactHookHarness()

let nativeApp = false
let useRegisterSWCalls = 0

mock.module('../../src/lib/platform', () => ({
  isNativeApp: () => nativeApp,
  isStandalonePwa: (displayModeMatches: boolean, navigatorStandalone = false) => displayModeMatches || navigatorStandalone,
  readIsStandalonePwa: () => false,
  getNativePlatform: () => 'web',
}))
// 原生殼分支不會執行到這個 hook；如果真的被呼叫，代表守門失效，測試要能抓到。
mock.module('virtual:pwa-register/react', () => ({
  useRegisterSW: () => {
    useRegisterSWCalls += 1
    return { needRefresh: [false, () => {}], updateServiceWorker: async () => undefined }
  },
}))

const { PwaUpdatePrompt } = await import('../../src/components/system/PwaUpdatePrompt')

describe('PwaUpdatePrompt native shell gating', () => {
  beforeEach(() => {
    nativeApp = false
    useRegisterSWCalls = 0
  })

  test('renders nothing and never registers or polls the service worker inside the native shell', () => {
    nativeApp = true
    const view = renderHook(() => PwaUpdatePrompt())
    expect(view.current).toBeNull()
    expect(useRegisterSWCalls).toBe(0)
    view.unmount()
  })
})

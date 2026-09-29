/*
檔案用途：鎖住原生殼內不渲染 PWA 安裝提示（issue #812）；原生殼沒有 Safari「加入主畫面」流程可以引導。
所在層：tests/unit；不啟動真的瀏覽器，只驗證原生殼分支在第一次 render 就提早返回。
主要關聯：src/components/system/PwaInstallPrompt.tsx、src/lib/platform.ts。
*/
import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { installReactHookHarness, renderHook } from './helpers/reactHookHarness'

installReactHookHarness()

let nativeApp = false

// 只測原生殼分支：Web 分支會在 render 期間直接讀 window/document，交給既有 PwaInstallPrompt
// 手動驗收流程涵蓋，這裡不重覆搭建整套瀏覽器環境。
mock.module('../../src/lib/platform', () => ({
  isNativeApp: () => nativeApp,
  isStandalonePwa: (displayModeMatches: boolean, navigatorStandalone = false) => displayModeMatches || navigatorStandalone,
  readIsStandalonePwa: () => false,
  getNativePlatform: () => 'web',
}))
mock.module('../../src/lib/supabase', () => ({ supabase: {} }))

const { PwaInstallPrompt } = await import('../../src/components/system/PwaInstallPrompt')

describe('PwaInstallPrompt native shell gating', () => {
  beforeEach(() => {
    nativeApp = false
  })

  test('renders nothing inside the native shell', () => {
    nativeApp = true
    const view = renderHook(() => PwaInstallPrompt())
    expect(view.current).toBeNull()
    view.unmount()
  })
})

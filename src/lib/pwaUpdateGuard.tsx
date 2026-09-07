/*
檔案用途：React Provider 與 Guard 處理 PWA 新版本更新狀態邏輯。
所在層：src/lib；為 PWA 更新狀態防護機制。
主要關聯：包裹應用程式樹並監控 Service Worker registration，協調 PwaInstallPrompt、PwaUpdatePrompt 與 TutorialOverlay。
*/
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

interface PwaUpdateGuardValue {
  hasUnsavedInput: boolean
  registerUnsavedInput: (source: string, value: boolean) => void
  hasActiveGlobalOverlay: boolean
  registerGlobalOverlay: (source: string, value: boolean) => void
}

const PwaUpdateGuardContext = createContext<PwaUpdateGuardValue | null>(null)

/**
 * 聚合所有仍掛載中的表單狀態；每日照護的 hidden tab 仍會保留在 React tree，
 * 因此不能讓其中一頁的 cleanup 把另一頁未保存的資料解除保護。
 */
export function hasAnyUnsavedInput(guards: Readonly<Record<string, boolean>>) {
  return Object.values(guards).some(Boolean)
}

export function hasAnyActiveGlobalOverlay(overlays: Readonly<Record<string, boolean>>) {
  return Object.values(overlays).some(Boolean)
}

export function PwaUpdateGuardProvider({ children }: { children: ReactNode }) {
  const [unsavedInputs, setUnsavedInputs] = useState<Record<string, boolean>>({})
  const [globalOverlays, setGlobalOverlays] = useState<Record<string, boolean>>({})
  const registerUnsavedInput = useCallback((source: string, value: boolean) => {
    setUnsavedInputs(current => {
      if (value) {
        if (current[source]) return current
        return { ...current, [source]: true }
      }
      if (!(source in current)) return current
      const next = { ...current }
      delete next[source]
      return next
    })
  }, [])
  const registerGlobalOverlay = useCallback((source: string, value: boolean) => {
    setGlobalOverlays(current => {
      if (value) {
        if (current[source]) return current
        return { ...current, [source]: true }
      }
      if (!(source in current)) return current
      const next = { ...current }
      delete next[source]
      return next
    })
  }, [])
  const hasUnsavedInput = hasAnyUnsavedInput(unsavedInputs)
  const hasActiveGlobalOverlay = hasAnyActiveGlobalOverlay(globalOverlays)
  const value = useMemo(() => ({
    hasUnsavedInput,
    registerUnsavedInput,
    hasActiveGlobalOverlay,
    registerGlobalOverlay,
  }), [hasUnsavedInput, registerUnsavedInput, hasActiveGlobalOverlay, registerGlobalOverlay])

  return <PwaUpdateGuardContext.Provider value={value}>{children}</PwaUpdateGuardContext.Provider>
}

export function usePwaUpdateGuard() {
  const context = useContext(PwaUpdateGuardContext)
  if (!context) throw new Error('usePwaUpdateGuard must be used inside PwaUpdateGuardProvider')
  return context
}

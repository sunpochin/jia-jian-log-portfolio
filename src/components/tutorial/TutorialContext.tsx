/*
檔案用途：導覽教學的狀態管理（Tutorial Context）。
所在層：src/components/tutorial；提供全域的導覽狀態，讓各元件可以觸發或檢查教學進度。
主要關聯：TutorialOverlay, App (提供者), SettingsPage (觸發者), LoginScreen (觸發者)。
*/
import { createContext, useContext, useState, ReactNode } from 'react'
import type { LocalizedText } from '../../lib/i18n'

export type TutorialStep = {
  targetId: string // The data-tutorial attribute value to target (e.g., 'dailyCare-tab')
  title: LocalizedText
  content: LocalizedText
  position?: 'top' | 'bottom' | 'center'
  // 只有承接轉換用的步驟（例如試用結束的登入 CTA）才需要覆蓋主按鈕的文字與行為；
  // 一般步驟不帶這兩個欄位，主按鈕維持「下一步／完成」呼叫 nextStep 的預設行為。
  primaryActionLabel?: LocalizedText
  onPrimaryAction?: () => void
}

type TutorialContextType = {
  isActive: boolean
  currentStepIndex: number
  steps: TutorialStep[]
  startTutorial: (steps: TutorialStep[]) => void
  nextStep: () => void
  prevStep: () => void
  skipTutorial: () => void
}

const TutorialContext = createContext<TutorialContextType | undefined>(undefined)

export function TutorialProvider({ children }: { children: ReactNode }) {
  const [isActive, setIsActive] = useState(false)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [steps, setSteps] = useState<TutorialStep[]>([])

  // 繁體中文註解：觸發教學，重置步驟並啟動
  const startTutorial = (newSteps: TutorialStep[]) => {
    setSteps(newSteps)
    setCurrentStepIndex(0)
    setIsActive(true)
  }

  const nextStep = () => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(prev => prev + 1)
    } else {
      setIsActive(false)
    }
  }

  const prevStep = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1)
    }
  }

  const skipTutorial = () => {
    setIsActive(false)
  }

  return (
    <TutorialContext.Provider value={{
      isActive,
      currentStepIndex,
      steps,
      startTutorial,
      nextStep,
      prevStep,
      skipTutorial
    }}>
      {children}
    </TutorialContext.Provider>
  )
}

export function useTutorial() {
  const context = useContext(TutorialContext)
  if (context === undefined) {
    throw new Error('useTutorial must be used within a TutorialProvider')
  }
  return context
}

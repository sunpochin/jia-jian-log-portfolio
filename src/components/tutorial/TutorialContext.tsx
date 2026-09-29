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
  // 章節名。導覽變長之後，進度若照舊顯示「6 / 8」，訪客第一眼看到的是「還有一大段」而直接跳過；
  // 改成「章節名・章內第 n / 共 m 步」，同一章連續的步驟會共用這個值，訪客隨時知道這一段還剩幾步。
  // 不帶這個欄位的步驟（例如單獨重播的短導覽）維持原本的全域 n / 總數顯示。
  chapter?: LocalizedText
  // 進入這一步之前要先做的事，最常見的是切換分頁（呼叫端傳 `() => changeTab('events')`）。
  // 刻意不做成 `navigateTo: TabKey`：分頁列舉型別住在 App.tsx，讓共用元件反過來依賴它會把
  // 應用外殼的知識灌進 tutorial 模組；改用 callback 之後 tutorial 不需要知道有哪些分頁存在。
  // 前進與後退都會觸發，所以這裡只能放「可重複執行且冪等」的動作，不要放送出請求之類的副作用。
  onEnter?: () => void
  // 目標不在畫面內時（例如剛切完分頁、或目標在長頁面的下半部）是否自動捲進視野。
  // 底部 tab bar 永遠可見，所以現有步驟都不需要；頁面內部的錨點才需要打開。
  scrollIntoView?: boolean
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

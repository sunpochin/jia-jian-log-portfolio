/*
檔案用途：導覽教學的視覺覆蓋層（Tutorial Overlay），負責高亮目標元素與顯示提示框。
所在層：src/components/tutorial；作為共用 UI 元件，在 App.tsx 渲染。
主要關聯：TutorialContext 提供狀態，配合各頁面的 data-tutorial 屬性定位，並向 PwaUpdateGuard 登記遮罩。
*/
import { useEffect, useRef, useState } from 'react'
import { useTutorial } from './TutorialContext'
import { useI18n } from '../../lib/i18n'
import { usePwaUpdateGuard } from '../../lib/pwaUpdateGuard'

export function TutorialOverlay() {
  const { isActive, currentStepIndex, steps, nextStep, prevStep, skipTutorial } = useTutorial()
  const { text } = useI18n()
  const { registerGlobalOverlay } = usePwaUpdateGuard()
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)

  const dialogRef = useRef<HTMLDivElement>(null)
  const nextBtnRef = useRef<HTMLButtonElement>(null)
  const previousActiveElementRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    // 為什麼只登記真正有步驟的教學：空步驟不會產生遮罩，不應無故隱藏安裝入口。
    registerGlobalOverlay('tutorial', isActive && steps.length > 0)
    return () => registerGlobalOverlay('tutorial', false)
  }, [isActive, registerGlobalOverlay, steps.length])

  // 繁體中文註解：在導覽開啟時保存當前焦點元素，導覽關閉後將焦點歸還給觸發者，維持無障礙操作體驗
  useEffect(() => {
    if (isActive) {
      previousActiveElementRef.current = document.activeElement as HTMLElement | null
    } else if (previousActiveElementRef.current) {
      previousActiveElementRef.current.focus?.()
      previousActiveElementRef.current = null
    }
  }, [isActive])

  // 繁體中文註解：當導覽步驟切換時，自動將焦點移至對話框的主要按鈕，方便螢幕閱讀器與鍵盤使用者直接操作
  useEffect(() => {
    if (isActive && steps.length > 0) {
      const timer = setTimeout(() => {
        nextBtnRef.current?.focus()
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [isActive, currentStepIndex, steps])

  // 繁體中文註解：監聽鍵盤事件，支援 Escape 鍵關閉導覽，並在 Modal 開啟期間限制 Tab 焦點於 Modal 按鈕內 (Focus Trap)
  useEffect(() => {
    if (!isActive) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        skipTutorial()
        return
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (focusableElements.length === 0) return

        const firstElement = focusableElements[0]
        const lastElement = focusableElements[focusableElements.length - 1]

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault()
            lastElement.focus()
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault()
            firstElement.focus()
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isActive, skipTutorial])
  
  useEffect(() => {
    if (!isActive || steps.length === 0) return
    
    const currentStep = steps[currentStepIndex]
    if (currentStep.position === 'center') {
      setTargetRect(null)
      return
    }
    
    // 繁體中文註解：透過 data-tutorial 屬性找到目標元素，並持續觀察其位置變化（因應畫面重繪或視窗調整）
    const updateRect = () => {
      const el = document.querySelector(`[data-tutorial="${currentStep.targetId}"]`)
      if (el) {
        setTargetRect(el.getBoundingClientRect())
      } else {
        setTargetRect(null)
      }
    }
    
    updateRect()
    window.addEventListener('resize', updateRect)
    const observer = new MutationObserver(updateRect)
    observer.observe(document.body, { childList: true, subtree: true })
    
    return () => {
      window.removeEventListener('resize', updateRect)
      observer.disconnect()
    }
  }, [isActive, currentStepIndex, steps])

  if (!isActive || steps.length === 0) return null

  const currentStep = steps[currentStepIndex]
  
  let tooltipStyle: React.CSSProperties = {}
  if (currentStep.position === 'center' || !targetRect) {
    tooltipStyle = {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      position: 'fixed',
    }
  } else {
    // 繁體中文註解：為了防止在窄螢幕手機上因為目標元素偏左或偏右導致對話框被切邊，提示框水平統一採 fixed left 50% 置中
    const margin = 16
    if (currentStep.position === 'bottom') {
      tooltipStyle = {
        top: `${targetRect.bottom + margin}px`,
        left: '50%',
        transform: 'translateX(-50%)',
        position: 'fixed',
      }
    } else if (currentStep.position === 'top') {
      tooltipStyle = {
        bottom: `${window.innerHeight - targetRect.top + margin}px`,
        left: '50%',
        transform: 'translateX(-50%)',
        position: 'fixed',
      }
    }
  }

  const isLastStep = currentStepIndex === steps.length - 1
  // 有 onPrimaryAction 時（目前只有試用結束的登入 CTA）主按鈕改呼叫它，而不是照常前進到下一步或直接關閉導覽；
  // 呼叫端（App.tsx）自己決定要不要順便結束導覽，這裡不擅自加 skipTutorial()，避免導覽狀態被提前清空。
  const handlePrimaryAction = () => {
    if (currentStep.onPrimaryAction) {
      currentStep.onPrimaryAction()
      return
    }
    nextStep()
  }
  const primaryLabel = currentStep.primaryActionLabel
    ? text(currentStep.primaryActionLabel)
    : (isLastStep ? text({ id: 'Selesai', zh: '完成' ,en: 'Done' }) : text({ id: 'Lanjut', zh: '下一步' ,en: 'Next' }))

  return (
    <>
      {/* 遮罩背景：移除 backdrop-blur-sm 避免畫面過度模糊，改用適當透明度的半透明黑，既能聚焦又看得清背景內容 */}
      <div className="fixed inset-0 z-50 bg-slate-950/45 transition-opacity pointer-events-auto" />
      
      {/* 目標元素高亮框：帶有柔和的深色光暈與亮藍色外框，清楚標示正在介紹的項目 */}
      {targetRect && currentStep.position !== 'center' && (
        <div 
          className="fixed z-50 rounded-xl ring-4 ring-indigo-500 bg-indigo-500/10 shadow-[0_0_24px_rgba(99,102,241,0.5)] transition-all duration-300 pointer-events-none"
          style={{
            top: targetRect.top - 6,
            left: targetRect.left - 6,
            width: targetRect.width + 12,
            height: targetRect.height + 12,
          }}
        />
      )}

      {/* 動態指示箭頭符號：畫出鮮明符號直接指到正在說明的 Tab / 目標元素 */}
      {targetRect && currentStep.position !== 'center' && (
        <div
          className="fixed z-50 pointer-events-none flex flex-col items-center animate-bounce transition-all duration-300"
          style={{
            left: `${targetRect.left + targetRect.width / 2}px`,
            top: currentStep.position === 'top' 
              ? `${targetRect.top - 36}px` 
              : `${targetRect.bottom + 10}px`,
            transform: 'translateX(-50%)',
          }}
        >
          {currentStep.position === 'top' ? (
            <div className="flex flex-col items-center text-indigo-500 drop-shadow-[0_4px_10px_rgba(0,0,0,0.3)]">
              <span className="text-2xl">👇</span>
              <svg className="w-5 h-5 -mt-1 fill-indigo-500" viewBox="0 0 24 24">
                <path d="M12 21l-7-8h4V4h6v9h4l-7 8z" />
              </svg>
            </div>
          ) : (
            <div className="flex flex-col items-center text-indigo-500 drop-shadow-[0_4px_10px_rgba(0,0,0,0.3)]">
              <svg className="w-5 h-5 -mb-1 fill-indigo-500" viewBox="0 0 24 24">
                <path d="M12 3l7 8h-4v9h-6v-9H5l7-8z" />
              </svg>
              <span className="text-2xl">👆</span>
            </div>
          )}
        </div>
      )}
      
      {/* 導覽提示對話框 */}
      <div 
        ref={dialogRef}
        className="fixed z-50 w-[90%] max-w-[320px] bg-white rounded-2xl shadow-2xl p-5 border border-slate-100 transition-all duration-300"
        style={tooltipStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-dialog-title"
      >
        <div className="flex justify-between items-start mb-2">
          <h3 id="tutorial-dialog-title" className="font-bold text-slate-900 text-lg">
            {text(currentStep.title)}
          </h3>
          <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full whitespace-nowrap">
            {currentStepIndex + 1} / {steps.length}
          </span>
        </div>
        
        <p className="text-slate-600 text-sm leading-relaxed mb-6">
          {text(currentStep.content)}
        </p>
        
        <div className="flex items-center justify-between mt-auto pt-2">
          <button 
            onClick={skipTutorial}
            className="text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
          >
            {text({ id: 'Lewati', zh: '跳過' ,en: 'Lewati' })}
          </button>
          
          <div className="flex gap-2">
            {currentStepIndex > 0 && (
              <button 
                onClick={prevStep}
                className="text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-xl transition-colors active:scale-95"
              >
                {text({ id: 'Kembali', zh: '上一步' ,en: 'Undo' })}
              </button>
            )}
            <button
              ref={nextBtnRef}
              onClick={handlePrimaryAction}
              className="text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-5 py-2 rounded-xl shadow-sm transition-colors active:scale-95"
            >
              {primaryLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

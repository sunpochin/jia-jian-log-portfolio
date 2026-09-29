/*
檔案用途：導覽教學的視覺覆蓋層（Tutorial Overlay），負責高亮目標元素與顯示提示框。
所在層：src/components/tutorial；作為共用 UI 元件，在 App.tsx 渲染。
主要關聯：TutorialContext 提供狀態，配合各頁面的 data-tutorial 屬性定位，並向 PwaUpdateGuard 登記遮罩。
*/
import { useEffect, useRef, useState } from 'react'
import { useTutorial } from './TutorialContext'
import { useI18n } from '../../lib/i18n'
import { usePwaUpdateGuard } from '../../lib/pwaUpdateGuard'
import { resolveTutorialProgress } from '../../lib/tutorialProgress'

// 切換分頁後目標元素不會立刻掛上 DOM（分頁是 lazy 載入的），所以要等；但不能無限等下去，
// 否則錨點寫錯或該元件當下不該出現時，訪客會一直看著一個沒有高亮框、箭頭也不知道指哪的半殘畫面。
// 逾時之後改用置中純文字卡，寧可少一個高亮框，也不要留下指錯地方的箭頭。
const TARGET_RESOLVE_TIMEOUT_MS = 1500

export function TutorialOverlay() {
  const { isActive, currentStepIndex, steps, nextStep, prevStep, skipTutorial } = useTutorial()
  const { text } = useI18n()
  const { registerGlobalOverlay } = usePwaUpdateGuard()
  // 為什麼要把步驟索引跟位置存在一起：effect 是在 render 之後才跑的，如果只存 DOMRect，
  // 切到下一步的第一次 render 會沿用上一步的位置，說明框先畫在舊目標旁邊、下一幀才跳到新位置。
  // 把索引一起記下來，render 當下就能判斷「這個位置是上一步的，不算數」，從源頭消掉這一下跳動。
  const [target, setTarget] = useState<{ stepIndex: number; rect: DOMRect } | null>(null)
  // 「還在等目標出現」與「等超時了，這一步就當作沒有目標」是兩種不同狀態：前者不該先畫出置中卡再跳走，
  // 後者才需要永久降級。只用 rect === null 分不出這兩者，所以另外記一個旗標（同樣綁步驟索引）。
  const [timedOutStepIndex, setTimedOutStepIndex] = useState<number | null>(null)

  const dialogRef = useRef<HTMLDivElement>(null)
  const nextBtnRef = useRef<HTMLButtonElement>(null)
  const previousActiveElementRef = useRef<HTMLElement | null>(null)
  // onEnter 的 effect 只依賴步驟索引，但仍需要讀到最新的步驟內容；用 ref 取得而不是列入依賴，
  // 才不會因為呼叫端每次 render 重建 steps 陣列就把 onEnter 重跑一遍。
  const stepsRef = useRef(steps)
  stepsRef.current = steps

  // 這幾個值刻意算在所有 hook 之前：下面的 focus effect 要用 awaitingTarget 決定何時該重新聚焦
  // 對話框，而 hook 呼叫順序不能被任何早退擋住，一定要在第一個 useEffect 之前就宣告好。
  // currentStep 用 optional chaining：steps 還沒填好時 currentStepIndex 可能暫時對不到任何步驟，
  // 這裡只是讓上面的 hook 讀到一個安全的暫時值，不代表這個狀態該被畫出來（下面很快就會早退）。
  const currentStep = steps[currentStepIndex]
  // 只接受屬於「這一步」的位置；上一步殘留的位置一律當作還沒找到。
  const targetRect = target?.stepIndex === currentStepIndex ? target.rect : null
  const targetTimedOut = timedOutStepIndex === currentStepIndex
  // 還在等目標出現時只留遮罩，不先畫說明框：先畫在舊位置再跳到新目標旁邊會讓卡片彈一下，
  // 半夜單手操作的看護很容易因此點錯。等到找到目標、或等逾時確定找不到，才畫出說明框。
  const awaitingTarget = currentStep?.position !== 'center' && !targetRect && !targetTimedOut

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

  // 繁體中文註解：當導覽步驟切換時，自動將焦點移至對話框的主要按鈕，方便螢幕閱讀器與鍵盤使用者直接操作。
  // 這裡也要依賴 awaitingTarget：對話框在「還在等目標出現」期間根本沒有掛載（見下方渲染的 {!awaitingTarget && ...}），
  // 這段時間 nextBtnRef.current 是 null。如果只依賴 currentStepIndex，目標晚於 50ms 才解析出來時，
  // 對話框掛載的當下這個 effect早就跑完、聚焦動作已經對著 null 執行過一次，鍵盤焦點就會卡在背景頁面，
  // 而不是落在剛出現的對話框上——必須讓 awaitingTarget 由 true 轉 false 時重新觸發一次。
  useEffect(() => {
    if (isActive && steps.length > 0 && !awaitingTarget) {
      const timer = setTimeout(() => {
        nextBtnRef.current?.focus()
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [isActive, currentStepIndex, steps, awaitingTarget])

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
  
  // 繁體中文註解：進入這一步之前先跑 onEnter（最常見的是切換分頁）。
  // 為什麼要獨立一個 effect 而不是塞進下面找目標的那個：找目標的 effect 依賴 steps，
  // 而 steps 常常是呼叫端每次 render 重建的陣列；混在一起會讓 onEnter 被重複呼叫。
  // 這裡只認「導覽有沒有開」與「第幾步」，同一步內不論 render 幾次都只跑一次。
  useEffect(() => {
    if (!isActive) return
    stepsRef.current[currentStepIndex]?.onEnter?.()
  }, [isActive, currentStepIndex])

  useEffect(() => {
    if (!isActive || steps.length === 0) return

    const currentStep = steps[currentStepIndex]
    setTimedOutStepIndex(null)
    if (currentStep.position === 'center') {
      setTarget(null)
      return
    }

    // 一旦逾時降級成置中純文字卡，這面旗子就擋住後續所有遲到的位置更新——沒有這道防線，
    // MutationObserver 仍會在逾時之後繼續跑，一旦目標終於掛上 DOM 就會呼叫 setTarget 把
    // hasTargetHighlight 重新打開，讓畫面從「已經定案的降級卡」跳成「突然冒出的高亮框＋箭頭」，
    // 正是這個逾時機制原本要避免的閃爍。用 ref 而不是判斷 state：setTimeout 的 callback
    // 是同一個 closure，讀 state 只會拿到 effect 掛載當下的舊值，不會看到後續 render 的更新。
    // 只有「逾時當下目標仍未解析」才凍結——已經正常找到目標的步驟不該在 1.5 秒後
    // 被誤判逾時，否則使用者後續捲動、轉螢幕或內容變動時，resize/scroll/MutationObserver
    // 都會變成 no-op，高亮框與箭頭留在過期座標指錯地方。
    let timedOut = false
    let resolved = false
    let scrolled = false
    // 繁體中文註解：透過 data-tutorial 屬性找到目標元素，並持續觀察其位置變化（因應畫面重繪或視窗調整）
    const updateRect = () => {
      if (timedOut) return
      const el = document.querySelector(`[data-tutorial="${currentStep.targetId}"]`)
      if (!el) {
        setTarget(null)
        return
      }
      resolved = true
      setTarget({ stepIndex: currentStepIndex, rect: el.getBoundingClientRect() })
      // 只在這一步第一次找到目標時捲動一次。持續捲動會跟使用者自己的滑動打架，
      // 而 MutationObserver 在頁面載入期間會連續觸發很多次。
      if (currentStep.scrollIntoView && !scrolled) {
        scrolled = true
        // 明確傳入的 behavior 會蓋過 index.css 的 `scroll-behavior: auto !important`，
        // 所以減少動態偏好要在這裡自己讀一次，不能只靠全域 CSS。
        const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
        el.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'center' })
      }
    }

    updateRect()
    window.addEventListener('resize', updateRect)
    window.addEventListener('scroll', updateRect, true)
    const observer = new MutationObserver(updateRect)
    observer.observe(document.body, { childList: true, subtree: true })
    const timeoutId = setTimeout(() => {
      if (resolved) return
      timedOut = true
      setTimedOutStepIndex(currentStepIndex)
    }, TARGET_RESOLVE_TIMEOUT_MS)

    return () => {
      window.removeEventListener('resize', updateRect)
      window.removeEventListener('scroll', updateRect, true)
      observer.disconnect()
      clearTimeout(timeoutId)
    }
  }, [isActive, currentStepIndex, steps])

  if (!isActive || steps.length === 0) return null

  // 逾時仍找不到目標就整步降級成置中純文字卡：不畫高亮框、不畫箭頭，寧可少一個指示，
  // 也不要留下指著空白處的箭頭。
  const hasTargetHighlight = currentStep?.position !== 'center' && targetRect !== null

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
        // 目標很靠近畫面下緣時，說明框會被推到看不見的地方；限制最大高度並讓它自己捲動，
        // 好過整張卡（含「下一步」按鈕）掉出視窗外變成死路。
        maxHeight: `calc(100dvh - ${targetRect.bottom + margin * 2}px)`,
        overflowY: 'auto',
      }
    } else if (currentStep.position === 'top') {
      tooltipStyle = {
        bottom: `${window.innerHeight - targetRect.top + margin}px`,
        left: '50%',
        transform: 'translateX(-50%)',
        position: 'fixed',
        maxHeight: `calc(${targetRect.top}px - ${margin * 2}px)`,
        overflowY: 'auto',
      }
    }
  }

  const isLastStep = currentStepIndex === steps.length - 1
  const progress = resolveTutorialProgress(steps, currentStepIndex)
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
      {hasTargetHighlight && (
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
      {hasTargetHighlight && (
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
      
      {/* 導覽提示對話框；還在等目標出現時先不畫，避免說明框從畫面中央彈到目標旁邊 */}
      {!awaitingTarget && <div 
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
            {progress.chapter ? `${text(progress.chapter)}・` : ''}{progress.current} / {progress.total}
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
            {text({ id: 'Lewati', zh: '跳過', en: 'Skip' })}
          </button>
          
          <div className="flex gap-2">
            {currentStepIndex > 0 && (
              <button 
                onClick={prevStep}
                className="text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-xl transition-colors active:scale-95"
              >
                {text({ id: 'Kembali', zh: '上一步', en: 'Back' })}
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
      </div>}
    </>
  )
}

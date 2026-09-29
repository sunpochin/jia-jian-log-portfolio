/*
檔案用途：把導覽步驟陣列換算成「章節內進度」，讓提示框顯示「章節名・2 / 3」而不是「6 / 8」。
所在層：src/lib 共用規則層；純函式、不碰 DOM 也不碰 React，方便單元測試直接驗證分章邏輯。
主要關聯：TutorialOverlay（顯示進度）、TutorialStep 的 chapter 欄位、demoTutorialSteps（實際分章的地方）。
*/
import type { LocalizedText } from './i18n'

export interface TutorialStepLike {
  chapter?: LocalizedText
}

export interface TutorialProgress {
  // 有分章時是章節名，沒分章時為 null（呼叫端就只顯示 current / total）。
  chapter: LocalizedText | null
  current: number
  total: number
}

// 為什麼要序列化而不是直接比物件參考：步驟陣列常常是每次 render 重新建立的字面值，
// 同一章的兩個步驟寫的是兩個內容相同但參考不同的物件，用 === 比會把每一步都切成獨立章節。
function chapterKey(chapter: LocalizedText | undefined): string | null {
  if (!chapter) return null
  return JSON.stringify([chapter.id, chapter.zh, chapter.en])
}

/**
 * 只把「相鄰且章節名相同」的步驟視為同一章。
 * 刻意不把散落各處的同名步驟合併：導覽是線性的，若同一個章節名出現在不連續的位置，
 * 那是步驟表寫錯了，這裡照實呈現成兩段比默默合併更容易被發現。
 */
export function resolveTutorialProgress(steps: TutorialStepLike[], currentIndex: number): TutorialProgress {
  const fallback: TutorialProgress = { chapter: null, current: currentIndex + 1, total: steps.length }
  if (currentIndex < 0 || currentIndex >= steps.length) return fallback

  const current = steps[currentIndex]
  const key = chapterKey(current.chapter)
  if (key === null) return fallback

  let start = currentIndex
  while (start > 0 && chapterKey(steps[start - 1].chapter) === key) start -= 1
  let end = currentIndex
  while (end < steps.length - 1 && chapterKey(steps[end + 1].chapter) === key) end += 1

  return { chapter: current.chapter ?? null, current: currentIndex - start + 1, total: end - start + 1 }
}

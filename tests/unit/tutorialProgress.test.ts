/*
檔案用途：驗證導覽進度的分章換算——同一章的相鄰步驟要算成「章內 n / m」，沒分章時退回全域進度。
所在層：tests/unit；保護 TutorialOverlay 進度標籤依賴的純函式。
主要關聯：src/lib/tutorialProgress.ts。
*/
import { describe, expect, test } from 'bun:test'
import { resolveTutorialProgress } from '../../src/lib/tutorialProgress'
import type { LocalizedText } from '../../src/lib/i18n'

const daily: LocalizedText = { id: 'Setiap hari', zh: '每天要做的事', en: 'Every day' }
// 刻意用另一個內容相同的物件：步驟陣列常常每次 render 重建，比參考會把同一章切成兩段。
const dailyAgain: LocalizedText = { id: 'Setiap hari', zh: '每天要做的事', en: 'Every day' }
const photos: LocalizedText = { id: 'Foto dan AI', zh: '照片和 AI', en: 'Photos and AI' }

describe('tutorial chapter progress', () => {
  test('falls back to global progress when the step has no chapter', () => {
    const steps = [{}, {}, {}]
    expect(resolveTutorialProgress(steps, 1)).toEqual({ chapter: null, current: 2, total: 3 })
  })

  test('counts only the steps inside the current chapter', () => {
    const steps = [{}, { chapter: daily }, { chapter: dailyAgain }, { chapter: photos }]
    expect(resolveTutorialProgress(steps, 2)).toEqual({ chapter: dailyAgain, current: 2, total: 2 })
    expect(resolveTutorialProgress(steps, 3)).toEqual({ chapter: photos, current: 1, total: 1 })
  })

  test('groups chapters by content, not by object identity', () => {
    const steps = [{ chapter: daily }, { chapter: dailyAgain }]
    expect(resolveTutorialProgress(steps, 0).total).toBe(2)
  })

  test('keeps non-adjacent same-named chapters separate so a mis-ordered step list stays visible', () => {
    const steps = [{ chapter: daily }, { chapter: photos }, { chapter: dailyAgain }]
    expect(resolveTutorialProgress(steps, 2)).toEqual({ chapter: dailyAgain, current: 1, total: 1 })
  })

  test('does not crash on an out-of-range index', () => {
    expect(resolveTutorialProgress([{ chapter: daily }], 5)).toEqual({ chapter: null, current: 6, total: 1 })
  })
})

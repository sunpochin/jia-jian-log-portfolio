/*
檔案用途：驗證底部導覽名稱與對應頁面標題是同一個名字，避免按下的入口與看到的標題對不上。
所在層：tests/unit；守住每天使用、且介面為第二語言的照護者不必懷疑自己按錯。
主要關聯：src/components/ui/TabHeader.tsx 的 TAB_TITLES 與 TAB_NAV_LABELS。
*/
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'bun:test'

const tabHeaderSource = readFileSync(new URL('../../src/components/ui/TabHeader.tsx', import.meta.url), 'utf8')

/** 從來源取出某個 key 的雙語文案，避免測試需要載入整個 React 元件樹。 */
function readLabel(block: string, key: string): { id: string; zh: string } {
  const match = block.match(new RegExp(`${key}:\\s*\\{\\s*id:\\s*'([^']*)'\\s*,\\s*zh:\\s*'([^']*)'(?:\\s*,\\s*en:\\s*'[^']*')?\\s*\\}`))
  if (!match) throw new Error(`找不到 ${key} 的雙語文案`)
  return { id: match[1], zh: match[2] ,en: match[1] }
}

const titlesBlock = tabHeaderSource.slice(tabHeaderSource.indexOf('const TAB_TITLES'), tabHeaderSource.indexOf('export type TabHeaderTitle'))
const navBlock = tabHeaderSource.slice(tabHeaderSource.indexOf('export const TAB_NAV_LABELS'))

const NAV_TABS = ['events', 'dailyCare', 'schedule', 'settings'] as const

describe('底部導覽名稱與頁面標題', () => {
  test.each(NAV_TABS)('%s 的導覽名稱與頁面標題共用同一個詞', tab => {
    const title = readLabel(titlesBlock, tab)
    const nav = readLabel(navBlock, tab)

    // 底部欄位寬度有限，允許縮寫；規則是「其中一邊必須包含另一邊」。
    // 這剛好允許同字根的合理縮寫（照護／每日照護、Rawat／Perawatan harian、Atur／Pengaturan），
    // 又擋掉真正對不上的情況——例如修正前的「資料」對「健康趨勢」、「Data」對「Tren kesehatan」，
    // 兩邊沒有任何共同的字，照護者按下去會懷疑自己按錯。
    expect(title.zh.includes(nav.zh) || nav.zh.includes(title.zh)).toBe(true)

    const titleId = title.id.toLowerCase()
    const navId = nav.id.toLowerCase()
    expect(titleId.includes(navId) || navId.includes(titleId)).toBe(true)
  })

  test('擋得住修正前那種完全對不上的命名', () => {
    // 這個守門測試本身要能失敗才有意義：確認規則不是恆真。
    expect('tren kesehatan'.includes('data')).toBe(false)
    expect('健康趨勢'.includes('資料')).toBe(false)
  })
})

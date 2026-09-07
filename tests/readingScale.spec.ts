/*
檔案用途：驗證閱讀字級（標準／大／特大）能真的放大整個 App、跨重載保留，且放大後底部導覽與血壓輸入頁不破版。
所在層：tests 根目錄的 Playwright E2E；覆蓋 issue #439 移除禁止縮放後的可讀性驗收條件。
主要關聯：ReadingScaleSettings、src/lib/readingScale.ts、src/index.css 與 App.tsx 的底部導覽。
*/
import { expect, test } from '@playwright/test'

// 用觸控手機模擬：src/index.css 的 16px 表單字級下限寫在 @media (pointer: coarse) 裡，
// 桌機模式不會套用，那樣就測不到「iOS 點輸入框自動放大」的實際防線。
test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true })

const rootFontSize = (page: import('@playwright/test').Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).fontSize)

// documentElement 的橫向捲動寬度超過可視寬度，就代表版面被撐爆了。
const hasHorizontalOverflow = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)

// 展示模式第一次進站會蓋上新手導覽 overlay，它會攔截所有點擊；先跳過才能操作設定卡。
// 必須用 waitFor 而不是立刻 count()：overlay 是在 React 掛載後才出現，
// 一進站就數會數到 0，然後在真正要點的時候才被蓋住。
async function skipTutorialIfPresent(page: import('@playwright/test').Page) {
  const skip = page.getByRole('button', { name: /跳過|Lewati/ })
  try {
    await skip.waitFor({ state: 'visible', timeout: 3000 })
  } catch {
    return
  }
  await skip.click()
  await expect(skip).toHaveCount(0)
}

test('reading scale enlarges the whole app, survives reload, and keeps the layout intact', async ({ page }) => {
  await page.goto('/demo')
  await skipTutorialIfPresent(page)
  await page.getByRole('button', { name: /設定/ }).click()

  // 預設不動任何人的畫面：沒設定過就是瀏覽器原本的 16px。
  expect(await rootFontSize(page)).toBe('16px')

  // 點 label 而不是 sr-only 的 radio 本身，這才是使用者實際會碰到的目標。
  await page.locator('label[for="reading-scale-xlarge"]').click()
  await expect(page.locator('#reading-scale-xlarge')).toBeChecked()
  expect(await rootFontSize(page)).toBe('20px')
  await expect(page.locator('html')).toHaveAttribute('data-reading-scale', 'xlarge')

  // 重載後必須維持特大：長輩不該每次開 App 都要重設一次。
  await page.reload()
  expect(await rootFontSize(page)).toBe('20px')
  expect(await hasHorizontalOverflow(page)).toBe(false)

  // 底部固定導覽在放大狀態下仍要完整可見、可點，且不把內容擠到畫面外。
  const nav = page.getByRole('navigation', { name: /主要導覽|Navigasi utama/ })
  await expect(nav).toBeVisible()

  await page.getByRole('button', { name: /照護/ }).click()
  await expect(page.getByRole('tab', { name: '血壓', exact: true })).toBeVisible()
  expect(await hasHorizontalOverflow(page)).toBe(false)
  await expect(nav).toBeVisible()
})

test('touch form controls stay at least 16px so iOS does not auto-zoom on focus', async ({ page }) => {
  await page.goto('/demo')
  await skipTutorialIfPresent(page)
  await page.getByRole('button', { name: /設定/ }).click()

  // 逐一檢查這頁所有可輸入欄位；只要有一個小於 16px，iOS 聚焦時就會把整頁放大再偏移。
  const tooSmall = await page.evaluate(() => {
    const selector = 'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]), select, textarea'
    return [...document.querySelectorAll(selector)]
      .filter(element => element.checkVisibility?.() !== false)
      .map(element => ({ tag: element.tagName, size: parseFloat(getComputedStyle(element).fontSize) }))
      .filter(entry => entry.size < 16)
  })
  expect(tooSmall).toEqual([])
})

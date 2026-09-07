/*
檔案用途：驗證展示模式中的每日照護飲食流程可在瀏覽器完成一次手動餐點紀錄。
所在層：tests 根目錄的 Playwright E2E；避免每次 CI 呼叫外部影像或營養 API。
主要關聯：DailyCarePage、NutritionPage 與 demoStorage。
*/
import { expect, test } from '@playwright/test'

test('records a manual meal in the patient nutrition section', async ({ page }) => {
  await page.goto('/demo')
  await page.getByRole('tab', { name: '飲食', exact: true }).click()
  await page.getByLabel('食物或產品名稱').fill('無糖豆漿')
  await page.getByLabel('熱量（kcal）').fill('120')
  await page.getByRole('button', { name: '儲存餐點', exact: true }).click()

  await expect(page.getByText('餐點與熱量已記錄。', { exact: true })).toBeVisible()
  await expect(page.getByText('無糖豆漿', { exact: true })).toBeVisible()
  await expect(page.getByLabel('今日總熱量').getByText('120 kcal', { exact: true })).toBeVisible()
})

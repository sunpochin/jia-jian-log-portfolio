/*
檔案用途：驗證展示模式可依使用者偏好只顯示體溫與體重兩個每日照護入口。
所在層：tests 根目錄的 Playwright E2E；覆蓋設定卡、動態頁籤與 Demo 本機保存。
主要關聯：DailyCareDisplaySettings、DailyCarePage、dailyCarePreferences 與 demoStorage。
*/
import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 375, height: 812 } })

test('shows only the selected daily care modules and keeps the choice after reload', async ({ page }) => {
  await page.goto('/demo')
  await page.getByRole('button', { name: /設定/ }).click()
  await expect(page.getByText('若要讓這個帳號看見體重，還要在「每日照護顯示」開啟體重。', { exact: false })).toBeVisible()

  await page.locator('#daily-care-setting-bloodPressure').uncheck()
  await page.locator('#daily-care-setting-medication').uncheck()
  await page.locator('#daily-care-setting-nutrition').uncheck()

  await page.getByRole('button', { name: /照護/ }).click()
  await expect(page.getByRole('tab', { name: '體溫', exact: true })).toBeVisible()
  await expect(page.getByRole('tab', { name: '體重', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '體重', exact: true })).toHaveCount(0)
  await page.getByRole('tab', { name: '體重', exact: true }).click()
  await expect(page.getByRole('heading', { name: '最近紀錄', exact: true })).toBeVisible()
  await expect(page.getByRole('tab', { name: '血壓', exact: true })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: '服藥', exact: true })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: '飲食', exact: true })).toHaveCount(0)

  await page.reload()
  await expect(page.getByRole('tab', { name: '體溫', exact: true })).toBeVisible()
  await expect(page.getByRole('tab', { name: '體重', exact: true })).toBeVisible()
  await expect(page.getByRole('tab', { name: '血壓', exact: true })).toHaveCount(0)
})

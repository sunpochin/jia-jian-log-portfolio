/*
檔案用途：驗證內建瀏覽器登入提示會隨語系切換且只保留一種語言。
所在層：tests 根目錄的 Playwright 端對端測試層；模擬 Instagram WebView 的登入入口。
主要關聯：驗證 src/components/system/WebViewWarning.tsx 與共用 LanguageSwitcher 的實際瀏覽器行為。
*/
import { test, expect } from '@playwright/test'

test.use({
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Instagram 400.0.0.0.0 Mobile/15E148 Safari/604.1',
})

test('shows only the selected language in the WebView warning', async ({ page }) => {
  await page.goto('/')

  const zhTitle = page.getByText('⚠️ 內建瀏覽器限制：', { exact: true })
  const idTitle = page.getByText('⚠️ Peringatan Browser Internal:', { exact: true })

  await expect(zhTitle).toBeVisible()
  await expect(idTitle).toHaveCount(0)

  await page.getByRole('button', { name: 'Indo', exact: true }).click()

  await expect(idTitle).toBeVisible()
  await expect(zhTitle).toHaveCount(0)
  await expect(page.getByText('三個點', { exact: true })).toHaveCount(0)
})

/*
檔案用途：驗證未登入公開頁的 Google GIS 入口、雙語切換與初始瀏覽器錯誤。
所在層：tests 根目錄的 Playwright smoke 測試；保護登入前路徑不意外開放健康資料。
主要關聯：src/App.tsx、src/components/auth/GoogleSignInButton.tsx、LanguageSwitcher 與 Demo 入口。
*/
import { test, expect } from '@playwright/test'

// 為保護個人健康紀錄隱私，免登入 Guest 模式已全面退場。
// 未登入使用者只能看到登入畫面；Google 登入是正式入口，Demo 也不能直接讀取真實資料。

test('login screen renders the Google sign-in entry and hides guest access button', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: /家健錄 JiaJian Log|JiaJian Log/ })).toBeVisible()
  await expect(page.getByTestId('google-sign-in-entry')).toBeVisible()
  // GIS 官方按鈕由 Google iframe 產生；本站不再以自訂按鈕啟動 OAuth redirect。
  await expect(page.getByRole('button', { name: /Masuk dengan Google/ })).toHaveCount(0)
  // 驗證「看資料（免登入）」按鈕已完全移除，防止未授權訪客存取紀錄
  await expect(page.getByRole('button', { name: /Lihat Data|看資料/ })).toHaveCount(0)

  await page.getByRole('button', { name: 'Indo', exact: true }).click()
  await expect(page.getByText('Tekanan Darah', { exact: true })).toBeVisible()
  await expect(page.getByTestId('google-sign-in-entry')).toBeVisible()
  await expect(page.getByRole('button', { name: /Lihat Data|看資料/ })).toHaveCount(0)

  await page.getByRole('button', { name: '繁中', exact: true }).click()
  await expect(page.getByText('血壓量測紀錄', { exact: true })).toBeVisible()
})

test('no console errors on initial load', async ({ page }) => {
  const errors: string[] = []
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text()
      const locationUrl = msg.location().url
      // Google Identity Services SDK 在本地 127.0.0.1 測試埠號會印出網域未授權與 403 警示，此屬 GCP 設定而非程式碼瑕疵。
      const isGisLocalWarning =
        text.includes('GSI_LOGGER') ||
        text.includes('accounts.google.com') ||
        locationUrl.includes('accounts.google.com') ||
        locationUrl.includes('google') ||
        (text.includes('status of 403') && (!locationUrl || locationUrl.includes('accounts.google.com') || locationUrl.includes('google')))
      if (!isGisLocalWarning) {
        errors.push(text)
      }
    }
  })

  await page.goto('/')
  await page.waitForTimeout(1000)

  // Supabase logs a warning (not error) when env vars are placeholder —
  // only real console.error calls should fail this test.
  expect(errors).toEqual([])
})



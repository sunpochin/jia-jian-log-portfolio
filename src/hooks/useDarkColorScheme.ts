/*
檔案用途：追蹤使用者系統的深色偏好，供圖表選擇對比足夠的線條與座標色。
所在層：src/hooks；只讀瀏覽器媒體查詢，不保存任何偏好。
主要關聯：BloodPressureReportPanel 與各照護模組的趨勢面板共用，避免同一段監聽被複製多份。
*/
import { useEffect, useState } from 'react'

const DARK_QUERY = '(prefers-color-scheme: dark)'

export function useDarkColorScheme(): boolean {
  const [usesDarkColorScheme, setUsesDarkColorScheme] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(DARK_QUERY).matches,
  )

  useEffect(() => {
    const query = window.matchMedia(DARK_QUERY)
    const syncColorScheme = () => setUsesDarkColorScheme(query.matches)
    syncColorScheme()
    query.addEventListener('change', syncColorScheme)
    return () => query.removeEventListener('change', syncColorScheme)
  }, [])

  return usesDarkColorScheme
}

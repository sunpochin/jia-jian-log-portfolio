/*
檔案用途：定義 PWA 快捷入口的合法 URL 與安全解析規則。
所在層：src/lib 路由轉接層；只表達既有每日照護頁籤，不承載病人或授權資料。
主要關聯：vite.config.ts 的 manifest shortcuts、App.tsx 與 pwaShortcuts unit tests。
*/

export const PWA_SHORTCUT_PATHS = {
  bloodPressure: '/?tab=dailyCare&section=bloodPressure',
  medication: '/?tab=dailyCare&section=medication',
} as const

export type PwaShortcutTarget = {
  tab: 'dailyCare'
  section: 'bloodPressure' | 'medication'
}

export function resolvePwaShortcutTarget(search: string): PwaShortcutTarget | null {
  const params = new URLSearchParams(search)
  if (params.get('tab') !== 'dailyCare') return null

  const section = params.get('section')
  if (section !== 'bloodPressure' && section !== 'medication') return null
  return { tab: 'dailyCare', section }
}

export function consumePwaShortcutQuery(search: string): string {
  const params = new URLSearchParams(search)
  params.delete('tab')
  params.delete('section')
  const nextSearch = params.toString()
  return nextSearch ? '?' + nextSearch : ''
}

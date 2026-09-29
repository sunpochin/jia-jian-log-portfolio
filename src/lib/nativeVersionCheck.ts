/*
檔案用途：純函式比對原生殼內建版本與 canonical /version.json 回報的遠端版本，判斷是否顯示「請更新 App」提示。
所在層：src/lib 共用設定層；不做網路請求，只處理版本字串比較與顯示條件，供元件與測試共用同一份規則。
主要關聯：src/components/system/NativeUpdatePrompt.tsx、src/lib/appInfo.ts（APP_VERSION）、vite.config.ts 的 buildProvenancePlugin（產生 /version.json）。
*/

// 版本號固定用 "x.y.z" 語意化格式；缺段一律視為 0，避免 "1.17" 對 "1.17.0" 誤判成不同版本。
function parseVersionParts(version: string): number[] {
  return version.split('.').map(part => Number.parseInt(part, 10) || 0)
}

export function isRemoteVersionNewer(localVersion: string, remoteVersion: string): boolean {
  const local = parseVersionParts(localVersion)
  const remote = parseVersionParts(remoteVersion)
  const length = Math.max(local.length, remote.length)
  for (let index = 0; index < length; index += 1) {
    const localPart = local[index] ?? 0
    const remotePart = remote[index] ?? 0
    if (remotePart > localPart) return true
    if (remotePart < localPart) return false
  }
  return false
}

interface NativeUpdatePromptCondition {
  isNative: boolean
  localVersion: string
  // null 代表尚未取得（離線、CORS 失敗或還沒查詢過）；一律視為不顯示，不能拿「查不到」冒充「有新版本」。
  remoteVersion: string | null
}

export function shouldShowNativeUpdatePrompt({ isNative, localVersion, remoteVersion }: NativeUpdatePromptCondition): boolean {
  if (!isNative) return false
  if (!remoteVersion) return false
  return isRemoteVersionNewer(localVersion, remoteVersion)
}

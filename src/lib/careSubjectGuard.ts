/*
檔案用途：判斷目前照護對象是否仍可用於寫入健康資料，不可用時解析應換回哪一位。
所在層：src/lib 共用規則層；只做純判斷，不碰 Supabase、不保存偏好。
主要關聯：由 App.tsx 的分頁切換使用；可寫入清單來自 lib/auth 的 accessibleSubjects（已濾除歸檔對象）。

為什麼是防禦性檢查而非唯一防線：已封存對象現在只能透過 SettingsPage 的
ArchivedPatientHistoryPage 查看（見該檔案），那條路徑完全不呼叫 setActiveSubject／
onSubjectSelect，結構上就不會讓已封存對象進入這裡檢查的 activeSubject 狀態。
這個函式因此在正常操作下不會真的觸發重導向；保留它是為了在未來有人不小心
用含歸檔對象的清單接上某個 SubjectSwitcher 時，仍有一層會攔下來，而不是要靠它
才能避免 A1 那類「畫面顯示的人」與「實際寫入的人」不一致的錯置。
*/

/**
 * 解析目前照護對象是否可寫入；不可寫入時換回第一個可寫入對象。
 */
export function resolveWritableSubject(
  currentSubject: string,
  writableSubjectIds: string[],
): { subject: string; redirected: boolean } {
  if (!currentSubject || writableSubjectIds.includes(currentSubject)) return { subject: currentSubject, redirected: false }

  // 沒有任何可寫入對象時不硬換人；外層另有「家庭資料尚未完成設定」的守門畫面負責處理。
  const fallbackSubject = writableSubjectIds[0]
  if (!fallbackSubject) return { subject: currentSubject, redirected: false }

  return { subject: fallbackSubject, redirected: true }
}

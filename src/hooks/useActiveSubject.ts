/*
檔案用途：管理目前操作中的照護對象（activeSubject）選取、解析與切換，
包含展示模式的預設對象、依帳號持久化的偏好讀取，與封存對象的自動換回。
所在層：src/hooks；封裝 App.tsx 原本內嵌的 activeSubject state、解析 effect 與切換函式。
主要關聯：由 App.tsx 呼叫；依賴 lib/preferences/activeSubjectPreference、lib/careSubjectGuard
與 useAuth() 回傳的 subject／accessibleSubjects 等身分資料。
*/
import { useEffect, useState } from 'react'
import { DEMO_MEILING_PATIENT_ID, type Subject } from '../lib/auth'
import { readActivePatientPreference, resolveActivePatientPreference, saveActivePatientPreference } from '../lib/preferences/activeSubjectPreference'

interface UseActiveSubjectParams {
  isDemoMode: boolean
  userEmail: string | null | undefined
  subject: string | null
  accessibleSubjects: string[]
  effectiveAccessibleSubjects: string[]
  effectiveSubject: string | null
  effectiveSubjectsKey: string
}

export function useActiveSubject({
  isDemoMode,
  userEmail,
  subject,
  accessibleSubjects,
  effectiveAccessibleSubjects,
  effectiveSubject,
  effectiveSubjectsKey,
}: UseActiveSubjectParams) {
  const [activeSubject, setActiveSubject] = useState<Subject | null>(() => {
    if (typeof window !== 'undefined' && window.location.pathname === '/demo') {
      return DEMO_MEILING_PATIENT_ID
    }
    return null
  })

  useEffect(() => {
    if (isDemoMode) {
      // 不能只認王美玲／陳伯伯兩個固定 ID：展示模式現在還有 4 隻寵物範例，硬寫死會讓照護者選到寵物後
      // 被這個 effect 在下次重跑時強制切回王美玲，看起來像選取沒有生效。
      if (!activeSubject || !accessibleSubjects.includes(activeSubject)) {
        setActiveSubject(subject ?? DEMO_MEILING_PATIENT_ID)
      }
      return
    }
    if (!userEmail || !subject || !accessibleSubjects.length) {
      setActiveSubject(null)
      return
    }
    const fallback = effectiveAccessibleSubjects[0] ?? subject
    let cancelled = false

    void readActivePatientPreference(userEmail)
      .then(savedPatientId => {
        if (!cancelled) {
          const resolved = resolveActivePatientPreference(savedPatientId, effectiveAccessibleSubjects, fallback, effectiveSubject)
          setActiveSubject(resolved)
          if (savedPatientId && savedPatientId !== resolved && userEmail) {
            void saveActivePatientPreference(userEmail, resolved).catch(err => console.error('[save active patient fallback preference error]', err))
          }
        }
      })
      .catch(error => {
        console.error('[active patient preference read error]', error)
        if (!cancelled) setActiveSubject(fallback)
      })

    return () => { cancelled = true }
    // accessibleSubjects／activeSubject／effectiveAccessibleSubjects／effectiveSubject 刻意不列入依賴：
    // 前三者是每次 render 重新算出的陣列／物件（.filter()／.map() 沒有做 identity 快取），列進去會讓這個
    // effect 每次 render 都重跑；effectiveSubjectsKey 已是它們的穩定字串代理，只在實際內容改變時才變動。
    // 這個 effect 只該在「切換展示模式／病人清單、目前病人或帳號真的改變」時重新解析目前病人，
    // 不能因為陣列參照不同就反覆把使用者剛選好的對象重設掉。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemoMode, effectiveSubjectsKey, subject, userEmail])

  return { activeSubject, setActiveSubject }
}

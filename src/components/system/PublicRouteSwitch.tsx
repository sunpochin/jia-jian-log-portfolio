/*
檔案用途：免登入即可直接開啟的公開路由（隱私權、條款、健康資料聲明、版本頁、公開衛教頁、分享摘要頁）。
所在層：src/components/system；純路徑比對＋lazy 頁面掛載，不含任何登入或同意狀態判斷。
主要關聯：從 App.tsx 抽出（issue #764 App.tsx 拆分），必須在 App.tsx 的 loading／auth 判斷之前呼叫，
回傳 null 時代表目前路徑不是公開路由，App.tsx 應繼續往下判斷登入與同意流程。
*/
import { Suspense, lazy, type ComponentType, type ReactNode } from 'react'
import { useI18n, common } from '../../lib/i18n'

// 包裝 React.lazy 以提供網路出錯或版本更新時的自動重試機制；與 App.tsx 內其餘頁面共用同一份重試策略。
const lazyWithRetry = (importFn: () => Promise<{ default: ComponentType<any> }>) =>
  lazy(() =>
    importFn().catch((err) => {
      console.error('Failed to load chunk, retrying via reload...', err)
      window.location.reload()
      return { default: () => null }
    })
  )

// 條款／隱私／版本頁多半只被直接連結存取一次，不必進主要進入點的 bundle。
const PrivacyPage = lazyWithRetry(() => import('../../features/system-admin/pages/PrivacyPage').then(m => ({ default: m.PrivacyPage })))
const TermsPage = lazyWithRetry(() => import('../../features/system-admin/pages/TermsPage').then(m => ({ default: m.TermsPage })))
const HealthDataNoticePage = lazyWithRetry(() => import('../../features/system-admin/pages/HealthDataNoticePage').then(m => ({ default: m.HealthDataNoticePage })))
const ReleasesPage = lazyWithRetry(() => import('../../features/system-admin/pages/ReleasesPage').then(m => ({ default: m.ReleasesPage })))
// 公開衛教內容頁（issue #442）：免登入、不寫入資料，供搜尋引擎索引與訪客閱讀，底部附 CTA 導向 /demo。
const GuidesIndexPage = lazyWithRetry(() => import('../../features/system-admin/pages/guides/GuidesIndexPage').then(m => ({ default: m.GuidesIndexPage })))
const BloodPressure722GuidePage = lazyWithRetry(() => import('../../features/system-admin/pages/guides/BloodPressure722GuidePage').then(m => ({ default: m.BloodPressure722GuidePage })))
const CaregiverHandoverGuidePage = lazyWithRetry(() => import('../../features/system-admin/pages/guides/CaregiverHandoverGuidePage').then(m => ({ default: m.CaregiverHandoverGuidePage })))
const PetChronicDiseaseGuidePage = lazyWithRetry(() => import('../../features/system-admin/pages/guides/PetChronicDiseaseGuidePage').then(m => ({ default: m.PetChronicDiseaseGuidePage })))
const MedicationScheduleGuidePage = lazyWithRetry(() => import('../../features/system-admin/pages/guides/MedicationScheduleGuidePage').then(m => ({ default: m.MedicationScheduleGuidePage })))
const FamilyInvitationGuidePage = lazyWithRetry(() => import('../../features/system-admin/pages/guides/FamilyInvitationGuidePage').then(m => ({ default: m.FamilyInvitationGuidePage })))
// 唯讀分享連結接收頁（Stage 3b）：免登入、無寫入能力，token 只在瀏覽器記憶體短暫存在。
const ShareSummaryPage = lazyWithRetry(() => import('../../features/care-family/pages/ShareSummaryPage').then(m => ({ default: m.ShareSummaryPage })))

export function usePublicRoute(currentPath: string): ReactNode | null {
  const { text } = useI18n()
  const publicPageFallback = (
    <div className="h-dvh flex items-center justify-center bg-white text-gray-400 text-sm">
      {text(common.loading)}
    </div>
  )
  if (currentPath === '/privacy') return <Suspense fallback={publicPageFallback}><PrivacyPage /></Suspense>
  if (currentPath === '/terms') return <Suspense fallback={publicPageFallback}><TermsPage /></Suspense>
  if (currentPath === '/health-data-notice') return <Suspense fallback={publicPageFallback}><HealthDataNoticePage /></Suspense>
  // 版本頁只讀建置 metadata，必須在登入與 Supabase loading 前可直接開啟，方便回報 production build。
  if (currentPath === '/releases') return <Suspense fallback={publicPageFallback}><ReleasesPage /></Suspense>
  if (currentPath === '/guides') return <Suspense fallback={publicPageFallback}><GuidesIndexPage /></Suspense>
  if (currentPath === '/guides/blood-pressure-722') return <Suspense fallback={publicPageFallback}><BloodPressure722GuidePage /></Suspense>
  if (currentPath === '/guides/caregiver-handover') return <Suspense fallback={publicPageFallback}><CaregiverHandoverGuidePage /></Suspense>
  if (currentPath === '/guides/pet-chronic-disease') return <Suspense fallback={publicPageFallback}><PetChronicDiseaseGuidePage /></Suspense>
  if (currentPath === '/guides/medication-schedule') return <Suspense fallback={publicPageFallback}><MedicationScheduleGuidePage /></Suspense>
  if (currentPath === '/guides/family-invitations') return <Suspense fallback={publicPageFallback}><FamilyInvitationGuidePage /></Suspense>
  // 分享頁自己處理 token 交換與過期／無效狀態；不能先落入下面的登入或健康同意判斷。
  if (currentPath === '/share') return <Suspense fallback={publicPageFallback}><ShareSummaryPage /></Suspense>
  return null
}

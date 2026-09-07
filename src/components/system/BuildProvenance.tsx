/*
檔案用途：顯示目前前端 build 的版本、環境、提交與建置時間，協助照護問題快速對照部署。
所在層：src/components/system 共用系統資訊元件；不讀取 Supabase，也不改變照護流程狀態。
主要關聯：由 ReleasesPage 使用，資料來自 src/lib/appInfo.ts 的 Vite 建置注入值。
*/
import { APP_BUILD_TIME, APP_ENVIRONMENT, APP_GIT_SHA, APP_GIT_SHA_SHORT, APP_VERSION } from '../../lib/appInfo'
import { useI18n, type LocalizedText, type Locale } from '../../lib/i18n'

const ENVIRONMENT_LABELS: Record<string, LocalizedText> = {
  local: { id: 'Local', zh: '本機', en: 'Local' },
  development: { id: 'Development', zh: '開發環境', en: 'Development' },
  staging: { id: 'Staging', zh: '驗收環境', en: 'Staging' },
  preview: { id: 'Preview', zh: '預覽環境', en: 'Preview' },
  production: { id: 'Production', zh: '正式環境', en: 'Formal environment' },
}

function formatBuildTime(value: string, locale: Locale) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  // 固定台北時區，讓家屬截圖與 release log 對照時不會因手機時區不同而誤判 build 順序。
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-TW' : 'id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Taipei',
  }).format(date)
}

export function BuildProvenance() {
  const { text, locale } = useI18n()
  const environmentLabel = ENVIRONMENT_LABELS[APP_ENVIRONMENT] ?? { id: APP_ENVIRONMENT, zh: APP_ENVIRONMENT ,en: APP_ENVIRONMENT }

  return (
    <section className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4" aria-labelledby="build-provenance-title">
      <h2 id="build-provenance-title" className="text-sm font-black text-indigo-950">
        {text({ id: 'Build saat ini', zh: '目前建置版本', en: 'Build when this' })}
      </h2>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div className="min-w-0">
          <dt className="text-xs font-semibold text-indigo-700/70">{text({ id: 'Versi', zh: '版本', en: 'Version' })}</dt>
          <dd className="mt-0.5 font-mono font-bold text-indigo-950">v{APP_VERSION}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-semibold text-indigo-700/70">{text({ id: 'Lingkungan', zh: '環境', en: 'Environment' })}</dt>
          <dd className="mt-0.5 font-semibold text-indigo-950">{text(environmentLabel)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-semibold text-indigo-700/70">{text({ id: 'Commit', zh: '提交', en: 'Submit' })}</dt>
          <dd className="mt-0.5 break-all font-mono font-bold text-indigo-950" title={APP_GIT_SHA}>{APP_GIT_SHA_SHORT}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-semibold text-indigo-700/70">{text({ id: 'Dibuat', zh: '建置時間', en: 'Built On' })}</dt>
          <dd className="mt-0.5 font-semibold text-indigo-950">{formatBuildTime(APP_BUILD_TIME, locale)}</dd>
        </div>
      </dl>
    </section>
  )
}

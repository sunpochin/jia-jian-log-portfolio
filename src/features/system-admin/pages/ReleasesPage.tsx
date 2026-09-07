/*
檔案用途：公開顯示 release-please 版本變更與目前前端 build provenance。
所在層：src/features/system-admin/pages；與隱私權／服務條款同屬未登入可閱讀的公開頁面。
主要關聯：由 App.tsx 依 /releases 路徑呈現，讀取 CHANGELOG.md、BuildProvenance 與 appInfo.ts。
*/
import changelog from '../../../../CHANGELOG.md?raw'
import { BuildProvenance } from '../../../components/system/BuildProvenance'
import { LanguageSwitcher } from '../../../components/ui/LanguageSwitcher'
import { ReleaseVersion } from '../../../components/system/ReleaseVersion'
import { APP_GITHUB_RELEASES_URL } from '../../../lib/appInfo'
import { useI18n, type LocalizedText } from '../../../lib/i18n'
import { curatedReleaseNoteItems, resolveReleaseNoteItem, parseChangelog, type ReleaseNote } from '../../../lib/releaseNotes'

// 在 build time 讀取 CHANGELOG，避免公開頁面再依賴網路或登入狀態才能顯示版本歷史。
const RELEASE_NOTES = parseChangelog(changelog)

function sectionTitle(title: string, text: ReturnType<typeof useI18n>['text']) {
  const labels: Record<string, LocalizedText> = {
    features: { id: 'Fitur', zh: '新功能', en: 'New Features' },
    'bug fixes': { id: 'Perbaikan bug', zh: '錯誤修正', en: 'Bug Fixes' },
    fixes: { id: 'Perbaikan', zh: '修正', en: 'Fixes' },
    performance: { id: 'Peningkatan kinerja', zh: '效能改善', en: 'Performance Improvements' },
    'performance improvements': { id: 'Peningkatan kinerja', zh: '效能改善', en: 'Performance Improvements' },
    documentation: { id: 'Dokumentasi', zh: '文件更新', en: 'Document Updates' },
    engineering: { id: 'Informasi teknis', zh: '工程資訊', en: 'Engineering information' },
    chores: { id: 'Pemeliharaan', zh: '維護工作', en: 'Maintenance' },
    changes: { id: 'Perubahan', zh: '變更', en: 'Changes' },
    reverts: { id: 'Pembatalan perubahan', zh: '還原變更', en: 'Reverts' },
    'reliability and operations': { id: 'Keandalan dan operasional', zh: '可靠性與維運', en: 'Reliability & Maintenance' },
  }
  return text(labels[title.toLowerCase()] ?? { id: title, zh: title, en: title })
}

export function ReleasesPage() {
  const { text } = useI18n()

  const goHome = () => {
    window.location.href = '/'
  }

  return (
    <div className="min-h-dvh bg-gray-50 text-gray-900">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white px-4 py-3 shadow-xs">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <button
            type="button"
            onClick={goHome}
            className="flex min-h-11 items-center gap-1 text-sm font-bold text-gray-700 hover:text-gray-900 active:text-blue-600"
          >
            <span aria-hidden="true">←</span>
            <span>{text({ id: 'Kembali ke Beranda', zh: '返回首頁', en: 'Back to Home' })}</span>
          </button>
          <LanguageSwitcher />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-8">
        <article className="space-y-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm md:p-8">
          <div>
            <span className="inline-block rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-extrabold text-indigo-700">
              {text({ id: 'Rilis & informasi build', zh: '版本與建置資訊', en: 'Version and build information' })}
            </span>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-gray-900 md:text-3xl">
              {text({ id: 'Catatan Rilis', zh: '版本更新說明', en: 'Release notes' })}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">
              {text({
                id: 'Lihat perubahan di setiap rilis dan kenali build yang sedang berjalan di perangkat ini.',
                zh: '查看每次版本的變更，也能確認這台裝置目前實際執行的版本。', en: 'You can also check the version of this device that is currently running by reviewing each version of the change.',
              })}
            </p>
          </div>

          <BuildProvenance />

          <section aria-labelledby="release-history-title">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 id="release-history-title" className="text-lg font-black text-gray-900">
                {text({ id: 'Riwayat rilis', zh: '版本歷史', en: 'Version History' })}
              </h2>
              <a
                href={APP_GITHUB_RELEASES_URL}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-semibold text-blue-700 underline underline-offset-2"
              >
                {text({ id: 'Rilis GitHub ↗', zh: 'GitHub 版本 ↗', en: 'GitHub Version ↗' })}
              </a>
            </div>

            <div className="mt-4 space-y-4">
              {RELEASE_NOTES.length > 0
                ? RELEASE_NOTES.map(release => <ReleaseCard key={release.version + '-' + (release.date ?? 'undated')} release={release} />)
                : (
                  <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-5 text-sm leading-relaxed text-gray-600">
                    {text({
                      id: 'Release-please belum menulis entri versi. PR rilis berikutnya akan muncul di sini secara otomatis.',
                      zh: 'release-please 尚未寫入版本條目；之後的版本 PR 會自動顯示在這裡。', en: 'release-please has not yet written a version entry; subsequent version PRs will automatically appear here.',
                    })}
                  </div>
                )}
            </div>
          </section>

          <footer className="border-t border-gray-100 pt-5 text-center text-xs text-gray-400">
            <ReleaseVersion />
          </footer>
        </article>
      </main>
    </div>
  )
}

function ReleaseCard({ release }: { release: ReleaseNote }) {
  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-4 shadow-xs">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-black text-gray-900">
          {release.url
            ? <a href={release.url} target="_blank" rel="noreferrer" className="text-blue-700 underline underline-offset-2">v{release.version} ↗</a>
            : 'v' + release.version}
        </h3>
        {release.date && <time className="text-xs font-semibold text-gray-400">{release.date}</time>}
      </div>

      <div className="mt-4 space-y-4">
        {release.sections.map(section => (
          <ReleaseSection key={section.title} release={release} section={section} />
        ))}
      </div>
    </article>
  )
}

function ReleaseSection({ release, section }: { release: ReleaseNote; section: ReleaseNote['sections'][number] }) {
  const { text } = useI18n()
  const curatedItems = curatedReleaseNoteItems(release.version, section.title)
  // 為什麼一定要有 fallback：curated 翻譯要等人工事後補上，若沒有 fallback，
  // 每次發版在補完翻譯前，這裡就會沒有任何內容可顯示，等於重演「雙語摘要正在整理中」的舊 bug。
  // curated 一律視為已人工確認過的翻譯；未 curated 的條目改用 resolveReleaseNoteItem，
  // 未翻譯時會標示 translated: false，讓畫面用「尚未翻譯」註記，不冒充成正式翻譯。
  const displayItems = curatedItems
    ? curatedItems.map(item => ({ text: item, translated: true }))
    : section.items.map(resolveReleaseNoteItem)

  if (displayItems.length === 0) return null

  return (
    <section>
      <h4 className="text-sm font-bold text-gray-800">{sectionTitle(section.title, text)}</h4>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-gray-600">
        {displayItems.map((item, index) => (
          <li key={section.title + '-' + index}>
            {text(item.text)}
            {!item.translated && (
              <span className="ml-1 text-xs font-semibold text-gray-400">
                ({text({ id: 'belum diterjemahkan', zh: '尚未翻譯', en: 'Untranslated' })})
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

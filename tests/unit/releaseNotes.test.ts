/*
檔案用途：驗證 release-please CHANGELOG 的版本標題、分類與條列轉接。
所在層：tests/unit；只測純函式，不需要瀏覽器、Supabase 或登入狀態。
主要關聯：src/lib/releaseNotes.ts 與公開 /releases 頁面的資料呈現。
*/
import { describe, expect, test } from 'bun:test'
import { curatedReleaseNoteItems, localizedReleaseNoteItem, parseChangelog, resolveReleaseNoteItem } from '../../src/lib/releaseNotes'

describe('release notes parser', () => {
  test('parses release-please linked headings and categories', () => {
    const notes = parseChangelog([
      '# Changelog',
      '',
      '## [1.2.0](https://github.com/example/releases/tag/v1.2.0) (2026-08-12)',
      '',
      '### Features',
      '* add a release page',
      '',
      '### Bug Fixes',
      '- keep the build commit visible',
    ].join('\n'))

    expect(notes).toEqual([{
      version: '1.2.0',
      url: 'https://github.com/example/releases/tag/v1.2.0',
      date: '2026-08-12',
      sections: [
        { title: 'Features', items: ['add a release page'] },
        { title: 'Bug Fixes', items: ['keep the build commit visible'] },
      ],
    }])
  })

  test('keeps a plain hand-written release and ignores empty sections', () => {
    const notes = parseChangelog([
      '## v1.1.1 - 2026-08-01',
      '### Notes',
      '### Empty',
      '- first note',
    ].join('\n'))

    expect(notes).toEqual([{
      version: '1.1.1',
      date: '2026-08-01',
      sections: [{ title: 'Empty', items: ['first note'] }],
    }])
  })

  test('returns no entries when the changelog has no release bullets', () => {
    expect(parseChangelog('# Changelog\\n\\nNo entries yet.')).toEqual([])
  })

  test('keeps a bullet that has no category heading under a generic "Changes" section', () => {
    // release-please 格式若曾經變動、漏印 ### 分類標題，條目仍不能靜默消失。
    const notes = parseChangelog([
      '## v1.0.5 - 2026-07-20',
      '- fixed a typo with no category heading above it',
    ].join('\n'))

    expect(notes).toEqual([{
      version: '1.0.5',
      date: '2026-07-20',
      sections: [{ title: 'Changes', items: ['fixed a typo with no category heading above it'] }],
    }])
  })

  test('reads explicit bilingual metadata without exposing the source summary', () => {
    expect(localizedReleaseNoteItem('add a release page <!-- id: Tambahkan halaman rilis | zh: 新增版本更新頁面 -->')).toEqual({
      id: 'Tambahkan halaman rilis',
      zh: '新增版本更新頁面',
     en: 'add a release page',
    })
  })

  test('does not treat an untranslated summary as localized content', () => {
    expect(localizedReleaseNoteItem('add a release page')).toBeNull()
  })

  test('uses verified version summaries instead of generated commit titles', () => {
    // 為什麼固定最新版本：每次正式發布都必須確認人工三語摘要已接到版本頁，避免誤用未翻譯的 CHANGELOG fallback。
    expect(curatedReleaseNoteItems('1.15.1', 'Bug Fixes')).toHaveLength(2)
    expect(curatedReleaseNoteItems('1.2.3', 'Bug Fixes')).toHaveLength(2)
    expect(curatedReleaseNoteItems('1.2.2', 'Bug Fixes')).toHaveLength(2)
    expect(curatedReleaseNoteItems('1.2.0', 'Features')).toHaveLength(3)
    expect(curatedReleaseNoteItems('1.2.1', 'Bug Fixes')).toHaveLength(2)
    // 1.20.0 會觸發全帳號重新同意隱私告知；摘要沒接上的話，看護在 /releases 只看到未翻譯的工程條目。
    expect(curatedReleaseNoteItems('1.20.0', 'Features')).toHaveLength(3)
    expect(curatedReleaseNoteItems('1.20.0', 'Bug Fixes')).toHaveLength(6)
    // 1.20.1 是正式環境實際收到的版本（1.20.0 的 promotion 被 #981 審查攔下後才修正發布）。
    expect(curatedReleaseNoteItems('1.20.1', 'Bug Fixes')).toHaveLength(1)
    expect(curatedReleaseNoteItems('9.9.9', 'Features')).toBeNull()
  })

  test('removes generated PR and commit references before fallback use', () => {
    expect(localizedReleaseNoteItem('add a release page ([#162](https://github.com/example/issues/162)) ([abc123](https://github.com/example/commit/abc123))')).toBeNull()
  })

  test('drops a bullet repeated in the same section when only the commit hash differs', () => {
    // release-please 有時會把同一句修正訊息拆成多個 commit 各記一次，畫面上只是重複的雜訊。
    const notes = parseChangelog([
      '## [1.17.0](https://example.com/v1.17.0) (2026-09-14)',
      '',
      '### Bug Fixes',
      '* fix silent overwrite in shared catalog ([4ade889](https://example.com/commit/4ade889))',
      '* fix silent overwrite in shared catalog ([4913ce2](https://example.com/commit/4913ce2))',
    ].join('\n'))

    expect(notes[0].sections[0].items).toEqual(['fix silent overwrite in shared catalog ([4ade889](https://example.com/commit/4ade889))'])
  })

  test('drops a bullet repeated with only a trailing "closes #issue" reference added', () => {
    const notes = parseChangelog([
      '## [1.17.0](https://example.com/v1.17.0) (2026-09-14)',
      '',
      '### Bug Fixes',
      '* redirect to settings when disabled ([1196869](https://example.com/commit/1196869))',
      '* redirect to settings when disabled ([dfb5b73](https://example.com/commit/dfb5b73)), closes [#752](https://example.com/issues/752)',
    ].join('\n'))

    expect(notes[0].sections[0].items).toEqual(['redirect to settings when disabled ([1196869](https://example.com/commit/1196869))'])
  })

  test('does not merge two distinct bullets just because one has "closes #issue" in the middle of its text', () => {
    // 迴歸測試：TRAILING_ISSUE_REFERENCE 一定要錨定在字尾，否則會把「closes #N」出現在句子中間、
    // 語意其實不同的兩則條目誤判成重複而漏顯示一則。
    const notes = parseChangelog([
      '## [1.17.0](https://example.com/v1.17.0) (2026-09-14)',
      '',
      '### Bug Fixes',
      '* fix that closes [#100](https://example.com/issues/100) but also needs extra care ([aaa1111](https://example.com/commit/aaa1111))',
      '* fix that but also needs extra care ([bbb2222](https://example.com/commit/bbb2222))',
    ].join('\n'))

    expect(notes[0].sections[0].items).toHaveLength(2)
  })

  test('keeps two bullets in the same section when their visible text actually differs', () => {
    const notes = parseChangelog([
      '## [1.17.0](https://example.com/v1.17.0) (2026-09-14)',
      '',
      '### Bug Fixes',
      '* hide Vision OCR entry point, pending API key ([ecfa55c](https://example.com/commit/ecfa55c))',
      '* hide Vision OCR entry point, pending GOOGLE_CLOUD_VISION_API_KEY ([b441a1d](https://example.com/commit/b441a1d))',
    ].join('\n'))

    expect(notes[0].sections[0].items).toHaveLength(2)
  })

  test('resolveReleaseNoteItem never returns empty content, so a fresh release never blocks on manual translation', () => {
    expect(resolveReleaseNoteItem('add a release page <!-- id: Tambahkan halaman rilis | zh: 新增版本更新頁面 -->')).toEqual({
      text: { id: 'Tambahkan halaman rilis', zh: '新增版本更新頁面', en: 'add a release page' },
      translated: true,
    })

    expect(resolveReleaseNoteItem('add a release page ([#162](https://github.com/example/issues/162)) ([abc123](https://github.com/example/commit/abc123))')).toEqual({
      text: { id: 'add a release page', zh: 'add a release page', en: 'add a release page' },
      translated: false,
    })
  })
})

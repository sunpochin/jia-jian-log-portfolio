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
    expect(curatedReleaseNoteItems('1.2.3', 'Bug Fixes')).toHaveLength(2)
    expect(curatedReleaseNoteItems('1.2.2', 'Bug Fixes')).toHaveLength(2)
    expect(curatedReleaseNoteItems('1.2.0', 'Features')).toHaveLength(3)
    expect(curatedReleaseNoteItems('1.2.1', 'Bug Fixes')).toHaveLength(2)
    expect(curatedReleaseNoteItems('9.9.9', 'Features')).toBeNull()
  })

  test('removes generated PR and commit references before fallback use', () => {
    expect(localizedReleaseNoteItem('add a release page ([#162](https://github.com/example/issues/162)) ([abc123](https://github.com/example/commit/abc123))')).toBeNull()
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

/*
檔案用途：把 release-please 產生的 CHANGELOG.md 轉成 release 頁面可呈現的資料。
所在層：src/lib 共用資料轉接層；不負責載入網路資料或決定畫面樣式。
主要關聯：由 ReleasesPage 使用，並由單元測試固定 release-please 常見的 Markdown 結構；
人工彙整的三語文案資料放在 ./releaseNoteSummaries（純資料檔，見 issue #839）。
*/

import type { LocalizedText } from './i18n'
import { CURATED_RELEASE_SUMMARIES } from './releaseNoteSummaries'

export type ReleaseNoteSection = {
  title: string
  items: string[]
}

export type ReleaseNote = {
  version: string
  date?: string
  url?: string
  sections: ReleaseNoteSection[]
}

export function curatedReleaseNoteItems(version: string, sectionTitle: string): LocalizedText[] | null {
  return CURATED_RELEASE_SUMMARIES[version]?.[sectionTitle.toLowerCase()] ?? null
}

// release-please 的摘要通常只有提交者使用的單一語言，只有補上這段 metadata 才算是人工確認過的翻譯。
const LOCALIZED_ITEM_METADATA = /<!--\s*id:\s*(.*?)\s*\|\s*zh:\s*(.*?)\s*-->\s*$/i

export function localizedReleaseNoteItem(item: string): LocalizedText | null {
  const match = item.match(LOCALIZED_ITEM_METADATA)
  if (!match) return null

  const id = match[1].trim()
  const zh = match[2].trim()
  // CHANGELOG 條目本身通常是英文，保留它作為第三語系，避免把印尼文 metadata 誤當英文顯示。
  const en = item.replace(LOCALIZED_ITEM_METADATA, '').trim()
  return id && zh ? { id, zh, en: en || id } : null
}

// release-please 產生的條目常帶 PR／commit 連結參照，顯示原文前先清掉這些雜訊。
const GENERATED_REFERENCE = /\s*\(\[#\d+\]\([^)]*\)\)|\s*\(\[[0-9a-f]+\]\([^)]*\)\)/gi

// 為什麼一定要有 fallback：curated 翻譯與逐條 metadata 都需要人工事後補上，若沒有 fallback，
// 每次發版在人工補完翻譯前，畫面就會回到「雙語摘要正在整理中」的空白提示。原文（通常是英文）
// 先頂上讓使用者「馬上」看到內容，但 translated: false 會讓畫面標示「尚未翻譯」，
// 不會把未經確認的原文冒充成中文／印尼文翻譯（避免照護語意被誤解）。
export function fallbackReleaseNoteItem(item: string): LocalizedText {
  const plain = item.replace(LOCALIZED_ITEM_METADATA, '').replace(GENERATED_REFERENCE, '').trim()
  return { id: plain, zh: plain, en: plain }
}

export type ReleaseNoteDisplayItem = {
  text: LocalizedText
  // false 代表 text 是未翻譯原文（兩個語系顯示相同內容），畫面要標示出來，不能當成已確認的翻譯。
  translated: boolean
}

export function resolveReleaseNoteItem(item: string): ReleaseNoteDisplayItem {
  const localized = localizedReleaseNoteItem(item)
  return localized ? { text: localized, translated: true } : { text: fallbackReleaseNoteItem(item), translated: false }
}

function parseReleaseHeading(line: string): Omit<ReleaseNote, 'sections'> | null {
  const linkedHeading = line.match(/^##\s+\[([^\]]+)\]\(([^)]+)\)(?:\s+\(([^)]+)\))?\s*$/)
  if (linkedHeading) {
    if (!isReleaseVersion(linkedHeading[1])) return null
    return {
      version: normalizeVersion(linkedHeading[1]),
      url: linkedHeading[2],
      ...(linkedHeading[3] ? { date: linkedHeading[3] } : {}),
    }
  }

  const plainHeading = line.match(/^##\s+\[?([^\s\]]+)\]?(?:\s+-\s*(.+))?\s*$/)
  if (!plainHeading) return null
  if (!isReleaseVersion(plainHeading[1])) return null

  return {
    version: normalizeVersion(plainHeading[1]),
    ...(plainHeading[2] ? { date: plainHeading[2] } : {}),
  }
}

function normalizeVersion(value: string) {
  return value.replace(/^v/i, '')
}

function isReleaseVersion(value: string) {
  return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(normalizeVersion(value))
}

// release-please 有時會把同一句修正訊息在同一版本寫入兩次（例如同一個修正被拆成多個 commit、
// 或補上 "closes #xxx" 收尾後又重新產生一條），差異只在 commit hash 或收尾的 issue 參照；
// 去重時把這些雜訊一併忽略，避免 /releases 頁面對使用者顯示同一句話兩次。
// 一定要錨定在字尾（$）：這個片語也可能是條目本身有意義的一部分（例如「fix that closes
// #100 but also needs extra care」），只清掉 release-please 附加在句尾的收尾雜訊，
// 不能整段拿掉，否則會把兩則語意不同的條目誤判成重複而漏顯示。
const TRAILING_ISSUE_REFERENCE = /,?\s*closes\s+\[#\d+\]\([^)]*\)\s*$/gi

function normalizeForDedupe(item: string): string {
  return item
    .replace(LOCALIZED_ITEM_METADATA, '')
    .replace(GENERATED_REFERENCE, '')
    .replace(TRAILING_ISSUE_REFERENCE, '')
    .trim()
}

function dedupeItems(items: string[]): string[] {
  const seen = new Set<string>()
  const deduped: string[] = []
  for (const item of items) {
    const key = normalizeForDedupe(item)
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(item)
  }
  return deduped
}

// 只解析 release-please 需要的標題與條列，保留 commit 原文，避免為了 render Markdown 再引入一套依賴。
export function parseChangelog(markdown: string): ReleaseNote[] {
  const releases: ReleaseNote[] = []
  let currentRelease: ReleaseNote | null = null
  let currentSection: ReleaseNoteSection | null = null

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim()
    const releaseHeading = parseReleaseHeading(line)
    if (releaseHeading) {
      currentRelease = { ...releaseHeading, sections: [] }
      releases.push(currentRelease)
      currentSection = null
      continue
    }

    if (!currentRelease) continue

    const sectionHeading = line.match(/^###\s+(.+?)\s*$/)
    if (sectionHeading) {
      currentSection = { title: sectionHeading[1], items: [] }
      currentRelease.sections.push(currentSection)
      continue
    }

    const item = line.match(/^[-*]\s+(.+?)\s*$/)
    if (!item) continue

    // 沒有分類標題的手寫條目仍要可見，避免 release-please 格式變動時整段內容靜默消失。
    if (!currentSection) {
      currentSection = { title: 'Changes', items: [] }
      currentRelease.sections.push(currentSection)
    }
    currentSection.items.push(item[1])
  }

  return releases
    .map(release => ({
      ...release,
      sections: release.sections
        .map(section => ({ ...section, items: dedupeItems(section.items) }))
        .filter(section => section.items.length > 0),
    }))
    .filter(release => release.sections.length > 0)
}

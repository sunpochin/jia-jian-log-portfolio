/*
檔案用途：測試三語系（zh／id／en）切換、預設語系解析、localStorage 讀取、通用字典結構與 src 文案的英文欄位掃描。
所在層：tests/unit 單元測試層。
主要關聯：驗證 src/lib/i18n.tsx 邏輯。
*/
import { beforeEach, describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { common, initialLocale, localized, resolveInitialLocale, type LocalizedText } from '../../src/lib/i18n'
import { I18N_SHARED_ID_EN_WORDS } from './fixtures/i18nSharedWords'

// 多條文案掃描共用同一份 src 快取；path 用相對 src/ 的路徑，失敗訊息才能直接定位檔案。
let sourceFilesCache: Array<{ path: string; source: string }> | null = null
function readSourceFiles() {
  if (sourceFilesCache) return sourceFilesCache
  const sourceRoot = new URL('../../src/', import.meta.url)
  const files: Array<{ path: string; source: string }> = []
  const visit = (url: URL) => {
    for (const entry of readdirSync(url)) {
      const child = new URL(`${entry}${entry.includes('.') ? '' : '/'}`, url)
      if (statSync(child).isDirectory()) visit(child)
      else if (/\.(ts|tsx)$/.test(entry)) files.push({ path: child.href.slice(sourceRoot.href.length), source: readFileSync(child, 'utf8') })
    }
  }
  visit(sourceRoot)
  sourceFilesCache = files
  return files
}

let storageMock: Record<string, string> = {}
let storageThrows = false

if (typeof globalThis.localStorage === 'undefined') {
  ;(globalThis as any).localStorage = {
    getItem(key: string) {
      if (storageThrows) throw new Error('SecurityError')
      return storageMock[key] ?? null
    },
    setItem(key: string, value: string) {
      if (storageThrows) throw new Error('SecurityError')
      storageMock[key] = value
    },
  }
}

describe('i18n helpers and initial locale resolution', () => {
  beforeEach(() => {
    storageMock = {}
    storageThrows = false
  })

  test('selects Indonesian and Traditional Chinese from one canonical pair', () => {
    const label = { id: 'Simpan', zh: '儲存' ,en: "Save" }
    expect(localized(label, 'id')).toBe('Simpan')
    expect(localized(label, 'zh')).toBe('儲存')
  })

  test('falls back to the other language when runtime copy is missing the selected translation', () => {
    const incompleteLabel = { id: 'Simpan', zh: '' ,en: "Save" } as LocalizedText
    expect(localized(incompleteLabel, 'zh')).toBe('Simpan')
  })

  test('uses Traditional Chinese on a first visit but preserves an explicit language choice', () => {
    expect(resolveInitialLocale(null)).toBe('zh')
    expect(resolveInitialLocale('id')).toBe('id')
    expect(resolveInitialLocale('zh')).toBe('zh')
    expect(resolveInitialLocale('en')).toBe('en')
  })

  test('initialLocale reads from localStorage and falls back safely when restricted', () => {
    expect(initialLocale()).toBe('zh')

    storageMock['bp-tracker.locale'] = 'id'
    expect(initialLocale()).toBe('id')

    storageThrows = true
    expect(initialLocale()).toBe('zh')
  })

  test('verifies common localized dictionary entries', () => {
    expect(common.language.id).toBe('Indo')
    expect(common.language.zh).toBe('繁中')
    expect(common.days(7).id).toBe('7 hari')
    expect(common.days(7).zh).toBe('7 天')
  })

  test('keeps English UI values free of placeholders and Chinese fallback text', () => {
    // 為什麼掃描原始字典：英文欄位若退回佔位或中文，畫面仍能渲染但英文使用者會看不懂，型別檢查抓不到這種回退。
    const files = readSourceFiles().map(file => file.source)
    // 單引號與雙引號都要掃：先前只比對 `en: '...'`，批次補上的 `en: "..."`（約兩百多筆）整批躲過這條檢查。
    const englishValues = files.flatMap(source => [...source.matchAll(/en:\s*(['"])((?:\\.|(?!\1)[^\\])*)\1/g)].map(match => match[2]))
    expect(englishValues.some(value => value.includes('[EN:'))).toBe(false)
    expect(englishValues.some(value => /[\u4e00-\u9fff]/.test(value))).toBe(false)
    // 動態值必須使用 template literal；一般引號會把 ${...} 當成看得見的原文字串。
    expect(files.some(source => /en:\s*'[^'\n]*\$\{/.test(source) || /en:\s*"[^"\n]*\$\{/.test(source))).toBe(false)
  })

  test('en 欄位與 id 完全相同時，必須是允許清單裡的國際通用字', () => {
    // 為什麼：en 若直接照抄 id 的印尼文，畫面照樣能渲染、型別也過，英文使用者卻看到看不懂的字
    // （issue #920 稽核出 AdminPage「Tanggal daftar」等）。但單位、醫學縮寫、品牌名本來就兩語相同，
    // 所以用明確允許清單，而不是要求 en 一律不同；新增項目前先確認它在印尼文與英文都真的一樣。
    const allowedIdenticalValues = new Set([
      '', '%', '—', 'kg', 'kcal', 'ml', 'mg/dL', // 單位與空白佔位
      'Normal', '✓ Normal', 'Insulin', 'Insulin (unit)', 'Total insulin', 'Total:', 'Tablet', 'Vitamin', 'HbA1c', 'Hemoglobin (Hb)', // 兩語同形的醫療用語
      'Premium', 'Family Health Note', 'Mog-Nee', // 方案與品牌名
      'Local', 'Development', 'Staging', 'Preview', // 部署環境名稱
    ])
    const literal = /\{\s*id:\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1\s*,\s*zh:\s*(['"`])(?:\\.|(?!\3)[^\\])*\3\s*,\s*en:\s*(['"`])((?:\\.|(?!\4)[^\\])*)\4\s*,?\s*\}/g
    const pairs = readSourceFiles().flatMap(({ path, source }) => [...source.matchAll(literal)].map(match => ({ path, id: match[2], en: match[5] })))
    // 至少要比對到大量字典，否則 regex 失效時這條測試會靜默通過（目前約 2,200 筆）。
    expect(pairs.length).toBeGreaterThan(2000)
    const copied = pairs
      .filter(pair => pair.id === pair.en && !allowedIdenticalValues.has(pair.en) && !/^n=\$\{[^}]+\}$/.test(pair.en))
      .map(pair => `${pair.path}: ${pair.en}`)
    expect(copied).toEqual([])
  })

  test('已審過的元件不得把印尼文原樣複製到 en 欄位', () => {
    // 為什麼在全庫檢查之外還要逐檔列：上一條全庫檢查只要求「比對數 > 2000」，鍵順序或寫法不同的物件
    // 會被靜默跳過；這裡對最敏感的分享同意／隱私告知文字要求「比對數 = en 鍵數」，一個都不能漏，
    // 而且不套用 mmHg、Normal 等允許清單（這些檔案裡不該有兩語相同的字串）。
    // 分享同意文字（CONSENT_NOTICE）已從元件搬到 shareConsentNotice.ts、公開隱私告知在 sharePrivacyNotice.ts（#922）；
    // 這兩個檔案才是最需要逐鍵審過的文字，一起列入，避免搬家後同意文字悄悄離開這道檢查。
    const auditedFiles = [
      'features/care-family/components/ShareLinkManagement.tsx',
      'features/care-family/shareConsentNotice.ts',
      'features/system-admin/sharePrivacyNotice.ts',
    ]
    const literal = /\{\s*id:\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1\s*,\s*zh:\s*(['"`])(?:\\.|(?!\3)[^\\])*\3\s*,\s*en:\s*(['"`])((?:\\.|(?!\4)[^\\])*)\4\s*,?\s*\}/g
    for (const file of auditedFiles) {
      const source = readFileSync(new URL(`../../src/${file}`, import.meta.url), 'utf8')
      const pairs = [...source.matchAll(literal)].map(match => ({ id: match[2], en: match[5] }))
      // 比對數必須等於檔案裡每一個 en 鍵，不能只求「有比到東西」：多行物件結尾逗號（如 CONSENT_NOTICE）
      // 曾讓 regex 靜默跳過最重要的同意文字，數量門檻卻照樣通過。鍵的順序或寫法不同時這裡會失敗，
      // 要先調整 regex，不要放寬這個等式。
      const englishKeys = [...source.matchAll(/\ben:\s*['"`]/g)].length
      expect(pairs.length).toBe(englishKeys)
      const copied = pairs.filter(pair => pair.id === pair.en).map(pair => `${file}: ${pair.en}`)
      expect(copied).toEqual([])
    }
  })

  test('en 欄位不得混入印尼文字詞', () => {
    // 為什麼另外掃字詞：上一條只抓「整句照抄」，抓不到機器翻譯留下的半印半英（例如
    // 「Could not mencabut tautan.」「Select diri sendiri or penerima care…」）。這條掃描每一個 en 鍵，
    // 不限物件寫法或鍵順序，所以多行、結尾逗號或 zh／en／id 順序的字典也不會被靜默跳過。
    //
    // 主要防線是「兩語共用字詞」：把所有 id 文案（緊接 zh 的 { id, zh } 字典）與所有 en 文案拆成字詞取交集，
    // 交集只能是 fixtures/i18nSharedWords.ts 允許的外來語／專有名詞。手寫印尼文字詞清單一定會漏
    // （Codex 在 PR #924 指出 dimuat、Sistem、dulu、Koneksi 都不在舊清單），而這個交集會自動涵蓋
    // app 用過的全部印尼文詞彙（約 1,700 個）。下方手寫清單保留作第二道網，抓「還沒出現在任何 id 文案」的常見詞。
    const tokens = (value: string) => (value.replace(/\$\{[^}]*\}/g, ' ').match(/[A-Za-z]{3,}/g) ?? []).map(word => word.toLowerCase())
    const indonesianVocabulary = new Set(readSourceFiles().flatMap(({ source }) =>
      [...source.matchAll(/\bid:\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1(?=\s*,\s*zh:)/g)].flatMap(match => tokens(match[2]))))
    // 至少要收集到大量詞彙，否則 regex 失效時交集永遠為空、測試靜默通過。
    expect(indonesianVocabulary.size).toBeGreaterThan(1000)
    const englishValues = readSourceFiles().flatMap(({ path, source }) =>
      [...source.matchAll(/\ben:\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)].map(match => ({ path, value: match[2] })))
    const unexpectedSharedWords = englishValues.flatMap(({ path, value }) => tokens(value)
      .filter(word => indonesianVocabulary.has(word) && !I18N_SHARED_ID_EN_WORDS.has(word))
      .map(word => `${word} ← ${path}: ${value}（若確定是英文外來語／專有名詞，加入 tests/unit/fixtures/i18nSharedWords.ts）`))
    expect(unexpectedSharedWords).toEqual([])

    // 第二道網：首字母大小寫都算，其餘必須小寫，避免撞到 ADA 之類的縮寫。
    const indonesianWords = [
      'ada', 'akan', 'anak', 'anda', 'atau', 'atur', 'batal', 'belum', 'bentuk', 'berhasil', 'berlaku', 'bisa', 'buka',
      'catatan', 'coba', 'daftar', 'dapat', 'darah', 'dengan', 'dari', 'disalin', 'dosis', 'foto', 'gagal', 'hapus',
      'ingin', 'jadwal', 'jendela', 'kami', 'kelola', 'keluarga', 'kembali', 'kirim', 'lagi', 'lansia', 'laporan',
      'manajemen', 'mencabut', 'mendukung', 'menyalin', 'menyimpan', 'memuat', 'obat', 'oleh', 'orang', 'pada',
      'pembacaan', 'pengasuh', 'pengguna', 'pilih', 'rentang', 'resep', 'sedang', 'sekarang', 'selesai', 'silakan',
      'simpan', 'sudah', 'tambah', 'tautan', 'tekanan', 'terakhir', 'terdaftar', 'tidak', 'timpa', 'tutup', 'ubah',
      'undangan', 'untuk', 'wali', 'warna', 'yakin', 'yang',
      // PR #924 Codex review 找到的機器翻譯殘留
      'dimuat', 'dulu', 'koneksi', 'konfigurasi', 'nanti', 'saring', 'sistem', 'tahu',
    ]
    const marker = new RegExp(`\\b(?:${indonesianWords.map(word => `[${word[0].toUpperCase()}${word[0]}]${word.slice(1)}`).join('|')})\\b`)
    const leaks = englishValues
      .filter(({ value }) => marker.test(value.replace(/\$\{[^}]*\}/g, '')))
      .map(({ path, value }) => `${path}: ${value}`)
    expect(leaks).toEqual([])
  })

  test('id 欄位不得混入英文句子片段', () => {
    // 為什麼：印尼文是看護每天使用的主要介面語言（產品鐵律「印尼文優先」）。機器翻譯曾在 id 句子中間留下英文
    // （「catatan and access not changed」「untuk blood pressure tracking」，issue #928），畫面照常渲染、型別也過。
    // 印尼文本來就大量沿用英文外來語（item、valid、log、upgrade、Google…），所以不掃「任何英文字」，
    // 只掃印尼文句子裡不會出現的英文功能詞與幾個本 app 常見、印尼文有自己說法的內容詞。
    // 只比對全小寫：大寫的 WHO、DELETE（刪帳確認關鍵字）與「No.」（nomor 的縮寫）都是合法用法。
    const englishWords = [
      'the', 'and', 'not', 'please', 'with', 'your', 'you', 'this', 'that', 'from', 'will', 'has', 'have', 'been',
      'could', 'should', 'would', 'currently', 'unable', 'failed', 'yet', 'of', 'to', 'is', 'are', 'was', 'were',
      'for', 'or', 'on', 'at', 'by', 'it', 'its', 'can', 'cannot', 'an', 'be', 'if', 'then', 'than', 'into', 'about',
      'after', 'before', 'while', 'when', 'which', 'what', 'where', 'there', 'their', 'they', 'we', 'our', 'my', 'no',
      'blood', 'pressure', 'tracking', 'access', 'caregiver', 'caregivers', 'changed', 'saved', 'loading', 'deleted',
      'updated', 'settings', 'medication', 'medications', 'schedule', 'reminder', 'doctor', 'patient', 'patients',
      'family', 'today', 'record', 'records', 'reading', 'readings', 'measurement', 'temperature', 'weight', 'heart', 'rate',
    ]
    const marker = new RegExp(`\\b(?:${englishWords.join('|')})\\b`)
    // 專有名詞整段先移除再比對：release-please 是版本發布工具名稱，不是英文句子。
    const properNames = /Release[- ]please|Sign in with Google|Family Health Note/gi
    const indonesianValues = readSourceFiles().flatMap(({ path, source }) =>
      [...source.matchAll(/\bid:\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1(?=\s*,\s*zh:)/g)].map(match => ({ path, value: match[2] })))
    // 至少要掃到大量印尼文字串，否則 regex 失效時這條測試會靜默通過。
    expect(indonesianValues.length).toBeGreaterThan(2000)
    const leaks = indonesianValues
      .filter(({ value }) => marker.test(value.replace(/\$\{[^}]*\}/g, ' ').replace(properNames, ' ')))
      .map(({ path, value }) => `${path}: ${value}`)
    expect(leaks).toEqual([])
  })

  test('血壓等級詞彙與標準模板的 zh／id／en 三語齊備', () => {
    // 為什麼另外掃 JSON：上一條只掃 .ts／.tsx 裡的 `en:` 字串，血壓等級標籤與模板名稱住在
    // src/config/*.json，型別檢查與上一條掃描都抓不到缺漏，但它們是照護者畫面上會看到的文字
    // （AGENTS.md §3.6 / 規劃文件 R6：看護看到的是印尼文，這不是可延後項目）。
    const configRoot = new URL('../../src/config/', import.meta.url)
    const localizedFields: Array<[string, Record<string, unknown>]> = []

    const levels = JSON.parse(readFileSync(new URL('bp-levels.json', configRoot), 'utf8')) as Record<string, any>
    for (const [key, level] of Object.entries(levels)) {
      localizedFields.push([`bp-levels.json:${key}.labels`, level.labels])
      localizedFields.push([`bp-levels.json:${key}.recommendations`, level.recommendations])
    }

    const standardsRoot = new URL('bp-standards/', configRoot)
    for (const entry of readdirSync(standardsRoot)) {
      if (!entry.endsWith('.json')) continue
      const standard = JSON.parse(readFileSync(new URL(entry, standardsRoot), 'utf8')) as Record<string, any>
      localizedFields.push([`${entry}:names`, standard.names])
      localizedFields.push([`${entry}:descriptions`, standard.descriptions])
    }

    // 至少要掃到東西，否則路徑寫錯時這條測試會靜默通過。
    expect(localizedFields.length).toBeGreaterThan(20)

    for (const [where, field] of localizedFields) {
      for (const locale of ['zh', 'id', 'en'] as const) {
        const value = field?.[locale]
        expect(`${where}.${locale}: ${typeof value}`).toBe(`${where}.${locale}: string`)
        expect(`${where}.${locale}: ${String(value).includes('[EN:')}`).toBe(`${where}.${locale}: false`)
      }
      // 英文欄位不得退回中文，否則英文使用者看到的是看不懂的原文。
      const english = String(field?.en ?? '')
      expect(`${where}.en has CJK: ${/[\u4e00-\u9fff]/.test(english)}`).toBe(`${where}.en has CJK: false`)
    }

    // `tinggi` 的臨床建議在九級表裡本來就是空字串（刻意不給建議），是唯一允許的空值。
    const emptyRecommendationKeys = Object.entries(levels)
      .filter(([, level]) => ['zh', 'id', 'en'].some(locale => (level as any).recommendations[locale] === ''))
      .map(([key]) => key)
    expect(emptyRecommendationKeys).toEqual(['tinggi'])
  })
})

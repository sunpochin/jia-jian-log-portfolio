/*
檔案用途：列出「同時出現在 id（印尼文）與 en（英文）介面文字」而且是合理共用的字詞，給 i18n.test.ts 的英文防漏檢查使用。
所在層：tests/unit/fixtures；純資料，不含邏輯。
主要關聯：tests/unit/i18n.test.ts「en 欄位不得混入印尼文字詞」；issue #920。
*/

// 為什麼需要這份清單：印尼文介面常直接沿用英文外來語與專有名詞（Google、PDF、tablet、demo…），
// 所以「某字同時出現在 id 與 en」本身不代表出錯；但機器翻譯殘留的印尼文（dimuat、tautan、Saring…）
// 也正是這種情形。測試把兩種語言的字詞取交集，交集裡只要出現不在本清單的字就失敗。
// 新增前請確認：這個字在英文裡本來就是這樣寫（英文單字、品牌、縮寫、單位），而不是印尼文。
// 只收小寫、長度 ≥ 3 的字；排序只為了好讀與好 diff。
export const I18N_SHARED_ID_EN_WORDS: ReadonlySet<string> = new Set([
  'access', 'ace', 'admin', 'administrator', 'analytics', 'and', 'android', 'angina', 'anti', 'antiplatelet',
  'api', 'app', 'apple', 'arb', 'atc', 'audit', 'author', 'banner', 'basis', 'beta', 'blocker',
  'blood', 'bot', 'brilinta', 'browser', 'bug', 'build', 'calcium', 'calendar', 'caregiver', 'changed',
  'changelog', 'channel', 'checklist', 'chrome', 'ckd', 'clipboard', 'cloud', 'coep', 'commit', 'complete',
  'condition', 'coop', 'csv', 'data', 'database', 'default', 'delete', 'demo', 'desktop', 'detail',
  'development', 'diabetes', 'diagnosis', 'dialog', 'disclaimer', 'effect', 'egfr', 'email', 'error', 'escape',
  'exforge', 'family', 'file', 'filter', 'first', 'font', 'format', 'gemini', 'gis', 'github',
  'glu', 'google', 'gpt', 'hba', 'header', 'health', 'hemoglobin', 'https', 'hub', 'identifier',
  'info', 'input', 'insulin', 'internal', 'internet', 'ios', 'item', 'jpeg', 'kcal', 'key',
  'keyboard', 'lab', 'label', 'landing', 'level', 'line', 'listener', 'llc', 'local', 'localstorage',
  'log', 'login', 'logo', 'magenta', 'manual', 'menu', 'mineral', 'minimum', 'mode', 'model',
  'mog', 'mvp', 'native', 'nee', 'normal', 'not', 'note', 'nsaid', 'ocr', 'offline',
  'onboarding', 'online', 'osteoporosis', 'oval', 'pageshow', 'panel', 'patient', 'pdf', 'per', 'personal',
  'platform', 'play', 'please', 'pop', 'portfolio', 'premium', 'preset', 'pressure', 'preview', 'prn', 'production',
  'prompt', 'proxy', 'pulse', 'push', 'pwa', 'race', 'readme', 'record', 'ref', 'release', 'resend',
  'return', 'rls', 'row', 'sachet', 'safari', 'saved', 'security', 'seed', 'seo', 'september',
  'server', 'slot', 'sql', 'ssl', 'staging', 'start', 'status', 'stop', 'store', 'string',
  'sub', 'success', 'supabase', 'tab', 'tablet', 'taipei', 'taiwan', 'target', 'telegram', 'template',
  'terracotta', 'testflight', 'tfda', 'tls', 'total', 'tracking', 'transfer', 'tutorial', 'unit', 'upgrade',
  'urine', 'url', 'user', 'utf', 'valid', 'vercel', 'vertigo', 'via', 'view', 'vision',
  'vitamin', 'volume', 'web', 'webp', 'week', 'whiskers', 'who', 'wizard', 'zoom',
  // staging 合併進來的隱私告知（#922）：hosting 是印尼文也沿用的英文外來語；
  // portfolio-author 是隱私告知裡依法列出的資料控制者代號（repo 擁有者，已見於多個既有測試），不是翻譯殘留。
  'hosting', 'portfolio-author',
  // 原生殼 App 鎖（#821）：Face ID 與 iPhone 是 Apple 產品名稱，印尼文介面也照原文寫。
  'face', 'iphone',
])

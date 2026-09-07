/*
檔案用途：保存並套用「閱讀字級」偏好（標準／大／特大），讓有老花的中高齡家屬把全站文字等比放大。
所在層：src/lib 本機偏好層；只影響單一裝置的畫面體感，不改變任何健康數值、判讀或警示門檻。
主要關聯：src/main.tsx（開機即套用）、src/components/settings/ReadingScaleSettings.tsx、src/index.css 的 :root[data-reading-scale]。

為什麼綁裝置而非病人：AGENTS.md〈生理數值對象綁定不變量〉允許純帳號／裝置層的介面偏好
（語言、單位顯示、版面狀態）不做 patient-scoped 分區。字級不會因人而異地改變健康判讀或照護行為，
而且「看得清楚」是這支手機前面這個人的需求——同一個帳號在長輩的手機和子女的手機應該可以不一樣，
所以刻意存在 localStorage 而不是資料庫。
*/

// 只給三段而不是連續滑桿：長輩設定介面的選項愈少愈好，三顆大按鈕可以一眼比較、一次按到底。
export const READING_SCALE_OPTIONS = ['standard', 'large', 'xlarge'] as const

export type ReadingScale = typeof READING_SCALE_OPTIONS[number]

export const DEFAULT_READING_SCALE: ReadingScale = 'standard'

/*
 * 百分比而不是 px：100% 代表「使用者自己在系統／瀏覽器設定的預設字級」，
 * 所以這裡是在他既有的設定上再放大，不會把他調過的手機字體壓回 16px。
 * 112.5% / 125% 在預設 16px 下等於 18px / 20px；上限停在 125% 是因為再往上，
 * 底部四個導覽頁籤的印尼文標籤會在窄螢幕換行而擠壓內容高度。想再更大的人可以直接雙指放大。
 */
export const READING_SCALE_ROOT_FONT_SIZE: Record<ReadingScale, string> = {
  standard: '100%',
  large: '112.5%',
  xlarge: '125%',
}

const STORAGE_KEY = 'jiajianlog.reading-scale'

export function isReadingScale(value: unknown): value is ReadingScale {
  return READING_SCALE_OPTIONS.includes(value as ReadingScale)
}

export function readReadingScale(): ReadingScale {
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY)
    return isReadingScale(raw) ? raw : DEFAULT_READING_SCALE
  } catch {
    // 無痕模式或封鎖 storage 時只會回到標準字級，不能因此讓 App 開不起來。
    return DEFAULT_READING_SCALE
  }
}

export function saveReadingScale(scale: ReadingScale): void {
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, scale)
  } catch {
    // 存不起來時這次仍然放大得成（套用與儲存是分開的兩步），只是下次開 App 會回到標準。
  }
}

/*
 * 只描述這個函式真正會用到的兩個能力，而不是要求一個完整 HTMLElement：
 * 這樣 document.documentElement 可以直接傳進來，單元測試也能傳一個兩行的假物件，
 * 不必為了驗證「有沒有正確套用字級」去啟一個瀏覽器或 DOM 模擬環境。
 */
export type ReadingScaleRoot = {
  style: { fontSize: string }
  setAttribute: (name: string, value: string) => void
}

/**
 * 把字級套到 <html>。
 *
 * 為什麼同時寫 style 與 data-reading-scale：style 負責實際放大（唯一真實來源是 READING_SCALE_ROOT_FONT_SIZE），
 * data 屬性讓 CSS 與測試能判斷目前段位，未來若某個區塊需要在特大模式下改用單欄版面也有掛鉤點。
 */
export function applyReadingScale(scale: ReadingScale, root?: ReadingScaleRoot | null): void {
  const element = root ?? (typeof document === 'undefined' ? null : document.documentElement)
  if (!element) return
  element.style.fontSize = READING_SCALE_ROOT_FONT_SIZE[scale]
  element.setAttribute('data-reading-scale', scale)
}

/*
 * 為什麼還需要這一段，光有 index.css 的 `@media print { :root { font-size: 100% } }` 不夠：
 * applyReadingScale 寫的是 inline style（element.style.fontSize），inline style 的優先權
 * 永遠贏過任何一般的 stylesheet 規則，包括 @media print，所以那條 CSS 規則其實從未真正生效過。
 * 結果是使用者若選了「特大」，交給醫師的 A4 報告／交接手冊／寵物報告也會用 125% 印出來，
 * 這牴觸了 docs/platform/i18n-and-accessibility.md 承諾的「列印時一律回到 100%」。
 *
 * 為什麼用 beforeprint／afterprint 而不是逐一修改每個 window.print() 呼叫點：
 * 這兩個事件涵蓋所有觸發列印的路徑（按鈕呼叫 window.print()、瀏覽器選單、Ctrl/Cmd+P、
 * 列印預覽），只要在這裡處理一次，RecordReport、PetVetReport、CareHandbookPage
 * 與未來任何新增的列印入口都不必各自記得重設字級。
 *
 * 為什麼 afterprint 要重新讀 localStorage 而不是記在記憶體裡的變數：
 * 這個函式只註冊一次監聽器，但使用者可能在同一次瀏覽階段中途改變字級偏好；
 * 直接重讀持久化的值，才能保證列印結束後精準恢復「使用者現在選的段位」，
 * 而不是「App 啟動當下的段位」。
 *
 * 為什麼 ReadingScaleWindow 只描述用得到的兩個能力，不要求完整 Window：
 * 讓單元測試可以傳一個假的事件收發器，不必為了測 beforeprint／afterprint
 * 去覆寫全域 globalThis.window（那樣會在同一個 bun test 行程裡污染其他不相關的測試檔
 * ——它們也會看到這個假 window）。
 */
export type ReadingScaleWindow = {
  addEventListener: (type: 'beforeprint' | 'afterprint', handler: () => void) => void
  removeEventListener: (type: 'beforeprint' | 'afterprint', handler: () => void) => void
}

export function initReadingScalePrintReset(target?: ReadingScaleWindow | null, root?: ReadingScaleRoot | null): () => void {
  const win = target ?? (typeof window === 'undefined' ? null : window)
  if (!win) return () => {}

  const handleBeforePrint = () => {
    applyReadingScale('standard', root)
  }
  const handleAfterPrint = () => {
    applyReadingScale(readReadingScale(), root)
  }

  win.addEventListener('beforeprint', handleBeforePrint)
  win.addEventListener('afterprint', handleAfterPrint)

  return () => {
    win.removeEventListener('beforeprint', handleBeforePrint)
    win.removeEventListener('afterprint', handleAfterPrint)
  }
}

/*
檔案用途：健保「健康存摺」醫療類 JSON 檔的內容判型與容錯解析（純函式，不寫任何資料庫）。
所在層：src/lib/adapters/nhi；輸入原始位元組／字串，輸出正規化後的 bdata 結構；不被任何 UI 或
        資料寫入路徑引用——依 docs/product/nhi-health-passbook-integration.md §7.1，Stage 0
        簽核前只允許存在這一層純函式，禁止接 UI、資料庫或 Storage。
主要關聯：xml.ts（共用 stripBom，維持 JSON／XML 兩種格式的邊界處理零分叉）；
          docs/product/nhi-health-passbook-integration.md §5.1.2（欄位白名單與寫入邏輯留待
          Stage 0 之後才能設計，本檔不預先假設任何寫入行為）。

移植出處：notoriouslab/health-workbench（MIT License）
  app/src/adapters/nhi_json.js
  https://github.com/notoriouslab/health-workbench

刻意不移植的部分：原始檔的 importSource()／importNhiBdata() 會直接寫入 HealthWorkbench 自己的
本機 SQLite（profiles 遮罩身分證綁定、encounters／medications／lab_results 等資料表）。那一整套
寫入邏輯依賴我們沒有、也還沒決定要不要有的欄位與授權模型（見上述文件 §5.1.1／§5.1.2），
不在 Stage 0 前允許動工的範圍內，因此本檔只保留「檔案內容 → 正規化資料結構」這一段純轉換。
*/

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

// 健保署匯出的報告類自由文字欄位（如 r8.10 影像／病理報告）會塞入未跳脫的原始
// 控制字元，例如聽力檢查用 TAB 對齊左右耳結果。這違反 RFC 8259，但確實是官方
// 匯出工具的真實輸出，直接 JSON.parse 會讓整份檔案在解析階段就中止。
// 值刻意保留原字元不做替換：報告以等寬 pre-wrap 呈現，TAB 的對齊有意義。
const CTRL_ESCAPES: Readonly<Record<number, string>> = { 8: '\\b', 9: '\\t', 10: '\\n', 12: '\\f', 13: '\\r' }

function escapeCtrl(code: number): string {
  return CTRL_ESCAPES[code] ?? '\\u' + code.toString(16).padStart(4, '0')
}

// 只跳脫「字串內」的原始控制字元，故必須追蹤 in-string 與反斜線跳脫狀態。
// NEVER 簡化成全域 replace：健保署檔案是格式化多行 JSON，全域替換會把結構
// 縮排的 TAB 與換行一起跳脫，JSON 從第一個字元就壞掉（見同名單元測試的負向對照）。
export function escapeRawCtrlInStrings(text: string): string {
  let out = ''
  let inStr = false
  let esc = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const code = text.charCodeAt(i)
    if (esc) { out += ch; esc = false; continue }
    if (inStr) {
      if (ch === '\\') { out += ch; esc = true; continue }
      if (ch === '"') { inStr = false; out += ch; continue }
      if (code < 0x20) { out += escapeCtrl(code); continue }
      out += ch
      continue
    }
    if (ch === '"') inStr = true
    out += ch
  }
  return out
}

// 先照規格解析；失敗才付出一次 O(n) 掃描的代價重試（正常檔案零成本）。
// 刻意不比對錯誤訊息文字來判斷是否為控制字元問題：那是引擎措辭，不同 JS 引擎
// 版本會變，一變就靜默退回原本的整批中止。重試仍失敗則拋原始錯誤（貼近真因）。
export function parseJsonTolerant(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch (err) {
    try {
      return JSON.parse(escapeRawCtrlInStrings(text))
    } catch {
      throw err
    }
  }
}

// 內容判型只看前 2KB 是否含 "myhealthbank"，不看副檔名——使用者改檔名或用 .txt／
// .dat 存檔仍要能被正確識別為健保存摺 JSON。
export function detectNhiJson(header: Uint8Array): boolean {
  try {
    const head = new TextDecoder('utf-8').decode(header.subarray(0, 2048))
    return head.includes('"myhealthbank"')
  } catch {
    return false
  }
}

// r1–r14 每個節區是一串記錄；r1_1／r3_1／r11_1 是巢狀子記錄（例如同一次門診的多筆醫囑）。
// b1.1／b1.2 是頂層的遮罩身分證與資料期間字串，其餘一律是陣列。
export type NhiFieldValue = string | NhiRecord[]
export type NhiRecord = { [field: string]: NhiFieldValue }
export type NhiBdata = { [section: string]: NhiRecord[] | string }

// 把健保存摺 JSON 原始位元組，解析並正規化成 JSON／XML 兩種格式共用的 bdata 形狀：
// 節區代碼一律小寫（官方 XML 版用大寫 R12–R14，JSON 版用小寫，統一成小寫以利後續比對）。
// 這是唯一對外的「檔案 → 正規化結構」入口，之後的白名單篩選與寫入邏輯留待 Stage 0
// 簽核後另外設計，本函式不假設、也不執行任何寫入。
export function parseNhiJsonBdata(bytes: Uint8Array): NhiBdata {
  const text = stripBom(new TextDecoder('utf-8').decode(bytes))
  const data = parseJsonTolerant(text)
  const bdata = (data as { myhealthbank?: { bdata?: unknown } } | null)?.myhealthbank?.bdata
  if (!bdata || typeof bdata !== 'object' || Array.isArray(bdata)) {
    throw new Error('健保存摺 JSON 缺少 myhealthbank.bdata 節點')
  }
  return Object.fromEntries(
    Object.entries(bdata as Record<string, NhiRecord[] | string>)
      .map(([key, value]) => [key.toLowerCase(), value]),
  )
}

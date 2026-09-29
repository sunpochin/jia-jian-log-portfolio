/*
檔案用途：健保「健康存摺」醫療類 XML 檔的內容判型與解析，轉成與 JSON 版相同的 bdata 結構
（純函式，不寫任何資料庫）。
所在層：src/lib/adapters/nhi；依 docs/product/nhi-health-passbook-integration.md §7.1，Stage 0
        簽核前只允許存在這一層純函式，禁止接 UI、資料庫或 Storage。
主要關聯：json.ts（共用 stripBom 與 NhiBdata／NhiRecord 型別，確保 JSON／XML 兩種格式解析出的
          結構零分叉，之後的白名單篩選與匯入邏輯才能共用同一段程式碼）。

移植出處：notoriouslab/health-workbench（MIT License）
  app/src/adapters/nhi_xml.js
  https://github.com/notoriouslab/health-workbench

刻意不移植的部分：原始檔的 importSource() 會呼叫 importNhiBdata() 寫入 HealthWorkbench 自己的
本機 SQLite。那一段不在 Stage 0 前允許動工的範圍內，見 json.ts 檔頭說明。

與原始碼的行為差異：原始版 shapeRecord() 只有頂層節區代碼轉小寫，巢狀欄位標籤原樣保留
（PR #678 review 指出，見 shapeRecord 內註解）。本檔巢狀欄位標籤同樣轉小寫，避免官方 XML
若對特定節區以大寫標籤匯出時，欄位表查詢或白名單比對悄悄漏接資料。
*/

import { stripBom, type NhiBdata, type NhiRecord, type NhiFieldValue } from './json'

const ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
}

function decodeEntities(s: string): string {
  if (!s.includes('&')) return s
  return s.replace(/&(?:amp|lt|gt|quot|apos);|&#(\d+);|&#x([0-9a-fA-F]+);/g, (m, dec, hex) => {
    if (dec) return String.fromCodePoint(Number(dec))
    if (hex) return String.fromCodePoint(parseInt(hex, 16))
    return ENTITIES[m] ?? m
  })
}

// 迷你 XML 解析（此格式無屬性、無自閉合標籤、無 CDATA；標籤名含「.」「_」）。
// 回傳 (tag, value) 序列；value 為字串（葉節點，實體已解碼）或子 pairs 陣列。
type XmlPair = [string, string | XmlPair[]]

const OPEN_RE = /<([\w.]+)>/y

function parsePairs(text: string, startPos: number, endPos: number): { pairs: XmlPair[]; pos: number } {
  const pairs: XmlPair[] = []
  let pos = startPos
  for (;;) {
    // 跳過元素間空白
    while (pos < endPos && /\s/.test(text[pos])) pos++
    if (pos >= endPos) return { pairs, pos }
    OPEN_RE.lastIndex = pos
    const m = OPEN_RE.exec(text)
    if (!m || m.index !== pos) {
      throw new Error(`XML 結構異常於位移 ${pos}：${JSON.stringify(text.slice(pos, pos + 40))}`)
    }
    const tag = m[1]
    const contentStart = pos + m[0].length
    const closeTag = `</${tag}>`
    const closeAt = text.indexOf(closeTag, contentStart)
    if (closeAt === -1 || closeAt > endPos) throw new Error(`缺少關閉標籤 ${closeTag}`)
    const inner = text.slice(contentStart, closeAt)
    if (inner.includes('<')) {
      const { pairs: children } = parsePairs(text, contentStart, closeAt)
      pairs.push([tag, children])
    } else {
      pairs.push([tag, decodeEntities(inner)])
    }
    pos = closeAt + closeTag.length
  }
}

// pairs → JSON 版 bdata 形狀的單筆記錄。子欄位標籤同樣統一轉小寫，理由同 xmlToBdata
// 對頂層節區代碼的處理：官方 XML 部分節區以大寫標籤匯出（例如 R12–R14），若巢狀欄位
// 標籤（如 r1_1 底下的醫囑代碼）也遇到同樣情形卻沒有正規化，之後任何以小寫欄位代碼
// 查表（例如 fieldmap.ts 的 R1_1['r1_1.1']）或做白名單比對的邏輯都會悄悄漏接該筆資料，
// 且不會顯式報錯——這比拋出例外更危險，因為看起來像是「這筆資料剛好沒有這個欄位」。
function shapeRecord(children: XmlPair[]): NhiRecord {
  const rec: NhiRecord = {}
  for (const [rawTag, val] of children) {
    const tag = rawTag.toLowerCase()
    if (Array.isArray(val)) {
      const existing = rec[tag]
      const list: NhiRecord[] = Array.isArray(existing) ? (existing as NhiRecord[]) : []
      list.push(shapeRecord(val))
      rec[tag] = list as NhiFieldValue
    } else {
      rec[tag] = val
    }
  }
  return rec
}

// 把健保存摺 XML 原始文字，解析並正規化成 JSON／XML 兩種格式共用的 bdata 形狀。
// 官方 XML 版不含 r9–r14（格式事實，非資料異常），呼叫端需自行判斷該節區缺席的意義。
export function xmlToBdata(text: string): NhiBdata {
  const t = stripBom(text)
  const open = t.indexOf('<bdata>')
  const close = t.indexOf('</bdata>')
  if (open === -1 || close === -1) throw new Error('找不到 bdata 節點')
  const { pairs } = parsePairs(t, open + '<bdata>'.length, close)
  const bdata: NhiBdata = {}
  for (const [rawTag, val] of pairs) {
    const tag = rawTag.toLowerCase()
    if (Array.isArray(val)) {
      const existing = bdata[tag]
      const list: NhiRecord[] = Array.isArray(existing) ? existing : []
      list.push(shapeRecord(val))
      bdata[tag] = list
    } else if (/^r\d+$/.test(tag)) {
      // 葉節點型節區（如 <r2>無資料</r2>、<r0>聲明文字</r0>）→ JSON 版同形
      bdata[tag] = [{ [tag]: val }]
    } else {
      bdata[tag] = val // b1.1 / b1.2
    }
  }
  return bdata
}

// 內容判型只看前 2KB 是否含 "<myhealthbank>"，不看副檔名，理由同 json.ts 的 detectNhiJson。
export function detectNhiXml(header: Uint8Array): boolean {
  try {
    const head = new TextDecoder('utf-8').decode(header.subarray(0, 2048))
    return head.includes('<myhealthbank>')
  } catch {
    return false
  }
}

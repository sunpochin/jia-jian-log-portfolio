/*
檔案用途：驗證健保健康存摺 JSON adapter 移植後的行為與原始 HealthWorkbench 版本一致，
重點是控制字元容錯解析（issue #2 對照，見 json.ts 檔頭說明）。所有 fixture 皆為手造合成資料，
不含任何真實病歷內容。
所在層：tests/unit；保護 src/lib/adapters/nhi/json.ts 的純函式行為。
主要關聯：src/lib/adapters/nhi/json.ts；docs/product/nhi-health-passbook-integration.md §7.1；
          移植對照的原始測試：notoriouslab/health-workbench app/tests/adapters/edge_cases.test.mjs。
*/
import { describe, expect, test } from 'bun:test'
import {
  stripBom,
  escapeRawCtrlInStrings,
  parseJsonTolerant,
  detectNhiJson,
  parseNhiJsonBdata,
} from '../../src/lib/adapters/nhi/json'

const TAB = String.fromCharCode(9)
const NUL = String.fromCharCode(0)
const BACKSLASH = String.fromCharCode(92)
const BOM = String.fromCharCode(0xfeff)

describe('nhi/json: stripBom', () => {
  test('移除開頭的 UTF-8 BOM', () => {
    expect(stripBom(`${BOM}{"a":1}`)).toBe('{"a":1}')
  })

  test('沒有 BOM 時原樣回傳', () => {
    expect(stripBom('{"a":1}')).toBe('{"a":1}')
  })
})

describe('nhi/json: escapeRawCtrlInStrings 邊界（移植自 edge_cases.test.mjs）', () => {
  // [說明, 原始 JSON 文字, 取值函式, 期望值]
  const cases: [string, string, (o: Record<string, unknown>) => unknown, unknown][] = [
    ['跳脫的反斜線結尾後接原始 TAB', `{"a":"end${BACKSLASH}${BACKSLASH}${TAB}x"}`, (o) => o.a, `end${BACKSLASH}${TAB}x`],
    ['跳脫的引號後接原始 TAB', `{"a":"say ${BACKSLASH}"hi${BACKSLASH}"${TAB}ok"}`, (o) => o.a, `say "hi"${TAB}ok`],
    ['key 名稱含原始 TAB', `{"k${TAB}1":"v"}`, (o) => Object.keys(o)[0], `k${TAB}1`],
    ['結構縮排的 TAB 必須原樣保留（不進值）', `{${TAB}"a":${TAB}"v${TAB}w"}`, (o) => o.a, `v${TAB}w`],
    ['連續多個不同控制字元', `{"a":"x${TAB}${TAB}${NUL}y"}`, (o) => o.a, `x${TAB}${TAB}${NUL}y`],
  ]

  for (const [desc, src, pick, want] of cases) {
    test(desc, () => {
      expect(() => JSON.parse(src)).toThrow() // 素材應先觸發原始 SyntaxError
      const escaped = escapeRawCtrlInStrings(src)
      expect(pick(JSON.parse(escaped) as Record<string, unknown>)).toBe(want as never)
    })
  }

  test('控制字元跳脫必須限定在字串內：全域替換會破壞結構（負向對照）', () => {
    const text = `{${TAB}"r8.10":${TAB}"pure tone audiometry${TAB}R${TAB}WNL"${TAB}}`
    expect(() => JSON.parse(text)).toThrow()

    // 錯誤示範：把整份文字的控制字元全域替換，會連結構縮排一起跳脫，JSON 從第一個字元就壞掉。
    const naive = Array.from(text)
      .map((c) => (c.charCodeAt(0) < 0x20 ? BACKSLASH + 'u' + c.charCodeAt(0).toString(16).padStart(4, '0') : c))
      .join('')
    expect(() => JSON.parse(naive)).toThrow()

    // 正確做法：只跳脫字串內的控制字元，結構縮排的 TAB 保持原樣，解析成功。
    expect(() => JSON.parse(escapeRawCtrlInStrings(text))).not.toThrow()
  })
})

describe('nhi/json: parseJsonTolerant', () => {
  test('正常 JSON 直接解析成功', () => {
    expect(parseJsonTolerant('{"a":1}')).toEqual({ a: 1 })
  })

  test('連控制字元跳脫都無法修復的畸形 JSON，拋出原始錯誤而非跳脫後的新錯誤', () => {
    // '{' 本身就不是控制字元造成的損壞（結構不完整），跳脫重試無法修復，
    // 必須原樣拋出第一次 JSON.parse 的錯誤，貼近真因。
    let originalErr: unknown
    try {
      JSON.parse('{')
    } catch (err) {
      originalErr = err
    }
    expect(() => parseJsonTolerant('{')).toThrow((originalErr as Error).message)
  })

  test('含未跳脫控制字元的健保署格式 JSON 仍能解析，值原樣保留', () => {
    // 合成 fixture：比照 HealthWorkbench 的 nhi_ctrlchar.json，r8.10 報告欄位用真實 TAB
    // 對齊聽力檢查左右耳結果——這是官方匯出工具的真實輸出樣態，不是人為構造的邊界案例。
    const dirty = `pure tone audiometry${TAB}R${TAB}WNL${TAB}L${TAB}WNL`
    const text = [
      '{',
      `${TAB}"myhealthbank": {`,
      `${TAB}${TAB}"bdata": {`,
      `${TAB}${TAB}${TAB}"b1.1": "Z99999****",`,
      `${TAB}${TAB}${TAB}"r8": [{"r8.10": "${dirty}"}]`,
      `${TAB}${TAB}}`,
      `${TAB}}`,
      '}',
    ].join('\n')
    // 錨定 fixture 效力：它必須仍能讓照規格的 JSON.parse 失敗，否則這則測試是假綠。
    expect(() => JSON.parse(text)).toThrow()

    const parsed = parseJsonTolerant(text) as { myhealthbank: { bdata: { r8: [{ 'r8.10': string }] } } }
    expect(parsed.myhealthbank.bdata.r8[0]['r8.10']).toBe(dirty)
  })
})

describe('nhi/json: detectNhiJson', () => {
  test('內容含 "myhealthbank" 即命中，不看副檔名', () => {
    const bytes = new TextEncoder().encode('{"myhealthbank": {"bdata": {')
    expect(detectNhiJson(bytes)).toBe(true)
  })

  test('非健保存摺內容不命中', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])
    expect(detectNhiJson(jpeg)).toBe(false)
  })

  test('0-byte 內容不命中，不拋出例外', () => {
    expect(detectNhiJson(new Uint8Array(0))).toBe(false)
  })

  test('傳入非預期形狀的輸入時安全回傳 false，不讓呼叫端收到未預期的例外', () => {
    const malformed = { subarray: () => { throw new Error('not a real Uint8Array') } } as unknown as Uint8Array
    expect(detectNhiJson(malformed)).toBe(false)
  })
})

describe('nhi/json: parseNhiJsonBdata', () => {
  test('解析出 bdata 並把節區代碼統一小寫', () => {
    const bytes = new TextEncoder().encode(
      '{"myhealthbank":{"bdata":{"b1.1":"A12345****","R1":[{"r1.5":"20260101"}]}}}',
    )
    const bdata = parseNhiJsonBdata(bytes)
    expect(bdata['b1.1']).toBe('A12345****')
    expect(bdata.r1).toEqual([{ 'r1.5': '20260101' }])
  })

  test('巢狀醫囑（r1_1）保留在對應記錄底下', () => {
    const bytes = new TextEncoder().encode(
      '{"myhealthbank":{"bdata":{"r1":[{"r1.5":"20260101","r1_1":[{"r1_1.2":"藥名"}]}]}}}',
    )
    const bdata = parseNhiJsonBdata(bytes)
    const r1 = bdata.r1 as Array<Record<string, unknown>>
    expect((r1[0].r1_1 as Array<Record<string, unknown>>)[0]['r1_1.2']).toBe('藥名')
  })

  test('缺少 myhealthbank.bdata 節點時拋出明確錯誤，而非讓呼叫端收到 undefined 存取例外', () => {
    const bytes = new TextEncoder().encode('{"myhealthbank": 123}')
    expect(() => parseNhiJsonBdata(bytes)).toThrow(/myhealthbank\.bdata/)
  })

  test('前置的 BOM 與未跳脫控制字元同時存在時仍能解析（stripBom 與容錯解析共同作用）', () => {
    const dirty = `L${TAB}WNL`
    const text = `${BOM}{"myhealthbank":{"bdata":{"r8":[{"r8.10":"${dirty}"}]}}}`
    const bytes = new TextEncoder().encode(text)
    const bdata = parseNhiJsonBdata(bytes)
    expect((bdata.r8 as Array<Record<string, unknown>>)[0]['r8.10']).toBe(dirty)
  })
})

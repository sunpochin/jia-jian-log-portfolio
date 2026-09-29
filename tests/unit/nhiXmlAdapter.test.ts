/*
檔案用途：驗證健保健康存摺 XML adapter 移植後的行為與原始 HealthWorkbench 版本一致，並確認
JSON／XML 兩種格式對同一批資料解析出結構相同的 bdata。所有 fixture 皆為手造合成資料。
所在層：tests/unit；保護 src/lib/adapters/nhi/xml.ts 的純函式行為。
主要關聯：src/lib/adapters/nhi/xml.ts、json.ts；
          docs/product/nhi-health-passbook-integration.md §7.1；
          移植對照的原始測試：notoriouslab/health-workbench app/tests/adapters/nhi_xml.test.mjs。
*/
import { describe, expect, test } from 'bun:test'
import { xmlToBdata, detectNhiXml } from '../../src/lib/adapters/nhi/xml'
import { parseNhiJsonBdata } from '../../src/lib/adapters/nhi/json'

const TAB = String.fromCharCode(9)
const NUL = String.fromCharCode(0)
const BOM = String.fromCharCode(0xfeff)

describe('nhi/xml: xmlToBdata', () => {
  test('無資料葉節點、巢狀醫囑、實體解碼、BOM（移植自原始測試）', () => {
    const xml =
      `${BOM}<?xml version="1.0"?><myhealthbank><bdata>` +
      '<b1.1>A12345****</b1.1><r2>無資料</r2>' +
      '<r1><r1.4>診所 &amp; 藥局</r1.4><r1.5>20260101</r1.5>' +
      '<r1_1><r1_1.1>A01</r1_1.1><r1_1.2>藥名</r1_1.2></r1_1>' +
      '<r1_1><r1_1.1>A02</r1_1.1><r1_1.2>藥名二</r1_1.2></r1_1></r1>' +
      '</bdata></myhealthbank>'
    const b = xmlToBdata(xml)
    expect(b['b1.1']).toBe('A12345****')
    expect(b.r2).toEqual([{ r2: '無資料' }])
    const r1 = b.r1 as Array<Record<string, unknown>>
    expect(r1).toHaveLength(1)
    expect(r1[0]['r1.4']).toBe('診所 & 藥局')
    const meds = r1[0].r1_1 as Array<Record<string, unknown>>
    expect(meds).toHaveLength(2)
    expect(meds[1]['r1_1.1']).toBe('A02')
  })

  test('XML 文字節點含原始控制字元：不中止且值原樣通過（issue #2 對照，移植自原始測試）', () => {
    const dirty = `pure tone audiometry${TAB}R${TAB}WNL${TAB}L${TAB}WNL${NUL}end`
    const xml =
      `${BOM}<?xml version="1.0" encoding="utf-8"?>` +
      `<myhealthbank><bdata><r8><r8.10>${dirty}</r8.10></r8></bdata></myhealthbank>`
    const bdata = xmlToBdata(xml)
    const r8 = bdata.r8 as Array<Record<string, unknown>>
    expect(r8[0]['r8.10']).toBe(dirty)
  })

  test('找不到 bdata 節點時拋出明確錯誤', () => {
    expect(() => xmlToBdata('<myhealthbank></myhealthbank>')).toThrow(/bdata/)
  })

  test('大寫標籤（官方部分節區以大寫匯出，如 R12–R14）連巢狀欄位也要正規化成小寫，不只頂層節區代碼', () => {
    // 回歸測試：原始 HealthWorkbench 的 shapeRecord() 只轉頂層節區代碼，巢狀欄位標籤原樣
    // 保留（PR #678 review）。若巢狀標籤大寫沒被正規化，之後以小寫欄位代碼查表（例如
    // fieldmap.ts 的 R1_1['r1_1.1']）會悄悄漏接資料，且不會顯式報錯。
    const xml =
      '<myhealthbank><bdata>' +
      '<R1><R1.4>診所</R1.4><R1_1><R1_1.1>A01</R1_1.1></R1_1></R1>' +
      '</bdata></myhealthbank>'
    const b = xmlToBdata(xml)
    const r1 = b.r1 as Array<Record<string, unknown>>
    expect(r1[0]['r1.4']).toBe('診所')
    const meds = r1[0].r1_1 as Array<Record<string, unknown>>
    expect(meds[0]['r1_1.1']).toBe('A01')
  })
})

describe('nhi/xml: detectNhiXml', () => {
  test('內容含 "<myhealthbank>" 即命中，不看副檔名', () => {
    const bytes = new TextEncoder().encode(
      `${BOM}<?xml version="1.0" encoding="utf-8"?>\n<myhealthbank>\n  <bdata>`,
    )
    expect(detectNhiXml(bytes)).toBe(true)
  })

  test('JSON 內容不會被誤判為 XML', () => {
    const bytes = new TextEncoder().encode('{"myhealthbank": {"bdata": {')
    expect(detectNhiXml(bytes)).toBe(false)
  })

  test('傳入非預期形狀的輸入時安全回傳 false，不讓呼叫端收到未預期的例外', () => {
    const malformed = { subarray: () => { throw new Error('not a real Uint8Array') } } as unknown as Uint8Array
    expect(detectNhiXml(malformed)).toBe(false)
  })
})

describe('nhi/xml: xmlToBdata 結構異常', () => {
  test('標籤未正確閉合時拋出「XML 結構異常」錯誤，指出位移量', () => {
    // 少了 <r1.5> 的開頭尖括號，parsePairs 在該位移量找不到合法的開頭標籤。
    const xml = '<myhealthbank><bdata><r1>r1.5>20260101</r1.5></r1></bdata></myhealthbank>'
    expect(() => xmlToBdata(xml)).toThrow(/XML 結構異常/)
  })
})

describe('nhi/xml 與 nhi/json 交叉一致性：同一批資料的 JSON／XML 版本解析出相同結構', () => {
  test('r1 就醫紀錄含巢狀醫囑時，JSON 與 XML 版本的 bdata 深度相等', () => {
    const jsonBytes = new TextEncoder().encode(
      '{"myhealthbank":{"bdata":{' +
        '"b1.1":"A12345****",' +
        '"r1":[{"r1.4":"診所 & 藥局","r1.5":"20260101","r1_1":[{"r1_1.1":"A01","r1_1.2":"藥名"}]}]' +
        '}}}',
    )
    const xml =
      '<myhealthbank><bdata>' +
      '<b1.1>A12345****</b1.1>' +
      '<r1><r1.4>診所 &amp; 藥局</r1.4><r1.5>20260101</r1.5>' +
      '<r1_1><r1_1.1>A01</r1_1.1><r1_1.2>藥名</r1_1.2></r1_1></r1>' +
      '</bdata></myhealthbank>'

    const fromJson = parseNhiJsonBdata(jsonBytes)
    const fromXml = xmlToBdata(xml)
    expect(fromXml).toEqual(fromJson)
  })
})

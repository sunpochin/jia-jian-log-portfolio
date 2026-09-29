/*
檔案用途：健保「健康存摺」r7 檢驗檢查結果的項目名稱／單位正規化（純函式，不寫任何資料庫、不 import supabase）。
所在層：src/lib/adapters/nhi；輸入單筆 r7 record（json.ts／xml.ts 正規化後的 bdata 節區之一），
        輸出比對到 S4 白名單（src/lib/labItemMeta.ts 的 LAB_ITEM_META）後的正規化結構；不被任何
        UI 或資料寫入路徑引用——依 docs/product/nhi-health-passbook-integration.md §7.1，Stage 0
        簽核前只允許存在這一層純函式，禁止接 UI、資料庫或 Storage。
主要關聯：json.ts／xml.ts（上游輸出的 bdata.r7 即本檔輸入）、fieldmap.ts（R7 欄位代碼對照）、
          src/lib/labItemMeta.ts（LAB_ITEM_META[code].nhiNameAliases 是本檔判斷白名單命中的唯一依據，
          之所以從 labResults.ts 拆出 labItemMeta.ts，就是為了讓本檔可以只依賴它而不連帶 import supabase）。

移植出處：notoriouslab/health-workbench（MIT License）
  app/src/knowledge/labs.js（aliasMap，本檔 buildAliasMap 的移植版本）
  src/knowledge/labs.yaml（NHI_LAB_KNOWLEDGE_ENTRIES 的 normalized_name／aliases 資料來源；
    app/src/knowledge/labs.js 在 App 端實際讀的是由這份 yaml 建置出的 labs.json，內容同源）
  https://github.com/notoriouslab/health-workbench

刻意不移植的部分：
- 原始 labs.yaml 每條目還有 description／source_name／source_url／cited_date 四個欄位，用於
  HealthWorkbench 自己「顯示引用出處」的畫面；本專案 Stage 0 前沒有匯入 UI，這裡只保留
  normalized_name／aliases 這兩個供比對用的欄位，其餘等未來真的要做引用畫面時再移植。
- applyNormalization()：直接讀寫 HealthWorkbench 自己 SQLite 的 lab_results 表，屬於資料庫寫入邏輯，
  依 §7.1 Stage 0 前置範圍限制不在移植範圍內；本檔的 normalizeNhiLabRow() 只是對應的純函式版本，
  呼叫端要自己決定何時、要不要把結果寫進 patient_lab_results。
- 參考值分類（哪個數值算過高／過低）沒有移植，也不在 HealthWorkbench labs 知識庫裡；
  依規劃文件（docs/product/clinical-care-ops.md §6）決定改用「該筆報告自己的參考值」（r7.12），
  不用全域門檻，理由是各檢驗所參考範圍不同，寫死門檻等於把醫療判斷寫進程式。
- **r7.11（結果值）／r7.12（參考值）／r7.5、r7.6（日期）／r7.4（機構名稱）刻意不解析、不輸出**：
  docs/product/clinical-care-ops.md §5.4 把 Stage 0 簽核前允許動工的範圍明確限定在「項目名稱／
  單位正規化」；即使不寫資料庫，讓這個純函式的輸出已經長得像 `patient_lab_results` 的欄位
  （數值、參考值範圍、採檢日、機構），會讓之後的程式碼不必重新檢視 Stage 0 與法遵簽核就能直接
  消費這些欄位，等於用「純函式、無 DB 寫入」實質繞過 gate——docs/product/nhi-health-passbook-integration.md
  §7.1 的檔尾註解就記錄過同一個 repo 裡幾乎一樣的教訓（PR #610，Codex review：「用『沒有 DB 寫入』
  當作繞過 gate 的理由，會讓最敏感的事被當成技術驗證提前開工」）。本檔只做兩件事：判斷 r7.10
  是否落在白名單、輸出白名單命中後的固定單位；其餘欄位的解析留到 Stage 0 簽核後的正式匯入票再做
  （Codex review, PR #795）。

EGFR 白名單合併說明：HealthWorkbench 的知識庫刻意把 eGFR (CKD-EPI)／eGFR (MDRD)／eGFR Male
三個公式變體當成三個獨立的 normalized_name（不合併，避免不同公式的估算值混進同一條趨勢線）。
本專案的 patient_lab_results.item_code 只有單一 EGFR 代碼、不分公式，因此在
src/lib/labItemMeta.ts 的 LAB_ITEM_META.EGFR.nhiNameAliases 刻意把三者都收進同一個白名單——
這是本專案 schema 限制下的刻意簡化，不是移植 HealthWorkbench 的合併行為（它們本來就沒合併）。
*/
import { LAB_ITEM_META, LAB_ITEM_CODES } from '../../labItemMeta'
import type { LabItemCode } from '../../labItemMeta'

// ---- 移植自 app/src/knowledge/labs.js（aliasMap）與 src/knowledge/labs.yaml ----

export interface NhiLabKnowledgeEntry {
  normalizedName: string
  aliases: string[]
}

// 只收錄與 S4 白名單（K／NA／CR／EGFR／HBA1C／GLU／HB）比對相關、且上游 labs.yaml 目前已有的條目；
// 這是完整移植（不是本專案篩選過的子集）——上游知識庫本身就還沒收錄鉀／鈉／血糖／HbA1c 的別名，
// 詳見本檔案頭「刻意不移植的部分」與 labItemMeta.ts 的 nhiNameAliases 註解。
export const NHI_LAB_KNOWLEDGE_ENTRIES: readonly NhiLabKnowledgeEntry[] = [
  { normalizedName: 'WBC', aliases: [] },
  { normalizedName: 'RBC', aliases: [] },
  { normalizedName: 'Hemoglobin', aliases: ['Hb', 'HB'] },
  { normalizedName: 'Hematocrit', aliases: ['Hct', 'HCT'] },
  { normalizedName: 'PLT', aliases: [] },
  { normalizedName: 'MCV', aliases: [] },
  { normalizedName: 'MCH', aliases: [] },
  { normalizedName: 'MCHC', aliases: [] },
  { normalizedName: 'RDW-CV', aliases: [] },
  { normalizedName: 'RDW-SD', aliases: [] },
  { normalizedName: 'Neutrophil', aliases: ['Neut'] },
  { normalizedName: 'Segmented Neutrophil', aliases: ['Seg'] },
  { normalizedName: 'Band', aliases: [] },
  { normalizedName: 'Lymphocyte', aliases: ['Lym', 'Lym.'] },
  { normalizedName: 'Monocyte', aliases: ['Mono', 'Mono.'] },
  { normalizedName: 'Eosinophil', aliases: ['Eos', 'Eos.'] },
  { normalizedName: 'Basophil', aliases: ['Baso.'] },
  { normalizedName: 'Atypical Lymphocyte', aliases: ['Aty.Lym.'] },
  { normalizedName: 'Blast', aliases: [] },
  { normalizedName: 'Metamyelocyte', aliases: ['Meta'] },
  { normalizedName: 'Myelocyte', aliases: ['Myelo.'] },
  { normalizedName: 'Promyelocyte', aliases: ['Promyl.'] },
  { normalizedName: 'Normoblast', aliases: ['Normobl.'] },
  { normalizedName: 'Plasma Cell', aliases: ['PlasmaCell'] },
  { normalizedName: 'AFP', aliases: [] },
  { normalizedName: 'CEA', aliases: [] },
  { normalizedName: 'CA 19-9', aliases: ['CA 199'] },
  { normalizedName: 'CRP', aliases: [] },
  { normalizedName: 'ALT', aliases: [] },
  { normalizedName: 'AST', aliases: [] },
  { normalizedName: 'Total Bilirubin', aliases: ['T. Bili'] },
  { normalizedName: 'Lipase', aliases: [] },
  { normalizedName: 'Blood Urea Nitrogen', aliases: ['BUN', 'UN'] },
  { normalizedName: 'Creatinine', aliases: ['CRE', 'Cr'] },
  { normalizedName: 'eGFR (CKD-EPI)', aliases: [] },
  { normalizedName: 'eGFR (MDRD)', aliases: [] },
  { normalizedName: 'eGFR Male', aliases: [] },
  { normalizedName: 'Hemolysis', aliases: [] },
  { normalizedName: 'Icterus', aliases: [] },
  { normalizedName: 'Lipemia', aliases: [] },
]

// 移植自 labs.js 的 aliasMap()：把每個條目的 normalized_name 本身與所有別名都指向同一個
// normalized_name；別名衝突（同一個字串指到兩個不同 normalized_name）直接拋錯，不得靜默覆蓋。
export function buildAliasMap(entries: readonly NhiLabKnowledgeEntry[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const entry of entries) {
    for (const alias of [entry.normalizedName, ...entry.aliases]) {
      const key = alias.trim()
      const existing = m.get(key)
      if (existing !== undefined && existing !== entry.normalizedName) {
        throw new Error(`別名衝突：${key} 同時指向 ${existing} 與 ${entry.normalizedName}`)
      }
      m.set(key, entry.normalizedName)
    }
  }
  return m
}

const ALIAS_MAP = buildAliasMap(NHI_LAB_KNOWLEDGE_ENTRIES)

function matchLabItemCode(normalizedName: string): LabItemCode | null {
  for (const code of LAB_ITEM_CODES) {
    if (LAB_ITEM_META[code].nhiNameAliases.includes(normalizedName)) return code
  }
  return null
}

export interface NhiLabRow {
  'r7.10'?: string | null
}

export interface NormalizedNhiLabRow {
  code: LabItemCode | null
  unit: string | null
}

// 唯一對外入口：只判斷一筆 r7 record 的「檢驗項目名稱」（r7.10）是否落在 S4 白名單，
// 並回傳白名單命中後的固定單位；不解析、不輸出數值／參考值／日期／機構（見檔頭「刻意不移植的部分」）。
// 非白名單項目（aliasMap 找不到，或正規化名稱不在任何 LAB_ITEM_META[code].nhiNameAliases 裡）
// 一律回傳 code: null。
export function normalizeNhiLabRow(row: NhiLabRow): NormalizedNhiLabRow {
  const rawName = row['r7.10']
  const normalizedName = rawName != null ? ALIAS_MAP.get(rawName.trim()) ?? null : null
  const code = normalizedName ? matchLabItemCode(normalizedName) : null
  return { code, unit: code ? LAB_ITEM_META[code].unit : null }
}

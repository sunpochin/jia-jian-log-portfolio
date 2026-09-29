/*
檔案用途：讀寫病人級「血壓判讀標準」（issue #897）的 Supabase 介面，並提供依 measured_at
        解析生效區間的純函式，隔離 RLS 與生效日期化的細節。
所在層：src/lib 資料轉接層。
主要關聯：supabase/migrations/20260922230000_create_patient_bp_standards.sql、
        src/types/database/bpStandard.ts（模板定義與 resolveBpStandard）、
        docs/product/blood-pressure-standard-templates.md §5。
*/
import { supabase } from './supabase'
import {
  GENERAL_ADULT_STANDARD,
  assertCustomBounds,
  resolveBpStandard,
  type BpCustomBounds,
  type BpStandard,
  type BpStandardKey,
} from '../types/database/bpStandard'

/** 資料庫中的一段生效區間。`effectiveTo === null` 代表目前生效中。 */
export interface BpStandardInterval {
  id: string
  templateKey: string
  customBounds: BpCustomBounds | null
  prescribedNote: string | null
  effectiveFrom: string
  effectiveTo: string | null
}

/**
 * 某一筆讀數該套用的標準。
 *
 * `configured` 為 false 代表**那個時間點沒有任何區間涵蓋**（例如功能上線前的歷史資料）。
 * 這時退回 general_adult，但呼叫端必須據此在報告上標示「當時未設定個別標準」，
 * 不得假裝那段期間就是用現在這個標準判讀的——那正是生效日期化要防止的事。
 *
 * `unavailable` 為 true 代表**根本沒讀到標準**（還在載入，或查詢失敗）。這和
 * 「查過了，那段期間確實沒設定」是兩件不同的事，不得混為一談：前者的判讀結果不可信，
 * 後者可信。report 若把讀取失敗印成「當時未設定個別標準」，就是對醫師說了一句假話。
 * unavailable 時 configured 必然為 false，但反之不成立。
 */
export interface ResolvedBpStandard {
  standard: BpStandard
  templateKey: string
  prescribedNote: string | null
  configured: boolean
  unavailable: boolean
}

type IntervalRow = {
  id: string
  template_key: string
  custom_systolic_min: number | null
  custom_systolic_max: number | null
  custom_diastolic_min: number | null
  custom_diastolic_max: number | null
  prescribed_note: string | null
  effective_from: string
  effective_to: string | null
}

const SELECT_COLUMNS =
  'id, template_key, custom_systolic_min, custom_systolic_max, custom_diastolic_min, custom_diastolic_max, prescribed_note, effective_from, effective_to'

function fromRow(row: IntervalRow): BpStandardInterval {
  const hasBounds =
    row.custom_systolic_min !== null && row.custom_systolic_max !== null &&
    row.custom_diastolic_min !== null && row.custom_diastolic_max !== null
  return {
    id: row.id,
    templateKey: row.template_key,
    // CHECK 約束保證 custom 的四個 bound 要嘛全有要嘛全無，所以這裡不需要處理半套。
    customBounds: hasBounds
      ? {
          systolicMin: row.custom_systolic_min as number,
          systolicMax: row.custom_systolic_max as number,
          diastolicMin: row.custom_diastolic_min as number,
          diastolicMax: row.custom_diastolic_max as number,
        }
      : null,
    prescribedNote: row.prescribed_note,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
  }
}

/**
 * 一次取回該病人的**全部**生效區間。
 *
 * 刻意不提供「給我這筆讀數的標準」這種單筆查詢 API：清單一次渲染幾十筆讀數，
 * 逐筆查詢會變成 N 次網路往返。呼叫端取一次區間，再用 resolveStandardAt() 在記憶體比對。
 */
export async function readBpStandardIntervals(patientId: string): Promise<BpStandardInterval[]> {
  const { data, error } = await supabase
    .from('patient_bp_standards')
    .select(SELECT_COLUMNS)
    .eq('patient_id', patientId)
    .order('effective_from', { ascending: true })
  if (error) throw error
  return (data ?? []).map(row => fromRow(row as IntervalRow))
}

/**
 * 依**量測時間**解析標準，不是依「現在」。
 *
 * 本 app 支援補登舊量測，所以補登 8 月的讀數必須套用 8 月生效的標準；
 * 用「現在的標準」或「INSERT 當下的快照」都會答錯這一題。
 *
 * 純函式：不碰網路，方便逐筆在清單渲染時呼叫。
 */
export function resolveStandardAt(
  intervals: BpStandardInterval[],
  measuredAt: string | Date,
): ResolvedBpStandard {
  const at = measuredAt instanceof Date ? measuredAt.getTime() : Date.parse(measuredAt)
  const hit = intervals.find(interval => {
    const from = Date.parse(interval.effectiveFrom)
    const to = interval.effectiveTo === null ? Number.POSITIVE_INFINITY : Date.parse(interval.effectiveTo)
    // 區間是 [from, to)：結束時間點屬於下一段，與資料庫 tstzrange 的預設邊界一致，
    // 否則交界那一瞬間會同時命中兩段。
    return at >= from && at < to
  })
  if (!hit) {
    return {
      standard: GENERAL_ADULT_STANDARD,
      templateKey: GENERAL_ADULT_STANDARD.key,
      prescribedNote: null,
      configured: false,
      unavailable: false,
    }
  }
  return {
    standard: resolveBpStandard(hit.templateKey, hit.customBounds ?? undefined),
    templateKey: hit.templateKey,
    prescribedNote: hit.prescribedNote,
    configured: true,
    unavailable: false,
  }
}

/**
 * **此刻**生效中的區間（給設定畫面顯示「現在用哪一個」）。
 *
 * 刻意用「區間涵蓋現在」判定，不是用 `effectiveTo === null`：`setBpStandard` 允許指定
 * 未來的 `effectiveFrom`（例如「下次回診起改用新目標」）。那種情況下舊區間會拿到一個
 * **未來**的 `effectiveTo`，而排程中的新區間才是 `effectiveTo === null` 的那一列——
 * 只看 null 會讓設定畫面宣稱一個還沒生效的標準已經在用了。
 */
export function currentInterval(
  intervals: BpStandardInterval[],
  now: Date = new Date(),
): BpStandardInterval | null {
  const at = now.getTime()
  return intervals.find(interval => {
    const from = Date.parse(interval.effectiveFrom)
    const to = interval.effectiveTo === null ? Number.POSITIVE_INFINITY : Date.parse(interval.effectiveTo)
    return at >= from && at < to
  }) ?? null
}

/**
 * 已排程但尚未生效的區間（`effectiveFrom` 在未來）。設定畫面要能同時說出
 * 「現在用 X」與「Y 從某日起生效」，否則使用者排了程卻看不到，會以為沒存到。
 */
export function scheduledIntervals(
  intervals: BpStandardInterval[],
  now: Date = new Date(),
): BpStandardInterval[] {
  const at = now.getTime()
  return intervals.filter(interval => Date.parse(interval.effectiveFrom) > at)
}

export interface SetBpStandardInput {
  templateKey: BpStandardKey
  /** 只有 templateKey === 'custom' 時需要。 */
  bounds?: BpCustomBounds
  prescribedNote?: string | null
  /** 預設從「現在」起生效；換標準不改寫歷史判讀。 */
  effectiveFrom?: Date
}

/**
 * 換標準＝結束目前區間 ＋ 新增一列，透過 RPC 原子完成。
 *
 * 為什麼不讓這裡送兩次請求：順序被 EXCLUDE 約束綁死（必須先關再開），兩步之間若失敗
 * 會留下一段沒有標準涵蓋的空窗，那段期間的讀數會靜默退回 general_adult。
 *
 * 也**不做就地 UPDATE 門檻**：那會把歷史一起改掉，正是生效日期化要避免的事
 * （資料庫另有 trigger 擋住，這裡不重複實作那個判斷，只是不去踩它）。
 */
export async function setBpStandard(patientId: string, input: SetBpStandardInput): Promise<void> {
  if (input.templateKey === 'custom') {
    if (!input.bounds) throw new Error('custom standard requires bounds')
    // 引擎層與資料庫 CHECK 是同一組規則的兩道防線；這裡先擋是為了讓照護者在設定頁
    // 就看到明確錯誤，而不是收到一個 Postgres constraint 名稱。
    assertCustomBounds(input.bounds)
  } else if (input.bounds) {
    throw new Error(`bounds are only accepted for the custom standard, not ${input.templateKey}`)
  }
  const bounds = input.bounds ?? null
  const { error } = await supabase.rpc('set_patient_bp_standard', {
    p_patient_id: patientId,
    p_template_key: input.templateKey,
    p_effective_from: (input.effectiveFrom ?? new Date()).toISOString(),
    p_custom_systolic_min: bounds?.systolicMin ?? null,
    p_custom_systolic_max: bounds?.systolicMax ?? null,
    p_custom_diastolic_min: bounds?.diastolicMin ?? null,
    p_custom_diastolic_max: bounds?.diastolicMax ?? null,
    p_prescribed_note: input.prescribedNote ?? null,
  })
  if (error) throw error
}

/**
 * 「把量測時間換成該套用的標準」這件事的函式形狀。
 *
 * src/lib 的純函式（recordReport、dashboardStats、careAnomalySignals）不得自己查資料庫——
 * 它們會在測試與 Edge 環境被呼叫，而且一次處理整份清單。呼叫端取一次區間、包成一個
 * resolver 傳進去，lib 就只依賴一個函式而不是 Supabase。
 */
export type BpStandardResolver = (measuredAt: string | Date) => ResolvedBpStandard

export function makeBpStandardResolver(intervals: BpStandardInterval[]): BpStandardResolver {
  return measuredAt => resolveStandardAt(intervals, measuredAt)
}

/**
 * 「這位病人沒有（或還沒載入）個別標準」時的 resolver。
 *
 * 刻意做成一個**具名匯出的常數**而不是讓參數選填：呼叫端必須把它打出來，
 * review 時才看得到「這裡是刻意退回一般成人標準」，而不是漏傳。
 * 它回傳的 `configured: false` 會讓報告印出「當時未設定個別標準」，不會假裝套用過。
 */
export const GENERAL_ADULT_RESOLVER: BpStandardResolver = () => ({
  standard: GENERAL_ADULT_STANDARD,
  templateKey: GENERAL_ADULT_STANDARD.key,
  prescribedNote: null,
  configured: false,
  unavailable: false,
})

/**
 * 「標準還沒讀到」時的 resolver——載入中、查詢失敗，或 Provider 手上的區間還屬於上一位病人。
 *
 * 它與 `GENERAL_ADULT_RESOLVER` 的差別只有 `unavailable: true`，但那個差別是**必要的**：
 * 兩者都得先給一份門檻才能把畫面畫出來（空白的血壓清單比暫時用預設門檻更糟），
 * 可是報告不能把「讀不到」印成「當時未設定個別標準」——後者是對醫師陳述一個事實，
 * 前者只是我們自己還不知道。呼叫端看到 unavailable 就該把判讀標示為暫時不可信。
 */
export const UNAVAILABLE_BP_STANDARD_RESOLVER: BpStandardResolver = () => ({
  standard: GENERAL_ADULT_STANDARD,
  templateKey: GENERAL_ADULT_STANDARD.key,
  prescribedNote: null,
  configured: false,
  unavailable: true,
})

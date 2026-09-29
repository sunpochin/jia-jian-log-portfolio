/*
檔案用途：把「這位病人的血壓判讀標準」綁成一條唯一路徑——一次載入該病人的全部生效區間，
        再用 measured_at 逐筆解析，供畫面判讀每一筆讀數（issue #898 §6.1）。
所在層：src/features/vitals/hooks；React 層的資料綁定，純解析邏輯在 src/lib/bpStandards.ts。
主要關聯：src/lib/bpStandards.ts、src/types/database/bloodPressure.ts（evaluateReading）、
        App.tsx 與 BloodPressureReportPanel（Provider 掛載點）、
        docs/product/blood-pressure-standard-templates.md §6.1。

為什麼是 Provider 而不是每個元件各自傳 patientId：VitalAlertBadge 被渲染在清單深處，
一路傳 prop 會經過六七層與會被遺漏的中繼元件，而**漏傳的後果是靜默用一般成人標準**——
正是 AGENTS.md §3.5 要擋的「圖表、報告與通知各說各話」。Provider 讓「取得這位病人的標準」
只有一個入口，切換照護對象時整棵子樹一起失效。

為什麼 useBpEvaluator() 在沒有 Provider 時直接丟例外：退回 general_adult 會讓漏掛的畫面
看起來完全正常、只是判讀錯人的標準，那種錯誤不會有人回報。掛載點只有兩個（App 的
selectedPatientId 與 BloodPressureReportPanel 自己的 patientId），涵蓋所有渲染路徑。
*/
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  GENERAL_ADULT_RESOLVER,
  UNAVAILABLE_BP_STANDARD_RESOLVER,
  makeBpStandardResolver,
  readBpStandardIntervals,
  type BpStandardInterval,
  type BpStandardResolver,
  type ResolvedBpStandard,
} from '../../../lib/bpStandards'
import { evaluateReading, type ReadingEvaluation } from '../../../types/database'
import { isDemoPatientId } from '../../../lib/demoData'

/** 一筆讀數判讀的結果，外加「依據哪一份標準」的來源標示（R5）。 */
export interface StandardAwareEvaluation extends ReadingEvaluation {
  resolved: ResolvedBpStandard
}

export interface BpEvaluator {
  /**
   * 這份 evaluator 綁的是哪一位病人。消費端（例如設定面板）拿它比對自己手上的 patientId，
   * 確認自己讀到的不是另一棵 Provider 子樹的資料。
   */
  patientId: string
  /** 這位病人的量測時間 → 標準；傳給 src/lib 的純函式用。 */
  resolver: BpStandardResolver
  /** 該筆讀數在**量測當時**生效的標準下的判讀。清單、圖表、報告都用這個。 */
  evaluateAt(systolic: number, diastolic: number, pulse: number | null | undefined, measuredAt: string | Date): StandardAwareEvaluation
  /** 輸入當下的即時回饋：還沒有 measured_at，用「現在」生效的標準。 */
  evaluateNow(systolic: number, diastolic: number, pulse: number | null | undefined): StandardAwareEvaluation
  /** 設定畫面與報告表頭要顯示「現在用哪一份」。 */
  current: ResolvedBpStandard
  intervals: BpStandardInterval[]
  loading: boolean
  /** 讀取失敗。畫面仍會用 general_adult 判讀，但必須把這件事說出來，不得假裝標準已套用。 */
  error: unknown
  reload(): void
}

/**
 * 匯出只為了兩個用途：下方的 Provider，以及測試要注入一個假的 evaluator。
 * 正式程式碼一律走 useBpEvaluator()，不要直接 useContext——那會繞過下面那道防呆。
 */
export const BpStandardContext = createContext<BpEvaluator | null>(null)

/**
 * 把一個 resolver 包成完整的 evaluator。Provider 在載入中／讀取失敗時用它，
 * 測試也用它注入一個不綁病人的 evaluator。
 */
export function makeBpEvaluator(
  resolver: BpStandardResolver,
  state: { patientId?: string; intervals?: BpStandardInterval[]; loading?: boolean; error?: unknown; reload?: () => void } = {},
): BpEvaluator {
  const evaluateAt = (
    systolic: number,
    diastolic: number,
    pulse: number | null | undefined,
    measuredAt: string | Date,
  ): StandardAwareEvaluation => {
    const resolved = resolver(measuredAt)
    return { ...evaluateReading(systolic, diastolic, pulse, resolved.standard), resolved }
  }
  return {
    patientId: state.patientId ?? '',
    resolver,
    evaluateAt,
    evaluateNow: (systolic, diastolic, pulse) => evaluateAt(systolic, diastolic, pulse, new Date()),
    current: resolver(new Date()),
    intervals: state.intervals ?? [],
    loading: state.loading ?? false,
    error: state.error ?? null,
    reload: state.reload ?? (() => {}),
  }
}

/**
 * 不綁任何病人、一律回一般成人標準且 `configured: false` 的 evaluator。
 *
 * Provider 在「還沒載入完」與「讀取失敗」時就是這一份，所以它不是測試專用的替身，
 * 而是正式程式碼真的會用到的狀態；測試注入它，測到的就是那個狀態下的行為。
 */
export const GENERAL_ADULT_EVALUATOR: BpEvaluator = makeBpEvaluator(GENERAL_ADULT_RESOLVER)

export function BpStandardProvider({
  patientId,
  children,
}: {
  patientId: string
  children: ReactNode
}) {
  // 載入結果與「它屬於哪一位病人」綁在同一個 state。
  //
  // Codex review（PR #905，P2）：原本用 useEffect 在切換病人時 setIntervals([])，但 passive effect
  // 是在 **commit 之後**才跑的——`patientId` 換掉的那一次 render，Provider 與底下整棵子樹會先拿著
  // **上一位病人**的區間跑完一遍，正是這段程式宣稱要防止的跨病人殘留。把 owner 寫進 state 之後，
  // 比對在 render 當下同步完成，不依賴 effect 的時機。
  const [loaded, setLoaded] = useState<{ patientId: string; intervals: BpStandardInterval[] } | null>(null)
  const [errorFor, setErrorFor] = useState<{ patientId: string; error: unknown } | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    // 兩種情況沒有東西可查，直接標記成「已載入、區間為空」：
    // (1) 還沒有任何照護對象（例如剛註冊完、尚未建立病人）；
    // (2) 展示模式的假病人——它的 id 不存在於資料庫，查下去只會在每一次開啟展示模式時
    //     在 console 留下一串必然失敗的請求，並讓 error 狀態長期為真。
    // 這兩種是「查過了，確實沒有」，不是 unavailable。
    if (!patientId || isDemoPatientId(patientId)) {
      setLoaded({ patientId, intervals: [] })
      setErrorFor(null)
      return
    }
    readBpStandardIntervals(patientId)
      .then(rows => { if (!cancelled) { setLoaded({ patientId, intervals: rows }); setErrorFor(null) } })
      .catch(err => {
        console.error('[bp standard read error]', err)
        if (!cancelled) setErrorFor({ patientId, error: err })
      })
    return () => { cancelled = true }
  }, [patientId, reloadToken])

  const reload = useCallback(() => setReloadToken(token => token + 1), [])

  const value = useMemo<BpEvaluator>(() => {
    // 手上的資料必須屬於**現在這位**病人才算數；否則一律視為「還沒讀到」。
    const mine = loaded?.patientId === patientId ? loaded.intervals : null
    const error = errorFor?.patientId === patientId ? errorFor.error : null
    const loading = mine === null && error === null

    // 讀不到標準時仍然給一份門檻讓畫面畫得出來（空白的血壓清單比暫時用預設門檻更糟），
    // 但用 UNAVAILABLE_BP_STANDARD_RESOLVER 而不是 GENERAL_ADULT_RESOLVER：
    // 後者的 `configured: false` 是在陳述「查過了，那段期間沒設定」，而我們其實還不知道。
    // 報告與匯出靠這個旗標把「暫時不可信」說出來，不會把讀取失敗印成一句假話給醫師看。
    const resolver = mine === null ? UNAVAILABLE_BP_STANDARD_RESOLVER : makeBpStandardResolver(mine)
    return makeBpEvaluator(resolver, { patientId, intervals: mine ?? [], loading, error, reload })
  }, [patientId, loaded, errorFor, reload])

  return <BpStandardContext.Provider value={value}>{children}</BpStandardContext.Provider>
}

export function useBpEvaluator(): BpEvaluator {
  const value = useContext(BpStandardContext)
  // 檢查形狀而不是只檢查 truthy：測試的 hook harness 對「沒有對應 Provider」的 context
  // 會回傳一個共用的預設值（通常是語系 context），那是 truthy 的，只檢查 null 會放行一個
  // 沒有 resolver 的物件，錯誤就變成幾層之後的 "resolver is not a function"。
  if (typeof value?.resolver !== 'function') {
    throw new Error(
      'useBpEvaluator() requires a <BpStandardProvider patientId={…}>. ' +
      'Rendering blood pressure without a patient-bound standard would silently fall back to the ' +
      'general adult thresholds and interpret one patient with another patient\'s targets (issue #898).',
    )
  }
  return value
}

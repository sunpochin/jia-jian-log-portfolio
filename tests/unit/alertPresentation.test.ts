/*
檔案用途：鎖住 issue #898 §4.2／§4.3 的配色收斂——同一筆讀數在 badge、圖表、統計卡、
        列印報告與輸入頁按鈕必須取得**同一個視覺階**，而且四階紅在灰階下仍可分辨。
所在層：tests/unit 單元測試層。
主要關聯：src/lib/alertPresentation.ts、src/types/database/bpStandard.ts、
        docs/product/blood-pressure-standard-templates.md §4。

這一條是驗收條件裡「跨畫面一致，要有自動化測試，不能只靠人工看」的那一條。
*/
import { describe, expect, test } from 'bun:test'
import {
  ALERT_BAR_CLASS,
  ALERT_BUTTON_CLASS,
  ALERT_CARD_CLASS,
  ALERT_CHIP_CLASS,
  ALERT_ICON,
  ALERT_SOFT_CHIP_CLASS,
  alertTone,
  alertToneFromLevel,
  type AlertTone,
} from '../../src/lib/alertPresentation'
import {
  GENERAL_ADULT_STANDARD,
  POST_OP_STRICT_STANDARD,
  evaluateReading,
} from '../../src/types/database'

const ALL_TONES: AlertTone[] = [
  'on-target', 'normal', 'below-target', 'warning-low', 'danger-low',
  'off-target', 'pulse-warning', 'warning', 'danger', 'critical',
]

const SURFACES: Array<[string, Record<AlertTone, string>]> = [
  ['chip（badge）', ALERT_CHIP_CLASS],
  ['bar（危險級色條）', ALERT_BAR_CLASS],
  ['soft chip（報告／圖表）', ALERT_SOFT_CHIP_CLASS],
  ['card（統計卡）', ALERT_CARD_CLASS],
  ['button（輸入頁）', ALERT_BUTTON_CLASS],
  ['icon', ALERT_ICON],
]

describe('§4.3 配色落點收斂', () => {
  test('每個視覺階在每一個落點都有值——少一個就會出現「總覽紅、清單綠」', () => {
    for (const [name, map] of SURFACES) {
      for (const tone of ALL_TONES) {
        // 型別已經要求 Record<AlertTone, …>，但 JSON 之外的 map 可能被改成物件字面值後漏鍵，
        // 執行期再確認一次；空字串只有色條那一張表允許（沒有色條的階）。
        expect(`${name}:${tone}: ${typeof map[tone]}`).toBe(`${name}:${tone}: string`)
        if (name !== 'bar（危險級色條）') {
          expect(`${name}:${tone} empty: ${map[tone] === ''}`).toBe(`${name}:${tone} empty: false`)
        }
      }
      expect(Object.keys(map).sort()).toEqual([...ALL_TONES].sort())
    }
  })

  test('灰階下四階紅仍可分辨：外框 → 實心 → 實心＋色條 → 深實心＋色條', () => {
    // 這是「不靠顏色單獨傳達」的實際驗收方式（§4.2）。每一階至少要有一個**非色相**的差異。
    expect(ALERT_CHIP_CLASS['off-target']).toContain('border')      // 外框階：淺底 ＋ 外框
    expect(ALERT_CHIP_CLASS['off-target']).toContain('bg-danger-50')
    expect(ALERT_BAR_CLASS['off-target']).toBe('')

    expect(ALERT_CHIP_CLASS.warning).toContain('bg-danger-700')     // 實心
    expect(ALERT_BAR_CLASS.warning).toBe('')

    expect(ALERT_CHIP_CLASS.danger).toContain('bg-danger-700')      // 實心 ＋ 色條
    expect(ALERT_BAR_CLASS.danger).toContain('border-l-4')

    expect(ALERT_CHIP_CLASS.critical).toContain('bg-red-800')       // 深實心 ＋ 色條
    expect(ALERT_BAR_CLASS.critical).toContain('border-l-4')

    // warning 與 danger 的底色相同，所以色條是它們唯一的差別——如果哪天色條被拿掉，
    // 這兩階在畫面上會完全一樣，必須失敗。
    expect(ALERT_CHIP_CLASS.warning).toBe(ALERT_CHIP_CLASS.danger)
    expect(ALERT_BAR_CLASS.warning).not.toBe(ALERT_BAR_CLASS.danger)
    // critical 與 danger 的色條相同，靠底色深淺分辨——同樣不得兩者都一樣。
    expect(ALERT_CHIP_CLASS.critical).not.toBe(ALERT_CHIP_CLASS.danger)
  })

  test('有色條的階一律把左側兩角改直角', () => {
    // chip 是圓角，只加左邊框會被瀏覽器彎成彎月形，看起來像顏色溢出的 bug（明顯偏低 chip 回報）。
    // 色條與直角必須綁在一起：只要有 border-l-4，就必須有 rounded-l-none。
    for (const [tone, cls] of Object.entries(ALERT_BAR_CLASS)) {
      if (cls.includes('border-l-4')) expect(`${tone}: ${cls}`).toContain('rounded-l-none')
    }
  })

  test('高側是紅、低側是琥珀；上下三角讓灰階也讀得出「往哪邊調」', () => {
    expect(ALERT_CHIP_CLASS['off-target']).toContain('danger')
    expect(ALERT_CHIP_CLASS['below-target']).toContain('warn')
    expect(ALERT_ICON['off-target']).toBe('🔺')
    expect(ALERT_ICON['below-target']).toBe('🔻')
    expect(ALERT_ICON['on-target']).toBe('🎯')
  })
})

describe('alertTone 的推導', () => {
  const evaluate = (sys: number, dia: number, pulse: number | null, strict = false) =>
    evaluateReading(sys, dia, pulse, strict ? POST_OP_STRICT_STANDARD : GENERAL_ADULT_STANDARD)

  test('hard floor 的最高階自成一階，不與「明顯偏高」共用同一個紅', () => {
    // 185/120 與 165/95 的 webAlertLevel 都是 danger，但一個是「現在就打電話」、
    // 一個是「今天內回報醫師」。用同一個紅講這兩件事就是 §4.1 要避免的警報疲乏。
    expect(alertTone(evaluate(185, 120, null))).toBe('critical')
    expect(alertTone(evaluate(165, 95, null))).toBe('danger')
  })

  test('目標制模板的「在目標內」與一般成人的「正常」是不同的視覺階', () => {
    // 兩者的 webAlertLevel 都是 normal，但目標制要看得出醫囑有被達成。
    expect(alertTone(evaluate(115, 70, null, true))).toBe('on-target')
    expect(alertTone(evaluate(115, 70, null))).toBe('normal')
  })

  test('術後嚴格控制下，一般成人標準判為正常的 128 會顯示為「超出目標」', () => {
    // 這就是這張票存在的理由：同一組數值在兩位病人身上必須有不同的顏色。
    expect(alertTone(evaluate(128, 78, null))).toBe('normal')
    expect(alertTone(evaluate(128, 78, null, true))).toBe('off-target')
  })

  test('血壓正常但心跳 >120 時用心跳自己的琥珀，不借用血壓的紅', () => {
    // 「紅＝血壓高」是全 app 一致的語彙；心跳快也變紅會讓照護者以為血壓出事。
    const pulseOnly = evaluate(115, 72, 130)
    expect(pulseOnly.level).toBe('warning')
    expect(alertTone(pulseOnly)).toBe('pulse-warning')
    // 血壓本身就到警示級時，紅色的理由成立，不得被心跳降級成琥珀。
    expect(alertTone(evaluate(150, 95, 130))).toBe('warning')
  })

  test('alertToneFromLevel 是退化版本：分不出 critical 與 on-target', () => {
    // 它的存在是為了 DashboardSummary.alertCounts 那種「先分桶再上色」的既有資料流；
    // 這一條把它的限制寫死，避免有人誤以為它和 alertTone 等價。
    expect(alertToneFromLevel('danger')).toBe('danger')
    expect(alertToneFromLevel('normal')).toBe('normal')
    expect(alertToneFromLevel('off-target')).toBe('off-target')
  })
})

describe('跨畫面一致性', () => {
  test('同一筆讀數在五個落點取得的樣式都由同一個 tone 決定', () => {
    // 收斂的定義不是「所有地方長得一樣」（按鈕是動作、chip 是狀態，刻意不同），
    // 而是「同一筆讀數在每個地方都由同一個 tone 查表」。這裡逐一掃過整個值域，
    // 確認沒有任何一組數值會在某個落點查不到樣式而靜默落到預設值。
    const missing: string[] = []
    for (let sys = 70; sys <= 210; sys += 1) {
      for (const dia of [45, 50, 55, 60, 70, 80, 85, 90, 100, 110, 120, 125]) {
        for (const standard of [GENERAL_ADULT_STANDARD, POST_OP_STRICT_STANDARD]) {
          const tone = alertTone(evaluateReading(sys, dia, null, standard))
          for (const [name, map] of SURFACES) {
            if (map[tone] === undefined) missing.push(`${standard.key} ${sys}/${dia} → ${tone} @ ${name}`)
          }
        }
      }
    }
    expect(missing).toEqual([])
  })

  test('每一個模板都用得到「在目標內」以外的階，沒有模板會整片同色', () => {
    const tones = new Set<AlertTone>()
    for (let sys = 70; sys <= 210; sys += 1) {
      tones.add(alertTone(evaluateReading(sys, 75, null, POST_OP_STRICT_STANDARD)))
    }
    // 只掃收縮壓軸就該出現這八階：術後嚴格控制在收縮壓上是一條完整的階梯，
    // 從 <90 的明顯偏低一路到 ≥180 的極高危險，中間沒有任何一段是「整片同色」。
    expect([...tones].sort()).toEqual(
      ['below-target', 'critical', 'danger', 'danger-low', 'off-target', 'on-target', 'warning', 'warning-low'].sort(),
    )
  })
})

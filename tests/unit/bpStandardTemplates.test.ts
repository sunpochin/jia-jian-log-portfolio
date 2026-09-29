/*
檔案用途：驗證血壓判讀標準模板（BP standard templates）引擎——hard floor 不被任何模板降級、
         post_op_strict 的收縮壓／舒張壓雙軸階梯、刻意的降級與目標下界真的生效、
         以及 general_adult 走的就是那張凍結的九級表。
所在層：tests/unit；只測試純規則函式，不啟動瀏覽器或資料庫。
主要關聯：src/types/database/bpStandard.ts、src/types/database/bloodPressure.ts、
         src/config/bp-levels.json、src/config/bp-standards/*.json、
         docs/product/blood-pressure-standard-templates.md §3.1／§6／§8。
*/
import { describe, test, expect } from 'bun:test'
import {
  CKD_DIABETES_STANDARD,
  ELDERLY_RELAXED_STANDARD,
  GENERAL_ADULT_STANDARD,
  POST_OP_STRICT_STANDARD,
  createCustomStandard,
  evaluateReading,
  getAlertLevel,
  resolveBpStandard,
  targetSystolicBand,
  type BpStandard,
} from '../../src/types/database'
import levels from '../../src/config/bp-levels.json'
import spec from '../../src/config/blood-pressure-spec.json'

// 讀數在某份標準下命中的規則 key（收縮壓在前、舒張壓在後）。
// 斷言 key 而不是只斷言顏色，是因為本功能的重點正是「同一個顏色由不同 key 講不同的話」：
// 收縮壓 below_target 與舒張壓 diastolic_below_ref 共用 'below-target'，只有 key 能分辨。
const ruleKeys = (sys: number, dia: number, standard: BpStandard): string[] =>
  evaluateReading(sys, dia, null, standard).bpRules.map(rule => rule.key)

const zhLabel = (sys: number, dia: number, standard: BpStandard): string =>
  evaluateReading(sys, dia, null, standard).labels.zh

const ALL_STANDARDS: Array<[string, BpStandard]> = [
  ['general_adult', GENERAL_ADULT_STANDARD],
  ['post_op_strict', POST_OP_STRICT_STANDARD],
  ['elderly_relaxed', ELDERLY_RELAXED_STANDARD],
  ['ckd_diabetes', CKD_DIABETES_STANDARD],
  ['custom', createCustomStandard()],
]

// ---------------------------------------------------------------------------
// R1：hard floor 不得被任何模板降級
// ---------------------------------------------------------------------------

describe('R1 hard floor — 任何模板都不得把危險值降級', () => {
  ALL_STANDARDS.forEach(([name, standard]) => {
    test(`${name}：190/125 仍是極高危險`, () => {
      expect(getAlertLevel(190, 125, null, standard)).toBe('danger')
    })

    test(`${name}：85/45 仍是明顯偏低`, () => {
      expect(getAlertLevel(85, 45, null, standard)).toBe('danger-low')
    })

    test(`${name}：邊界值 180/119 與 179/120 都命中高側 floor`, () => {
      expect(getAlertLevel(180, 119, null, standard)).toBe('danger')
      expect(getAlertLevel(179, 120, null, standard)).toBe('danger')
    })
  })

  test('模板即使把危險區寫成目標帶，floor 仍先跑（floor 不是模板資料的一部分）', () => {
    // createCustomStandard 會擋下越界的目標；這裡直接手工組一份違規階梯，
    // 模擬「模板作者寫錯」的情況，證明守衛是結構性的，不是靠模板自律（§6.2）。
    const rogue: BpStandard = {
      key: 'rogue',
      names: { zh: '壞模板', id: 'Template rusak', en: 'Rogue template' },
      descriptions: { zh: '測試用', id: 'Untuk pengujian', en: 'For testing' },
      ladder: {
        kind: 'dual-axis',
        systolic: [{ levelKey: 'on_target', min: 0, max: 300 }],
        diastolic: [{ levelKey: null, min: 0, max: 300 }],
      },
    }
    expect(getAlertLevel(190, 125, null, rogue)).toBe('danger')
    expect(getAlertLevel(85, 45, null, rogue)).toBe('danger-low')
  })
})

// ---------------------------------------------------------------------------
// post_op_strict：收縮壓單軸目標帶 110–120
// ---------------------------------------------------------------------------

describe('post_op_strict 收縮壓階梯（目標 110–120）', () => {
  // 舒張壓一律給 70：落在 60–119 的「不標記」帶，讓這一組只驗收縮壓那一軸。
  test('109 → 低於目標（區間以外也算異常，不再維持原色）', () => {
    expect(ruleKeys(109, 70, POST_OP_STRICT_STANDARD)).toEqual(['below_target'])
    expect(getAlertLevel(109, 70, null, POST_OP_STRICT_STANDARD)).toBe('below-target')
  })

  test('110 與 120 → 在目標內（目標帶兩端都含在內）', () => {
    expect(ruleKeys(110, 70, POST_OP_STRICT_STANDARD)).toEqual(['on_target'])
    expect(ruleKeys(120, 70, POST_OP_STRICT_STANDARD)).toEqual(['on_target'])
    expect(getAlertLevel(115, 70, null, POST_OP_STRICT_STANDARD)).toBe('normal')
  })

  test('121 → 超出目標', () => {
    expect(ruleKeys(121, 70, POST_OP_STRICT_STANDARD)).toEqual(['off_target'])
    expect(getAlertLevel(121, 70, null, POST_OP_STRICT_STANDARD)).toBe('off-target')
  })

  test('135 → 偏高（沿用九級表既有分界，不是「明顯偏高」）', () => {
    // 規劃文件 §3.1 的表：135–159 偏高（實心紅）、160–179 才是明顯偏高。
    // issue #896 內文與 §8 仍寫著「135 → 明顯偏高」，那是 ec474ff 之前的舊版；以 §3.1 為準。
    expect(ruleKeys(135, 70, POST_OP_STRICT_STANDARD)).toEqual(['tinggi'])
    expect(getAlertLevel(135, 70, null, POST_OP_STRICT_STANDARD)).toBe('warning')
    expect(ruleKeys(160, 70, POST_OP_STRICT_STANDARD)).toEqual(['cukup_tinggi'])
  })

  test('90–99 沿用九級表的偏低，<90 撞 floor', () => {
    expect(ruleKeys(95, 70, POST_OP_STRICT_STANDARD)).toEqual(['warning_low'])
    expect(getAlertLevel(89, 70, null, POST_OP_STRICT_STANDARD)).toBe('danger-low')
  })

  test('目標帶可以被讀出來給報告印「依據」用（R5）', () => {
    expect(targetSystolicBand(POST_OP_STRICT_STANDARD)).toEqual({ min: 110, max: 120 })
    // 九級表沒有「目標帶」這個概念，回 null 而不是硬編一組數字。
    expect(targetSystolicBand(GENERAL_ADULT_STANDARD)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// post_op_strict：舒張壓警戒線 60（2026-09-22 更正，推翻「舒張壓不產生常規標記」的初版）
// ---------------------------------------------------------------------------

describe('post_op_strict 舒張壓階梯（警戒線 60）', () => {
  test('128/53 → 超出目標（判斷方向反轉，本功能最具體的價值證明）', () => {
    // 現行九級表把 128/53 判成「⚠️ 偏低」（舒張壓 50–54 用 operator: "or" 單獨命中），
    // 但依醫囑它其實是**超標**。這一筆是單一全域標準套在個別醫囑上最具體的危害。
    expect(zhLabel(128, 53, GENERAL_ADULT_STANDARD)).toBe('⚠️ 偏低')
    expect(ruleKeys(128, 53, POST_OP_STRICT_STANDARD)[0]).toBe('off_target')
    expect(zhLabel(128, 53, POST_OP_STRICT_STANDARD)).toContain('超出目標')
    // 舒張壓 53 落在 §3.1 階梯的 50–54「偏低」帶，所以兩軸都命中、兩件事都要講。
    expect(ruleKeys(128, 53, POST_OP_STRICT_STANDARD)).toEqual(['off_target', 'warning_low'])
  })

  test('119/56 → 在目標內 ＋ 舒張壓低於參考值（兩個標籤都要出現）', () => {
    const evaluation = evaluateReading(119, 56, null, POST_OP_STRICT_STANDARD)
    expect(evaluation.bpRules.map(rule => rule.key)).toEqual(['on_target', 'diastolic_below_ref'])
    expect(evaluation.labels.zh).toContain('在目標內')
    expect(evaluation.labels.zh).toContain('舒張壓低於參考值')
    expect(evaluation.labels.id).toContain('Dalam target')
    expect(evaluation.labels.id).toContain('Diastolik di bawah nilai rujukan')
    expect(evaluation.labels.en).toContain('On target')
    expect(evaluation.labels.en).toContain('Diastolic below reference')
    // 顏色取兩軸中較嚴重的那一階：收縮壓達標是綠色，但舒張壓 56 < 60 要看得見。
    expect(evaluation.level).toBe('below-target')
  })

  test('109/56 → 低於目標 ＋ 舒張壓低於參考值', () => {
    const evaluation = evaluateReading(109, 56, null, POST_OP_STRICT_STANDARD)
    expect(evaluation.bpRules.map(rule => rule.key)).toEqual(['below_target', 'diastolic_below_ref'])
    expect(evaluation.labels.zh).toContain('低於目標')
    expect(evaluation.labels.zh).toContain('舒張壓低於參考值')
    // 兩件事共用同一個視覺等級，由規則 key 分辨文案——刻意不為舒張壓新增第三個 AlertLevel。
    expect(evaluation.bpRules.every(rule => rule.webAlertLevel === 'below-target')).toBe(true)
    expect(evaluation.level).toBe('below-target')
  })

  test('122/62 → 超出目標，舒張壓不標記（62 ≥ 60）', () => {
    const evaluation = evaluateReading(122, 62, null, POST_OP_STRICT_STANDARD)
    expect(evaluation.bpRules.map(rule => rule.key)).toEqual(['off_target'])
    expect(evaluation.labels.zh).toBe('🔺 超出目標')
    expect(evaluation.level).toBe('off-target')
  })

  test('舒張壓警戒線正好在 60：59 標記、60 不標記', () => {
    expect(ruleKeys(115, 60, POST_OP_STRICT_STANDARD)).toEqual(['on_target'])
    expect(ruleKeys(115, 59, POST_OP_STRICT_STANDARD)).toEqual(['on_target', 'diastolic_below_ref'])
    expect(ruleKeys(115, 55, POST_OP_STRICT_STANDARD)).toEqual(['on_target', 'diastolic_below_ref'])
    expect(ruleKeys(115, 54, POST_OP_STRICT_STANDARD)).toEqual(['on_target', 'warning_low'])
  })

  test('舒張壓 <50 與 ≥120 仍命中 floor', () => {
    expect(getAlertLevel(116, 48, null, POST_OP_STRICT_STANDARD)).toBe('danger-low')
    expect(getAlertLevel(119, 47, null, POST_OP_STRICT_STANDARD)).toBe('danger-low')
    expect(getAlertLevel(115, 120, null, POST_OP_STRICT_STANDARD)).toBe('danger')
  })

  test('舒張壓高側：補上 §3.1 初版漏掉的 80／85／100 分界', () => {
    // 初版把舒張壓 60–119 整段寫成「不標記」，後果是 118/115 只顯示「🎯 在目標內」（綠色）,
    // 舒張壓 115 完全沒有提示——floor 要 ≥120 才接手，而臨床參考區間上限是 90 不是 119。
    //
    // 為什麼選 85 與 100 而不是臨床的 90：這兩個數字直接鏡射九級表（tinggi 的舒張壓 ≥85、
    // cukup_tinggi 的 ≥100）。若改用 90，舒張壓 87 會變成「general_adult 標偏高、post_op_strict
    // 不標記」——嚴格控制的模板反而比預設標準寬鬆，那是說不通的。沿用既有分界同時保證
    // 這個模板在高側永遠不會比 general_adult 鬆。
    expect(ruleKeys(118, 115, POST_OP_STRICT_STANDARD)).toEqual(['on_target', 'cukup_tinggi'])
    expect(ruleKeys(115, 92, POST_OP_STRICT_STANDARD)).toEqual(['on_target', 'tinggi'])
    // 80–84 是九級表的 observasi（🟡 偏高觀察），本模板必須跟著標記，否則會比預設標準寬鬆。
    expect(ruleKeys(115, 84, POST_OP_STRICT_STANDARD)).toEqual(['on_target', 'observasi'])
    expect(ruleKeys(115, 80, POST_OP_STRICT_STANDARD)).toEqual(['on_target', 'observasi'])
    // 只有 60–79 才是舒張壓的正常帶，標了只會製造噪音。
    expect(ruleKeys(115, 79, POST_OP_STRICT_STANDARD)).toEqual(['on_target'])
    expect(ruleKeys(115, 60, POST_OP_STRICT_STANDARD)).toEqual(['on_target'])
  })

  // 這一條用**全範圍掃描**而不是手挑幾個值，是因為手挑值漏過一次：
  // 初版只驗了 85／92／99／100／110／119，剛好從 80–84 這個洞的上緣開始，
  // 於是 115/82（general_adult 判 warning）在本模板被判成 normal——嚴格控制的模板
  // 比預設標準寬鬆，正是這條不變量要擋的事，卻因為取樣點的選擇而沒被測出來。
  // 掃描整個生理範圍才能讓「洞」不依賴人為挑值的運氣。
  test('不變量：post_op_strict 在任何讀數上都不比 general_adult 寬鬆', () => {
    const offenders: string[] = []
    for (let sys = 70; sys <= 200; sys++) {
      for (const dia of [45, 50, 55, 60, 70, 79, 80, 84, 85, 90, 99, 100, 110, 119, 120, 130]) {
        const base = getAlertLevel(sys, dia, null, GENERAL_ADULT_STANDARD)
        const strict = getAlertLevel(sys, dia, null, POST_OP_STRICT_STANDARD)
        if (base !== 'normal' && strict === 'normal') offenders.push(`${sys}/${dia} general=${base} post_op=${strict}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// §3.1 的實際資料對照表
// ---------------------------------------------------------------------------

describe('post_op_strict — 規劃文件 §3.1 的實際讀數對照', () => {
  // ⚠️ §3.1「用實際資料驗證」那張表是在舒張壓警戒線改成 60 之前寫的，只更新了 119/56 那一列。
  // 舒張壓 ≤59 的其餘幾列（111/51、117/53、128/53、136/57…）在表上仍寫「消掉舒張壓噪音」，
  // 與同一節的舒張壓階梯（50–54 偏低、55–59 低於參考值）互相矛盾。
  // 這裡以**階梯**為準（它是規範，且標了「實作時不得再自行放寬或收緊」），對照表視為過期，已在 PR 提出。
  const cases: Array<[number, number, string[], string]> = [
    [111, 51, ['on_target', 'warning_low'], 'warning-low'],
    [114, 52, ['on_target', 'warning_low'], 'warning-low'],
    [117, 53, ['on_target', 'warning_low'], 'warning-low'],
    [120, 52, ['on_target', 'warning_low'], 'warning-low'],
    [119, 56, ['on_target', 'diastolic_below_ref'], 'below-target'],
    [122, 62, ['off_target'], 'off-target'],
    [122, 66, ['off_target'], 'off-target'],
    [129, 61, ['off_target'], 'off-target'],
    [128, 53, ['off_target', 'warning_low'], 'warning-low'],
    [136, 57, ['tinggi', 'diastolic_below_ref'], 'warning'],
    [137, 59, ['tinggi', 'diastolic_below_ref'], 'warning'],
    [108, 54, ['below_target', 'warning_low'], 'warning-low'],
    [109, 62, ['below_target'], 'below-target'],
    [116, 48, ['danger_low'], 'danger-low'],
    [119, 47, ['danger_low'], 'danger-low'],
  ]

  cases.forEach(([sys, dia, keys, level]) => {
    test(`${sys}/${dia} → ${keys.join(' ＋ ')}`, () => {
      expect(ruleKeys(sys, dia, POST_OP_STRICT_STANDARD)).toEqual(keys)
      expect(getAlertLevel(sys, dia, null, POST_OP_STRICT_STANDARD)).toBe(level as never)
    })
  })

  test('新抓到的三筆：現在是綠色「正常」，換模板後變成超出目標', () => {
    ;[[122, 62], [122, 66], [129, 61]].forEach(([sys, dia]) => {
      expect(getAlertLevel(sys, dia, null, GENERAL_ADULT_STANDARD)).toBe('normal')
      expect(getAlertLevel(sys, dia, null, POST_OP_STRICT_STANDARD)).toBe('off-target')
    })
  })
})

// ---------------------------------------------------------------------------
// R3：九級表沒有被動到
// ---------------------------------------------------------------------------

describe('R3 general_adult 就是那張凍結的九級表', () => {
  test('119/56 在 general_adult 下仍是「✅ 正常 (舒張壓偏低點)」', () => {
    const evaluation = evaluateReading(119, 56, null, GENERAL_ADULT_STANDARD)
    expect(evaluation.bpRule.key).toBe('diastolic_low')
    expect(evaluation.labels.zh).toBe('✅ 正常 (舒張壓偏低點)')
    expect(evaluation.level).toBe('normal')
  })

  test('general_adult 的 ladder 直接指向 blood-pressure-spec.json，不是另一份副本', () => {
    expect(GENERAL_ADULT_STANDARD.ladder.kind).toBe('nine-level-spec')
  })

  test('general_adult 永遠只回一條規則（九級表是單一 first-match 表，不是雙軸）', () => {
    expect(ruleKeys(119, 56, GENERAL_ADULT_STANDARD)).toHaveLength(1)
    expect(ruleKeys(85, 90, GENERAL_ADULT_STANDARD)).toEqual(['tinggi'])
  })

  test('九級表刻意不套 hard floor 守衛，否則會改變既有行為', () => {
    // 140/45 在九級表是先命中 tinggi（operator: "or"，收縮壓 ≥135）。
    // 若把 danger_low 的守衛提到最前面，它會變成「明顯偏低」——那是真正的行為變更，撞 R3。
    expect(getAlertLevel(140, 45, null, GENERAL_ADULT_STANDARD)).toBe('warning')
    // 同一筆在雙軸模板下走 floor 先行，結果不同；這是模板之間本來就該不同，不是 bug。
    expect(getAlertLevel(140, 45, null, POST_OP_STRICT_STANDARD)).toBe('danger-low')
  })

  test('standardKey 會帶回輸出，讓報告印得出「依據哪一份標準」（R5）', () => {
    expect(evaluateReading(119, 56, null, GENERAL_ADULT_STANDARD).standardKey).toBe('general_adult')
    expect(evaluateReading(119, 56, null, POST_OP_STRICT_STANDARD).standardKey).toBe('post_op_strict')
  })
})

// ---------------------------------------------------------------------------
// 刻意的降級與下界
// ---------------------------------------------------------------------------

describe('elderly_relaxed — 刻意降級與提高的低側門檻', () => {
  test('130–139 明確斷言為 normal（R1 只保護 floor，這個放寬是刻意的）', () => {
    ;[130, 135, 139].forEach(sys => {
      expect(getAlertLevel(sys, 75, null, ELDERLY_RELAXED_STANDARD)).toBe('normal')
      expect(ruleKeys(sys, 75, ELDERLY_RELAXED_STANDARD)).toEqual(['on_target'])
    })
    // 對照：同樣的讀數在一般成人標準下是警示。降級是被決定的，不是被漏掉的。
    expect(getAlertLevel(130, 75, null, GENERAL_ADULT_STANDARD)).toBe('warning')
    expect(getAlertLevel(135, 75, null, GENERAL_ADULT_STANDARD)).toBe('warning')
  })

  test('下界真的生效：110 在高齡模板是低於目標，在一般成人是正常', () => {
    // 這一條就是 §6.3 否決 diff 模型的理由——diff 只改高側，112/70 會照走原表判成綠色正常。
    expect(getAlertLevel(110, 70, null, GENERAL_ADULT_STANDARD)).toBe('normal')
    expect(getAlertLevel(110, 70, null, ELDERLY_RELAXED_STANDARD)).toBe('below-target')
    expect(ruleKeys(110, 70, ELDERLY_RELAXED_STANDARD)).toEqual(['below_target'])
    expect(getAlertLevel(119, 70, null, ELDERLY_RELAXED_STANDARD)).toBe('below-target')
    expect(getAlertLevel(120, 70, null, ELDERLY_RELAXED_STANDARD)).toBe('normal')
  })

  test('低側門檻同步提高：100–109 由正常變偏低', () => {
    expect(getAlertLevel(105, 70, null, GENERAL_ADULT_STANDARD)).toBe('normal')
    expect(getAlertLevel(105, 70, null, ELDERLY_RELAXED_STANDARD)).toBe('warning-low')
  })
})

describe('ckd_diabetes — 舒張壓門檻收緊到 80', () => {
  test('82 的舒張壓在一般成人只是偏高觀察，在這裡是超出目標', () => {
    expect(evaluateReading(120, 82, null, GENERAL_ADULT_STANDARD).bpRule.key).toBe('observasi')
    expect(ruleKeys(120, 82, CKD_DIABETES_STANDARD)).toEqual(['on_target', 'off_target'])
    expect(getAlertLevel(120, 82, null, CKD_DIABETES_STANDARD)).toBe('off-target')
  })

  test('收縮壓目標與一般成人接近（110–129）', () => {
    expect(targetSystolicBand(CKD_DIABETES_STANDARD)).toEqual({ min: 110, max: 129 })
    expect(getAlertLevel(130, 70, null, CKD_DIABETES_STANDARD)).toBe('off-target')
  })
})

describe('custom — 照護者輸入的下界不是死欄位', () => {
  test('同一筆 119/70 會因為 systolicMin 不同而得到不同判讀', () => {
    // §6.3：diff 模型下「填 100 或填 80 畫面一模一樣」，那比功能沒做更糟。這一條就是反證。
    const tight = createCustomStandard({ systolicMin: 120, systolicMax: 140, diastolicMin: 65, diastolicMax: 80 })
    const loose = createCustomStandard({ systolicMin: 105, systolicMax: 140, diastolicMin: 65, diastolicMax: 80 })
    expect(getAlertLevel(119, 70, null, tight)).toBe('below-target')
    expect(getAlertLevel(119, 70, null, loose)).toBe('normal')
    expect(getAlertLevel(119, 70, null, GENERAL_ADULT_STANDARD)).toBe('normal')
  })

  test('舒張壓下界同樣生效', () => {
    const standard = createCustomStandard({ systolicMin: 110, systolicMax: 130, diastolicMin: 70, diastolicMax: 85 })
    expect(ruleKeys(120, 69, standard)).toEqual(['on_target', 'diastolic_below_ref'])
    expect(ruleKeys(120, 70, standard)).toEqual(['on_target'])
  })

  test('目標上界把固定分界推上去，醫師給的寬上界不會被九級表的 135 吃掉', () => {
    const standard = createCustomStandard({ systolicMin: 95, systolicMax: 150, diastolicMin: 60, diastolicMax: 90 })
    expect(getAlertLevel(150, 70, null, standard)).toBe('normal')
    expect(getAlertLevel(151, 70, null, standard)).toBe('warning')
    expect(getAlertLevel(94, 70, null, standard)).toBe('warning-low')
  })

  test('越界的目標在引擎層就擋下來，不必等資料庫 CHECK', () => {
    expect(() => createCustomStandard({ systolicMin: 80, systolicMax: 130, diastolicMin: 60, diastolicMax: 80 })).toThrow()
    expect(() => createCustomStandard({ systolicMin: 110, systolicMax: 190, diastolicMin: 60, diastolicMax: 80 })).toThrow()
    expect(() => createCustomStandard({ systolicMin: 130, systolicMax: 110, diastolicMin: 60, diastolicMax: 80 })).toThrow()
  })

  test('非有限值與小數目標一律擋下（NaN 參與的比較全部回 false，會整組靜默放行）', () => {
    // 這三筆在加守衛之前都不會丟例外，而是長出一張壞掉的階梯，實測結果分別是：
    // NaN 上界 → 110/70 判成「🔴 明顯偏高」；undefined 下界 → 判成「🎯 在目標內」；
    // 110.5–120.5 → 整數讀數 110 掉出所有區間、落到 normal_default 顯示「✅ 正常」，
    // 但它其實低於目標——正是本功能要消滅的那種「把該注意的資料漆成安全色」。
    const base = { systolicMin: 110, systolicMax: 130, diastolicMin: 60, diastolicMax: 80 }
    expect(() => createCustomStandard({ ...base, systolicMax: Number.NaN })).toThrow()
    expect(() => createCustomStandard({ ...base, systolicMin: undefined as unknown as number })).toThrow()
    expect(() => createCustomStandard({ ...base, diastolicMax: Number.POSITIVE_INFINITY })).toThrow()
    expect(() => createCustomStandard({ ...base, systolicMin: 110.5, systolicMax: 120.5 })).toThrow()
    expect(() => createCustomStandard({ ...base, diastolicMin: 60.5 })).toThrow()
  })
})

// ---------------------------------------------------------------------------
// 資料檔本身
// ---------------------------------------------------------------------------

describe('bp-levels.json 與模板資料', () => {
  test('與九級表共用的等級字串逐字相同（抽詞彙時不得順手改文案）', () => {
    const vocabulary = levels as unknown as Record<string, { labels: Record<string, string>; recommendations: Record<string, string>; webAlertLevel: string }>
    const specRules = [...spec.rules, spec.defaultRule] as unknown as Array<{ key: string; labels: Record<string, string>; recommendations: Record<string, string>; webAlertLevel: string }>
    specRules.forEach(rule => {
      expect(vocabulary[rule.key]).toBeDefined()
      expect(vocabulary[rule.key].labels).toEqual(rule.labels)
      expect(vocabulary[rule.key].recommendations).toEqual(rule.recommendations)
      expect(vocabulary[rule.key].webAlertLevel).toBe(rule.webAlertLevel)
    })
  })

  test('本次只新增兩個 AlertLevel：off-target 與 below-target', () => {
    const vocabulary = levels as unknown as Record<string, { webAlertLevel: string }>
    const newLevels = new Set(Object.values(vocabulary).map(item => item.webAlertLevel))
    expect(newLevels.has('off-target')).toBe(true)
    expect(newLevels.has('below-target')).toBe(true)
    // 收縮壓「低於目標」與舒張壓「低於參考值」共用 below-target，沒有第三個等級。
    expect(vocabulary.below_target.webAlertLevel).toBe('below-target')
    expect(vocabulary.diastolic_below_ref.webAlertLevel).toBe('below-target')
    expect([...newLevels].sort()).toEqual(['below-target', 'danger', 'danger-low', 'normal', 'off-target', 'warning', 'warning-low'])
  })

  test('每個模板階梯引用的等級 key 都存在於詞彙表', () => {
    const vocabulary = levels as unknown as Record<string, unknown>
    ALL_STANDARDS.forEach(([name, standard]) => {
      if (standard.ladder.kind !== 'dual-axis') return
      ;[...standard.ladder.systolic, ...standard.ladder.diastolic].forEach(band => {
        if (band.levelKey === null) return
        expect(`${name}:${band.levelKey}`).toBe(`${name}:${vocabulary[band.levelKey] ? band.levelKey : 'MISSING'}`)
      })
    })
  })

  test('resolveBpStandard 認得全部 key，未知 key 退回一般成人', () => {
    expect(resolveBpStandard('post_op_strict').key).toBe('post_op_strict')
    expect(resolveBpStandard('elderly_relaxed').key).toBe('elderly_relaxed')
    expect(resolveBpStandard('ckd_diabetes').key).toBe('ckd_diabetes')
    expect(resolveBpStandard('custom').key).toBe('custom')
    // 資料庫若出現本版不認得的模板 key（例如回滾到舊版），退回預設標準比丟例外安全。
    expect(resolveBpStandard('pregnancy').key).toBe('general_adult')
  })
})

// ---------------------------------------------------------------------------
// 心跳警示與模板併存
// ---------------------------------------------------------------------------

describe('心跳警示沿用既有串接方式', () => {
  test('雙軸都命中再加心跳時，三件事都出現在標籤裡', () => {
    const evaluation = evaluateReading(109, 56, 130, POST_OP_STRICT_STANDARD)
    expect(evaluation.labels.zh).toContain('低於目標')
    expect(evaluation.labels.zh).toContain('舒張壓低於參考值')
    expect(evaluation.labels.zh).toContain('心跳 >120')
    expect(evaluation.pulseWarning).toBe(true)
  })

  test('血壓正常時仍只顯示心跳警示（維持既有行為）', () => {
    const evaluation = evaluateReading(115, 70, 130, POST_OP_STRICT_STANDARD)
    expect(evaluation.labels.zh).toBe('⚠️ 心跳 >120')
    expect(evaluation.level).toBe('warning')
  })
})

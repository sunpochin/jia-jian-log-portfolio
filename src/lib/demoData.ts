/*
檔案用途：提供 /demo 模式之前端離線備援資料與免登入展示輔助函式。
所在層：src/lib；為展示模式與脈絡資料模組。
主要關聯：由 useAuth、血壓／體溫 hooks、CareTimeline、MedicationPage 與 App.tsx 呼叫，確保無網路或資料庫尚未 push 時也能順暢展示。
*/

import type { BpRecord, MedicationCatalog, MedicationPlan, TemperatureRecord } from '../types/database'
import type { MedicationPlanChangeLogView } from './medications'
import type { CareTimelineEntry } from './careTimeline'

export const DEMO_MEILING_PATIENT_ID = '55555555-5555-4555-a555-555555555555'
export const DEMO_CHEN_PATIENT_ID = '66666666-6666-4666-a666-666666666666'
// 李阿姨是永遠存在於 /demo 的驗證用對象，藥單直接對照真實使用者媽媽的服藥清單（品項與外觀，非真實個資），
// 讓「四個服藥分頁」「藥名紅色醒目」「英文優先顯示」這些畫面規則每次都能在 staging 立即驗證，不受真實 Supabase 資料異動影響。
export const DEMO_LEE_PATIENT_ID = '44444444-4444-4444-a444-444444444444'
// 與 lib/auth.ts 的同名常數保持相同 UUID 值；這裡獨立宣告是為了不讓純資料層反過來 import 驗證層。
export const DEMO_DOG_PATIENT_ID = '77777777-7777-4777-a777-777777777777'
export const DEMO_CAT_PATIENT_ID = '88888888-8888-4888-a888-888888888888'
export const DEMO_RABBIT_PATIENT_ID = '99999999-9999-4999-a999-999999999999'
export const DEMO_OTHER_PET_PATIENT_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'

// 展示資料必須跨重新整理與測試執行維持同一條時間軸；若使用現在時間，面試截圖與離線備援會每天漂移。
export const DEMO_FALLBACK_BASE_DATE = '2026-08-01T00:00:00.000Z'

const DEMO_PATIENT_IDS = new Set([DEMO_LEE_PATIENT_ID, DEMO_MEILING_PATIENT_ID, DEMO_CHEN_PATIENT_ID, DEMO_DOG_PATIENT_ID, DEMO_CAT_PATIENT_ID, DEMO_RABBIT_PATIENT_ID, DEMO_OTHER_PET_PATIENT_ID])

export function isDemoPatientId(patientId: string | null | undefined): boolean {
  if (!patientId) return false
  return DEMO_PATIENT_IDS.has(patientId)
}

export function getFallbackDemoBpRecords(days: number, patientId: string = DEMO_MEILING_PATIENT_ID): BpRecord[] {
  const records: BpRecord[] = []
  const baseNow = new Date(DEMO_FALLBACK_BASE_DATE)

  const getFluctuation = (base: number, d: number, slot: number, amplitude: number) => {
    const wave = Math.sin(d * 0.35) * amplitude
    const noise = Math.cos((d * 2.1 + slot * 4.3) * 1.1) * (amplitude * 0.6)
    return Math.round(base + wave + noise)
  }

  for (let day = Math.min(days, 90) - 1; day >= 0; day--) {
    const targetDate = new Date(baseNow.getTime() - day * 86400000)
    const year = targetDate.getFullYear()
    const month = String(targetDate.getMonth() + 1).padStart(2, '0')
    const dateStr = String(targetDate.getDate()).padStart(2, '0')
    const isoPrefix = `${year}-${month}-${dateStr}`

    const morningIso = new Date(`${isoPrefix}T08:15:00+08:00`).toISOString()
    const eveningIso = new Date(`${isoPrefix}T20:30:00+08:00`).toISOString()

    if (patientId === DEMO_CHEN_PATIENT_ID) {
      if (day % 2 === 0) {
        records.push({
          id: `demo-bp-chen-${day}-m`,
          patient_id: DEMO_CHEN_PATIENT_ID,
          systolic: getFluctuation(day > 40 ? 155 : 132, day, 1, 12),
          diastolic: getFluctuation(day > 40 ? 96 : 82, day, 1, 8),
          pulse: getFluctuation(78, day, 1, 6),
          measured_at: morningIso,
          created_at: morningIso,
          recorded_by: 'demo.chen@example.test',
          source: 'manual',
        })
      }
      continue
    }

    // 王美玲 (Demo 1) 故事歷程
    // 每個情節分支都會完整指定早晚讀值；不先放無效預設值可避免 lint 誤判與維護誤解。
    let sysM: number, diaM: number, pulseM: number
    let sysE: number, diaE: number, pulseE: number

    if (day >= 75) {
      sysM = getFluctuation(162, day, 1, 6)
      diaM = getFluctuation(98, day, 1, 4)
      pulseM = getFluctuation(86, day, 1, 4)

      sysE = getFluctuation(158, day, 2, 5)
      diaE = getFluctuation(95, day, 2, 4)
      pulseE = getFluctuation(84, day, 2, 3)
    } else if (day >= 68) {
      const progress = (75 - day) / 7
      sysM = Math.round(162 - progress * 32 + (Math.sin(day) * 3))
      diaM = Math.round(98 - progress * 24 + (Math.cos(day) * 2))
      pulseM = 80 - Math.round(progress * 8)
      sysE = sysM - 4
      diaE = diaM - 3
      pulseE = pulseM - 2
    } else if (day >= 64) {
      sysM = getFluctuation(108, day, 1, 4)
      diaM = getFluctuation(48, day, 1, 3)
      pulseM = getFluctuation(71, day, 1, 3)
      sysE = getFluctuation(105, day, 2, 4)
      diaE = getFluctuation(50, day, 2, 3)
      pulseE = getFluctuation(69, day, 2, 3)
    } else if (day === 45) {
      sysM = 122; diaM = 76; pulseM = 70
      sysE = 146; diaE = 92; pulseE = 84
    } else if (day === 15) {
      sysM = 124; diaM = 78; pulseM = 71
      const firstMeasuredIso = new Date(`${isoPrefix}T20:00:00+08:00`).toISOString()
      records.push({
        id: `demo-bp-meiling-${day}-e1`,
        patient_id: DEMO_MEILING_PATIENT_ID,
        systolic: 220,
        diastolic: 110,
        pulse: 104,
        measured_at: firstMeasuredIso,
        created_at: firstMeasuredIso,
        recorded_by: 'demo.caregiver@example.test',
        source: 'manual',
      })
      sysE = 162; diaE = 94; pulseE = 84
    } else {
      sysM = getFluctuation(123, day, 1, 5)
      diaM = getFluctuation(77, day, 1, 4)
      pulseM = getFluctuation(70, day, 1, 3)
      sysE = getFluctuation(120, day, 2, 4)
      diaE = getFluctuation(75, day, 2, 3)
      pulseE = getFluctuation(68, day, 2, 3)
    }

    records.push({
      id: `demo-bp-meiling-${day}-m`,
      patient_id: DEMO_MEILING_PATIENT_ID,
      systolic: sysM,
      diastolic: diaM,
      pulse: pulseM,
      measured_at: morningIso,
      created_at: morningIso,
      recorded_by: 'demo.caregiver@example.test',
      source: 'manual',
    })

    records.push({
      id: `demo-bp-meiling-${day}-e`,
      patient_id: DEMO_MEILING_PATIENT_ID,
      systolic: sysE,
      diastolic: diaE,
      pulse: pulseE,
      measured_at: eveningIso,
      created_at: eveningIso,
      recorded_by: 'demo.caregiver@example.test',
      source: 'manual',
    })
  }

  return records.sort((a, b) => new Date(b.measured_at).getTime() - new Date(a.measured_at).getTime())
}

export function getFallbackDemoTemperatureRecords(days: number, patientId: string = DEMO_MEILING_PATIENT_ID): TemperatureRecord[] {
  if (patientId !== DEMO_MEILING_PATIENT_ID && patientId !== DEMO_CHEN_PATIENT_ID) return []
  const baseNow = new Date(DEMO_FALLBACK_BASE_DATE)
  const count = Math.min(Math.max(1, days), 7)
  return Array.from({ length: count }, (_, index) => {
    const measuredAt = new Date(baseNow.getTime() - (count - index - 1) * 86_400_000 + 9 * 3_600_000).toISOString()
    const temperature = patientId === DEMO_CHEN_PATIENT_ID
      ? 37.2 + ((index % 3) * 0.2)
      : index === count - 1 ? 38.2 : 36.8 + ((index % 2) * 0.2)
    return {
      id: `demo-temperature-${patientId === DEMO_CHEN_PATIENT_ID ? 'chen' : 'meiling'}-${index}`,
      patient_id: patientId,
      temperature_c: temperature,
      measurement_site: 'ear' as const,
      context: (index === count - 1 ? 'symptoms' : 'routine') as TemperatureRecord['context'],
      notes: null,
      measured_at: measuredAt,
      created_at: measuredAt,
      recorded_by: patientId === DEMO_CHEN_PATIENT_ID ? 'demo.chen@example.test' : 'demo.caregiver@example.test',
      source: 'demo_fallback',
    }
  }).sort((left, right) => Date.parse(right.measured_at) - Date.parse(left.measured_at))
}

const mockMedication = (
  id: string,
  name: string,
  zh: string,
  idName: string,
  strengthMg = 5,
  strengthLabel = '5mg',
  appearanceColor: string | null = null,
  appearanceShape: string | null = 'round',
  genericName?: string,
  dosageForm: MedicationCatalog['dosage_form'] = 'tablet',
  // 只填公開可查證的 WHO ATC 碼（對照成分學名，非猜測）；查不到公開分類的藥維持 null，不硬套標籤。
  atcCode: string | null = null,
): MedicationCatalog => ({
  id,
  drug_product_id: null,
  brand_name: name,
  brand_name_zh: zh,
  brand_name_id: idName,
  // 部分商品名（例如 Lipitor、Bokey）跟成分學名不同；沒指定學名時才回退用商品名，避免破壞既有呼叫端行為。
  generic_name: genericName ?? name,
  strength_mg: strengthMg,
  strength_label: strengthLabel,
  dosage_form: dosageForm,
  specialties: [],
  verification_status: 'manually_verified',
  tfda_license_number: null,
  nhi_drug_code: null,
  appearance_note: null,
  appearance_color: appearanceColor,
  appearance_shape: appearanceShape,
  appearance_photo_url: null,
  created_at: DEMO_FALLBACK_BASE_DATE,
  atc_code: atcCode,
})

export function getFallbackDemoLeeMedicationCatalog(): MedicationCatalog[] {
  // 這七項是使用者媽媽實際在用的藥（品項與外觀對照 staging 驗證截圖），放進永遠存在的「李阿姨」demo 對象，
  // 讓四個服藥分頁與藥名顯示規則不必依賴登入帳號的真實 Supabase 資料就能反覆驗證。
  return [
    // atc_code 皆為公開可查證的 WHO ATC 分類碼（依成分學名對照，非猜測）：
    // Aspirin→B01AC06、Ticagrelor→B01AC24、Amlodipine+Valsartan→C09DB01、
    // Atorvastatin→C10AA05、Nebivolol→C07AB12。
    mockMedication('demo-med-lee-bokey-100', 'Bokey', '伯基腸溶微粒膠囊 100毫克', 'Bokey 100mg', 100, '100mg', 'orange', 'capsule', 'Aspirin', 'capsule', 'B01AC06'),
    mockMedication('demo-med-lee-brilinta-90', 'BRILINTA', '百無凝膜衣錠 90毫克', 'BRILINTA 90mg', 90, '90mg', null, 'round', 'Ticagrelor', 'tablet', 'B01AC24'),
    mockMedication('demo-med-lee-exforge-5-160', 'Exforge', '易安穩膜衣錠 5/160毫克', 'Exforge 5/160mg', 165, '5/160mg', 'yellow', 'oval', 'Amlodipine + Valsartan', 'tablet', 'C09DB01'),
    mockMedication('demo-med-lee-lipitor-40', 'Lipitor', '立普妥膜衣錠 40毫克', 'Lipitor 40mg', 40, '40mg', 'white', 'round', 'Atorvastatin', 'tablet', 'C10AA05'),
    mockMedication('demo-med-lee-nebilet-5', 'Nebilet', '耐比洛錠 5毫克', 'Nebilet 5mg', 5, '5mg', 'white', 'round', 'Nebivolol', 'tablet', 'C07AB12'),
    mockMedication('demo-med-lee-calcium-vitd-302', 'Calcium plus + Vitamin D biomedicine', 'Calcium plus + Vitamin D biomedicine 302毫克', 'Calcium plus + Vitamin D biomedicine 302mg', 302, '302mg', 'pink', 'other', 'Calcium plus + Vitamin D biomedicine', 'tablet', 'A12AX'),
    // Diphenidol 學名／商品未確認，沒有查證過的官方連結，不硬套分類碼。
    mockMedication('demo-med-lee-diphenidol-25', 'Diphenidol', '敵芬尼朵（學名／商品未確認）', 'Diphenidol 25mg', 25, '25mg', 'white', 'round', 'Diphenidol'),
  ]
}

export function getFallbackDemoLeeMedicationPlans(): MedicationPlan[] {
  // 早餐後與晚餐前對照截圖裡的兩個時段；鈣加維生素 D 一天兩次，跟真實藥單常見的分次補鈣習慣一致。
  const plan = (id: string, medicationId: string, slot: string, order: number, doseAmount = 1): MedicationPlan => ({
    id, account_email: 'demo.lee@example.test', patient_id: DEMO_LEE_PATIENT_ID,
    medication_id: medicationId, schedule_slot: slot, as_needed: false, dose_amount: doseAmount, dose_count: 1,
    display_order: order, active: true, created_at: DEMO_FALLBACK_BASE_DATE,
  })
  return [
    plan('demo-plan-lee-bokey', 'demo-med-lee-bokey-100', 'after_breakfast', 1),
    plan('demo-plan-lee-brilinta', 'demo-med-lee-brilinta-90', 'after_breakfast', 2),
    plan('demo-plan-lee-lipitor', 'demo-med-lee-lipitor-40', 'after_breakfast', 3),
    plan('demo-plan-lee-nebilet', 'demo-med-lee-nebilet-5', 'after_breakfast', 4),
    plan('demo-plan-lee-diphenidol', 'demo-med-lee-diphenidol-25', 'after_breakfast', 5),
    plan('demo-plan-lee-calcium-am', 'demo-med-lee-calcium-vitd-302', 'after_breakfast', 6),
    plan('demo-plan-lee-exforge', 'demo-med-lee-exforge-5-160', 'before_dinner', 7, 1),
    plan('demo-plan-lee-calcium-pm', 'demo-med-lee-calcium-vitd-302', 'before_dinner', 8),
  ]
}

export function getFallbackDemoMedicationCatalog(): MedicationCatalog[] {
  // Demo 先在前端準備完整藥品主檔，資料庫未 seed 或訪客未登入時仍能實際操作藥單表單。
  return [
    // 複方藥仍需數字欄位供舊資料契約排序，但畫面一律優先顯示已核對的 5/80mg 原始標示，不能把兩個成分相加成誤導性的 85 mg。
    // atc_code：Amlodipine+Valsartan→C09DB01、Metformin→A10BA02、Bisoprolol→C07AB07、
    // Furosemide→C03CA01、Atenolol→C07AB03（皆為公開查證的 WHO ATC 分類碼）。Isormol 學名
    // Isosorbide mononitrate 屬硝酸鹽類，對照表未收錄該分類，維持不顯示標籤。
    mockMedication('demo-med-exforge-5-80', 'Exforge', '易安穩膜衣錠 5/80毫克', 'Exforge 5/80mg', 85, '5/80mg', 'yellow', undefined, undefined, 'tablet', 'C09DB01'),
    mockMedication('demo-med-isormol-5', 'Isormol', '伊索莫持續錠 5毫克', 'Isormol 5mg', 5, '5mg', 'white'),
    mockMedication('demo-med-metformin-500', 'Glucophage', '庫魯化膜衣錠 500毫克', 'Glucophage 500mg', 500, '500mg', 'white', 'oval', undefined, 'tablet', 'A10BA02'),
    mockMedication('demo-med-concor-5', 'Concor', '康肯膜衣錠 5毫克', 'Concor 5mg', 5, '5mg', 'yellow', undefined, 'Bisoprolol', 'tablet', 'C07AB07'),
    mockMedication('demo-med-lasix-40', 'Lasix', '來喜適錠 40毫克', 'Lasix 40mg', 40, '40mg', 'white', undefined, 'Furosemide', 'tablet', 'C03CA01'),
    mockMedication('demo-med-legacy-bp-25', 'Atenolol', '壓樂適錠 25毫克', 'Atenolol 25mg', 25, '25mg', 'pink', undefined, undefined, 'tablet', 'C07AB03'),
  ]
}

export function getFallbackDemoMedicationPlans(): MedicationPlan[] {
  // 這些是故事中「現在仍在服用」的藥單；停用藥仍留在 history，不應再出現在每日點收。
  return [
    {
      id: 'demo-plan-exforge-meiling', account_email: 'demo.meiling@example.test', patient_id: DEMO_MEILING_PATIENT_ID,
      medication_id: 'demo-med-exforge-5-80', schedule_slot: 'morning', as_needed: false, dose_amount: 0.5, dose_count: 1,
      display_order: 1, active: true, created_at: DEMO_FALLBACK_BASE_DATE,
    },
    {
      id: 'demo-plan-metformin-meiling', account_email: 'demo.meiling@example.test', patient_id: DEMO_MEILING_PATIENT_ID,
      medication_id: 'demo-med-metformin-500', schedule_slot: 'before_bed', as_needed: false, dose_amount: 1, dose_count: 1,
      display_order: 2, active: true, created_at: DEMO_FALLBACK_BASE_DATE,
    },
    {
      id: 'demo-plan-concor-meiling', account_email: 'demo.meiling@example.test', patient_id: DEMO_MEILING_PATIENT_ID,
      medication_id: 'demo-med-concor-5', schedule_slot: 'morning', as_needed: false, dose_amount: 0.5, dose_count: 1,
      display_order: 3, active: true, created_at: DEMO_FALLBACK_BASE_DATE,
    },
    {
      id: 'demo-plan-isormol-meiling', account_email: 'demo.meiling@example.test', patient_id: DEMO_MEILING_PATIENT_ID,
      medication_id: 'demo-med-isormol-5', schedule_slot: 'before_bed', as_needed: false, dose_amount: 1, dose_count: 1,
      display_order: 4, active: false, created_at: DEMO_FALLBACK_BASE_DATE,
    },
    {
      id: 'demo-plan-legacy-meiling', account_email: 'demo.meiling@example.test', patient_id: DEMO_MEILING_PATIENT_ID,
      medication_id: 'demo-med-legacy-bp-25', schedule_slot: 'morning', as_needed: false, dose_amount: 1, dose_count: 1,
      display_order: 5, active: false, created_at: DEMO_FALLBACK_BASE_DATE,
    },
    {
      // Demo 保留一張合成 PRN plan，讓驗收者能看見「尚未評估／今天未需要」而不必連真實照護資料。
      id: 'demo-plan-lasix-prn-meiling', account_email: 'demo.meiling@example.test', patient_id: DEMO_MEILING_PATIENT_ID,
      medication_id: 'demo-med-lasix-40', schedule_slot: 'anytime', as_needed: true, dose_amount: 1, dose_count: 1,
      display_order: 6, active: true, created_at: DEMO_FALLBACK_BASE_DATE,
    },
    {
      id: 'demo-plan-lasix-chen', account_email: 'demo.chen@example.test', patient_id: DEMO_CHEN_PATIENT_ID,
      medication_id: 'demo-med-lasix-40', schedule_slot: 'morning', as_needed: false, dose_amount: 1, dose_count: 1,
      display_order: 1, active: true, created_at: DEMO_FALLBACK_BASE_DATE,
    },
  ]
}

export function getFallbackDemoMedicationHistory(): MedicationPlanChangeLogView[] {
  const baseNow = new Date(DEMO_FALLBACK_BASE_DATE)
  const dateAgoIso = (daysAgo: number) => new Date(baseNow.getTime() - daysAgo * 86400000).toISOString()

  return [
    {
      id: 'demo-log-1',
      patient_id: DEMO_MEILING_PATIENT_ID,
      action: 'deactivate',
      plan_id: 'demo-plan-legacy',
      medication_id: 'demo-med-legacy-bp-25',
      medication: mockMedication('demo-med-legacy-bp-25', 'Atenolol', '壓樂適錠 25毫克', 'Atenolol 25mg'),
      schedule_slot: 'morning',
      dose_amount: 1,
      dose_count: 1,
      as_needed: false,
      reason: '門診診斷：舊型降壓藥血壓控制未達標 (162/98 mmHg)，遵醫囑停用並更換處方。',
      actor_email: 'admin@careapp.local',
      before_snapshot: { plan_id: 'demo-plan-legacy', medication_id: 'demo-med-legacy-bp-25', schedule_slot: 'morning', dose_amount: 1, dose_count: 1, as_needed: false, active: true, brand_name: 'Atenolol', brand_name_zh: '壓樂適錠 25毫克', dosage_form: 'tablet' },
      after_snapshot: { plan_id: 'demo-plan-legacy', medication_id: 'demo-med-legacy-bp-25', schedule_slot: 'morning', dose_amount: 1, dose_count: 1, as_needed: false, active: false, brand_name: 'Atenolol', brand_name_zh: '壓樂適錠 25毫克', dosage_form: 'tablet' },
      recorded_at: dateAgoIso(75), effective_at: dateAgoIso(75),
      created_at: dateAgoIso(75),
    },
    {
      id: 'demo-log-2',
      patient_id: DEMO_MEILING_PATIENT_ID,
      action: 'create',
      plan_id: 'demo-plan-exforge',
      medication_id: 'demo-med-exforge-5-80',
      medication: mockMedication('demo-med-exforge-5-80', 'Exforge', '易安穩膜衣錠 5/80毫克', 'Exforge 5/80mg'),
      schedule_slot: 'morning',
      dose_amount: 0.5,
      dose_count: 1,
      as_needed: false,
      reason: '門診開立：開始使用易安穩 Exforge 5/80mg 每日早晨 0.5 錠，密切觀察前三日下降趨勢。',
      actor_email: 'admin@careapp.local',
      before_snapshot: {},
      after_snapshot: { plan_id: 'demo-plan-exforge', medication_id: 'demo-med-exforge-5-80', schedule_slot: 'morning', dose_amount: 0.5, dose_count: 1, as_needed: false, active: true, brand_name: 'Exforge', brand_name_zh: '易安穩膜衣錠 5/80毫克', dosage_form: 'tablet' },
      recorded_at: dateAgoIso(75), effective_at: dateAgoIso(75),
      created_at: dateAgoIso(75),
    },
    {
      id: 'demo-log-3',
      patient_id: DEMO_MEILING_PATIENT_ID,
      action: 'deactivate',
      plan_id: 'demo-plan-isormol',
      medication_id: 'demo-med-isormol-5',
      medication: mockMedication('demo-med-isormol-5', 'Isormol', '伊索莫持續錠 5毫克', 'Isormol 5mg'),
      schedule_slot: 'before_bed',
      dose_amount: 1,
      dose_count: 1,
      as_needed: false,
      reason: '緊急醫囑停用：因出現姿勢性頭暈且連三日舒張壓下降至 48-52 mmHg，主治醫師指示停用硝酸鹽類 Isormol。',
      actor_email: 'demo.caregiver@example.test',
      before_snapshot: { plan_id: 'demo-plan-isormol', medication_id: 'demo-med-isormol-5', schedule_slot: 'before_bed', dose_amount: 1, dose_count: 1, as_needed: false, active: true, brand_name: 'Isormol', brand_name_zh: '伊索莫持續錠 5毫克', dosage_form: 'tablet' },
      after_snapshot: { plan_id: 'demo-plan-isormol', medication_id: 'demo-med-isormol-5', schedule_slot: 'before_bed', dose_amount: 1, dose_count: 1, as_needed: false, active: false, brand_name: 'Isormol', brand_name_zh: '伊索莫持續錠 5毫克', dosage_form: 'tablet' },
      recorded_at: dateAgoIso(64), effective_at: dateAgoIso(64),
      created_at: dateAgoIso(64),
    },
    {
      id: 'demo-log-4',
      patient_id: DEMO_MEILING_PATIENT_ID,
      action: 'create',
      plan_id: 'demo-plan-concor',
      medication_id: 'demo-med-concor-5',
      medication: mockMedication('demo-med-concor-5', 'Concor', '康肯膜衣錠 5毫克', 'Concor 5mg'),
      schedule_slot: 'morning',
      dose_amount: 0.5,
      dose_count: 1,
      as_needed: false,
      reason: '門診加開：微調心律，早晨加開 Concor 5mg 半錠以輔助心率穩定 (70-75 bpm)。',
      actor_email: 'admin@careapp.local',
      before_snapshot: {},
      after_snapshot: { plan_id: 'demo-plan-concor', medication_id: 'demo-med-concor-5', schedule_slot: 'morning', dose_amount: 0.5, dose_count: 1, as_needed: false, active: true, brand_name: 'Concor', brand_name_zh: '康肯膜衣錠 5毫克', dosage_form: 'tablet' },
      recorded_at: dateAgoIso(30), effective_at: dateAgoIso(30),
      created_at: dateAgoIso(30),
    },
  ]
}

export function getFallbackDemoCareTimeline(): CareTimelineEntry[] {
  const baseNow = new Date(DEMO_FALLBACK_BASE_DATE)
  const dateAgoIso = (daysAgo: number) => new Date(baseNow.getTime() - daysAgo * 86400000).toISOString()

  return [
    {
      id: 'demo-timeline-1',
      patient_id: DEMO_MEILING_PATIENT_ID,
      event_type: 'doctor_instruction',
      title: '門診處方微調與降壓藥升級',
      details: '血壓連三週為 162/98 mmHg 偏高。主治醫師建議停用舊藥 Atenolol，改開易安穩 Exforge 5/80mg 每日早晨 0.5 錠，交代看護 caregiver 每日記錄雙時段讀值。',
      occurred_at: dateAgoIso(75),
      reassess_on: null,
      created_by: 'admin@careapp.local',
      created_at: dateAgoIso(75),
      medication_plan_id: null,
    },
    {
      id: 'demo-timeline-2',
      patient_id: DEMO_MEILING_PATIENT_ID,
      event_type: 'symptom_observation',
      title: '舒張壓偏低與姿勢性頭暈記錄',
      details: '看護 caregiver 筆記：媽媽早上起床反映頭眩暈、下床站立不穩，當量血壓 108/48 mmHg（舒張壓低於 50 mmHg）。已協助躺平休息，並致電門診護理師報備。',
      occurred_at: dateAgoIso(65),
      reassess_on: null,
      created_by: 'demo.caregiver@example.test',
      created_at: dateAgoIso(65),
      medication_plan_id: null,
    },
    {
      id: 'demo-timeline-3',
      patient_id: DEMO_MEILING_PATIENT_ID,
      event_type: 'medication_change',
      title: '門診急診通告：停用 Isormol 血管擴張劑',
      details: '醫師評估頭暈與低舒張壓後，指示立即停用晚間 Isormol 5mg，避免血管擴張過度。停藥後兩日舒張壓即回升至 74 mmHg，頭暈症狀消失。',
      occurred_at: dateAgoIso(64),
      reassess_on: null,
      created_by: 'admin@careapp.local',
      created_at: dateAgoIso(64),
      medication_plan_id: null,
    },
    {
      id: 'demo-timeline-4',
      patient_id: DEMO_MEILING_PATIENT_ID,
      event_type: 'milestone',
      title: '晚藥漏服與隔日補點收提醒',
      details: '當晚因家中活動忘記服用晚間降壓與血糖藥，系統標記今日晚藥未確認。隔日早晨補點收並提醒每日鬧鐘。',
      occurred_at: dateAgoIso(45),
      reassess_on: null,
      created_by: 'demo.caregiver@example.test',
      created_at: dateAgoIso(45),
      medication_plan_id: null,
    },
    {
      id: 'demo-timeline-5',
      patient_id: DEMO_MEILING_PATIENT_ID,
      event_type: 'milestone',
      title: '門診定期追蹤與加開 Concor 安定心率',
      details: '心臟科門診複診，血壓維持 122/78 mmHg 良好。因平均心率 86 bpm 微快，醫師加開 Concor 康肯 5mg 每日早晨 0.5 錠。',
      occurred_at: dateAgoIso(30),
      reassess_on: null,
      created_by: 'admin@careapp.local',
      created_at: dateAgoIso(30),
      medication_plan_id: null,
    },
    {
      id: 'demo-timeline-6',
      patient_id: DEMO_MEILING_PATIENT_ID,
      event_type: 'symptom_observation',
      title: '突發高血壓 220/110 mmHg 處置與 15 分鐘二測',
      details: '晚間 20:00 測得 220/110 mmHg。看護 caregiver 按照照護 SOP 讓媽媽靜臥 15 分鐘，於 20:15 進行二次複測，讀值降至 162/96 mmHg，無言語不清或肢體無力。已傳送 LINE 通知台中家屬備查。',
      occurred_at: dateAgoIso(15),
      reassess_on: null,
      created_by: 'demo.caregiver@example.test',
      created_at: dateAgoIso(15),
      medication_plan_id: null,
    },
    {
      id: 'demo-timeline-7',
      patient_id: DEMO_MEILING_PATIENT_ID,
      event_type: 'symptom_observation',
      title: '輕微感冒症狀與心衰竭體重水腫監測',
      details: '媽媽出現鼻塞與輕微咳嗽，體重由 58.1 kg 略升至 59.4 kg。看護密切觀察是否為下肢水腫或心衰竭積水，經補充溫水與三日後體重已回復 58.2 kg。',
      occurred_at: dateAgoIso(8),
      reassess_on: null,
      created_by: 'demo.caregiver@example.test',
      created_at: dateAgoIso(8),
      medication_plan_id: null,
    },
    {
      id: 'demo-timeline-8',
      patient_id: DEMO_MEILING_PATIENT_ID,
      event_type: 'doctor_instruction',
      title: '90 天照護綜合門診評估',
      details: '主治醫師參閱全三個月血壓趨勢圖表與服藥遵從率，稱讚照護品質優良，血壓控制良好（平均 122/77 mmHg），開立未來 3 個月慢性病連續處方箋。',
      occurred_at: dateAgoIso(1),
      reassess_on: null,
      created_by: 'admin@careapp.local',
      created_at: dateAgoIso(1),
      medication_plan_id: null,
    },
  ]
}

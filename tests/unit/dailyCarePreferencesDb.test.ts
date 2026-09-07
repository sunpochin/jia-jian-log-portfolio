/*
檔案用途：驗證每日照護顯示偏好以 patient_id 共用讀寫，含 12 個模組旗標與自訂範本開關，並保留安全預設。
所在層：tests/unit；以 Supabase client stub 覆蓋資料轉接層，不連線遠端環境。
主要關聯：src/lib/dailyCarePreferences.ts 與 patient_daily_care_preferences migration。
*/
import { beforeEach, describe, expect, mock, test } from 'bun:test'

type Response = { data?: unknown; error?: unknown }
const responses: Response[] = []
const calls: Array<{ method: string; args: unknown[] }> = []

const supabase = {
  from(table: string) {
    expect(table).toBe('patient_daily_care_preferences')
    const response = responses.shift() ?? { data: null, error: null }
    const chain: Record<string, (...args: unknown[]) => unknown> = {}
    chain.select = (...args) => { calls.push({ method: 'select', args }); return chain }
    chain.eq = (...args) => { calls.push({ method: 'eq', args }); return chain }
    chain.maybeSingle = () => Promise.resolve(response)
    chain.upsert = (...args) => { calls.push({ method: 'upsert', args }); return Promise.resolve(response) }
    return chain
  },
}

mock.module('../../src/lib/supabase', () => ({ supabase }))

const { readDailyCarePreferenceForPatient, saveDailyCarePreferenceForPatient } = await import('../../src/lib/dailyCarePreferences')

const ALL_VISIBLE = { bloodPressure: true, temperature: true, medication: true, nutrition: true, weight: true, petLiquidIntake: true, petDigestion: true, petAppetite: true, petFluidTherapy: true, petEndocrine: true, dementiaCare: false, fluidBalance: false, careReminders: true }

beforeEach(() => {
  responses.length = 0
  calls.length = 0
})

describe('daily care display preference adapter', () => {
  test('defaults to all modules and non-custom template when no patient row exists', async () => {
    responses.push({ data: null, error: null })
    // hasStoredPreference 為 false 是引導精靈判斷「這位病人真的還沒設定過」的唯一依據，
    // 不能只看 preference 是否等於預設值——設定過但剛好全開的病人不該再被精靈打斷並覆蓋設定。
    await expect(readDailyCarePreferenceForPatient('patient-1')).resolves.toEqual({ preference: ALL_VISIBLE, useCustomTemplate: false, hasStoredPreference: false })
    expect(calls).toEqual([
      { method: 'select', args: ['show_blood_pressure, show_temperature, show_medication, show_nutrition, show_weight, show_pet_liquid_intake, show_pet_digestion, show_pet_appetite, show_pet_fluid_therapy, show_pet_endocrine, show_dementia_care, show_fluid_balance, show_care_reminders, use_custom_template'] },
      { method: 'eq', args: ['patient_id', 'patient-1'] },
    ])
  })

  test('maps a stored row to the display preference shape, including pet flags and custom template', async () => {
    responses.push({ data: { show_blood_pressure: true, show_temperature: false, show_medication: true, show_nutrition: false, show_weight: true, show_pet_liquid_intake: false, show_pet_digestion: true, show_pet_appetite: false, show_pet_fluid_therapy: true, show_pet_endocrine: false, show_dementia_care: true, show_fluid_balance: true, show_care_reminders: false, use_custom_template: true }, error: null })
    await expect(readDailyCarePreferenceForPatient('patient-1')).resolves.toEqual({
      preference: { bloodPressure: true, temperature: false, medication: true, nutrition: false, weight: true, petLiquidIntake: false, petDigestion: true, petAppetite: false, petFluidTherapy: true, petEndocrine: false, dementiaCare: true, fluidBalance: true, careReminders: false },
      useCustomTemplate: true,
      hasStoredPreference: true,
    })
  })

  test('upserts all twelve module flags plus the custom template flag with the patient conflict key', async () => {
    responses.push({ data: null, error: null })
    await expect(saveDailyCarePreferenceForPatient('patient-2', {
      preference: { bloodPressure: true, temperature: true, medication: false, nutrition: false, weight: true, petLiquidIntake: true, petDigestion: false, petAppetite: true, petFluidTherapy: false, petEndocrine: true, dementiaCare: true, fluidBalance: true, careReminders: true },
      useCustomTemplate: true,
    })).resolves.toBeUndefined()
    expect(calls[0]).toMatchObject({ method: 'upsert' })
    expect(calls[0]?.args[0]).toEqual({
      patient_id: 'patient-2',
      show_blood_pressure: true,
      show_temperature: true,
      show_medication: false,
      show_nutrition: false,
      show_weight: true,
      show_pet_liquid_intake: true,
      show_pet_digestion: false,
      show_pet_appetite: true,
      show_pet_fluid_therapy: false,
      show_pet_endocrine: true,
      show_dementia_care: true,
      show_fluid_balance: true,
      show_care_reminders: true,
      use_custom_template: true,
      updated_at: expect.any(String),
    })
    expect(calls[0]?.args[1]).toEqual({ onConflict: 'patient_id' })
  })

  test('surfaces database failures so the UI can keep its safe fallback', async () => {
    const failure = new Error('settings unavailable')
    responses.push({ data: null, error: failure })
    await expect(readDailyCarePreferenceForPatient('patient-3')).rejects.toBe(failure)
  })
})

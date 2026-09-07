/*
檔案用途：測試藥品目錄搜尋、規範化、物種適用性與 Registry 多來源檢索輔助函式。
所在層：tests/unit 單元測試層。
主要關聯：驗證 src/lib/medicationCatalog.ts 之邏輯正確性。
*/
import { describe, expect, test } from 'bun:test'
import { isDrugSuitableForSpecies, normalizeMedicationQuery, parseDosageFormFromText, parseStrengthFromDrugName, searchMedicationCatalog, searchMedicationRegistry } from '../../src/lib/medicationCatalog'

const medications = [
  { id: 'exforge-5-160', drug_product_id: null, brand_name: 'Exforge 5/160', brand_name_zh: null, generic_name: 'Amlodipine + Valsartan', strength_mg: 160, dosage_form: 'tablet', specialties: ['cardiovascular'], verification_status: 'manually_verified' as const, tfda_license_number: null, nhi_drug_code: null, appearance_color: null, appearance_shape: null, appearance_photo_url: null },
  { id: 'famotidine-20', drug_product_id: null, brand_name: 'Famotidine', brand_name_zh: null, generic_name: 'Famotidine', strength_mg: 20, dosage_form: 'tablet', specialties: ['gastroenterology'], verification_status: 'manually_verified' as const, tfda_license_number: null, nhi_drug_code: null, appearance_color: null, appearance_shape: null, appearance_photo_url: null },
  { id: 'bokey-100', drug_product_id: null, brand_name: 'Bokey', brand_name_zh: '伯基腸溶微粒膠囊 100 毫克', generic_name: 'Aspirin', strength_mg: 100, dosage_form: 'capsule', specialties: ['cardiovascular'], verification_status: 'official' as const, tfda_license_number: '衛署藥製字第037344號', nhi_drug_code: 'AC373441G0', appearance_color: null, appearance_shape: null, appearance_photo_url: null },
]

describe('medication catalog search', () => {
  test('normalizes full-width characters and common milligram spellings without discarding doses', () => {
    expect(normalizeMedicationQuery(' ＬＡＴＲＩＧＩＮＥ　５０毫克 ')).toBe('latrigine 50mg')
    expect(normalizeMedicationQuery('Latrigine-50 milligrams')).toBe('latrigine-50 mg')
    expect(normalizeMedicationQuery('Latrigine 50milligrams')).toBe('latrigine 50mg')
  })

  test('matches a partial name and applies the optional specialty filter', () => {
    expect(searchMedicationCatalog(medications, 'exfor', '')).toEqual([medications[0]])
    expect(searchMedicationCatalog(medications, '', 'gastroenterology')).toEqual([medications[1]])
    expect(searchMedicationCatalog(medications, 'fam', 'cardiovascular')).toEqual([])
  })

  test('excludes medications already shown in the personal box', () => {
    expect(searchMedicationCatalog(medications, '', 'cardiovascular', new Set(['exforge-5-160', 'bokey-100']))).toEqual([])
  })

  test('finds the linked Bokey product by Chinese name or official code', () => {
    expect(searchMedicationCatalog(medications, '伯基', '')).toEqual([medications[2]])
    expect(searchMedicationCatalog(medications, 'AC373441G0', '')).toEqual([medications[2]])
  })

  test('checks species suitability and contraindications correctly', () => {
    const dogMedicine = { applicable_species: ['dog'], contraindicated_species: ['cat'] }
    expect(isDrugSuitableForSpecies(dogMedicine, 'dog')).toEqual({ suitable: true, contraindicated: false })
    expect(isDrugSuitableForSpecies(dogMedicine, 'cat')).toEqual({ suitable: false, contraindicated: true })
    expect(isDrugSuitableForSpecies(dogMedicine, 'human')).toEqual({ suitable: false, contraindicated: false })
  })

  test('returns empty array when searchMedicationRegistry query is under 2 characters', async () => {
    await expect(searchMedicationRegistry('a')).resolves.toEqual([])
    await expect(searchMedicationRegistry('')).resolves.toEqual([])
  })

  test('executes searchMedicationRegistry and returns candidates', async () => {
    const results = await searchMedicationRegistry('dexlansoprazole')
    expect(Array.isArray(results)).toBe(true)
  })

  test('parses dosage form from drug text correctly', () => {
    expect(parseDosageFormFromText('得喜胃通30毫克緩釋膠囊')).toBe('capsule')
    expect(parseDosageFormFromText('加斯克兒錠40毫克')).toBe('tablet')
    expect(parseDosageFormFromText('咳嗽糖漿')).toBe('liquid')
    expect(parseDosageFormFromText('軟膏')).toBe('tablet')
    // 「顆粒」要判成粉包，不能因為有個「顆」字就落回錠劑。
    expect(parseDosageFormFromText('鈣加D 檸檬酸鈣粉劑')).toBe('powder')
    expect(parseDosageFormFromText('益生菌顆粒劑')).toBe('powder')
    expect(parseDosageFormFromText('Oral Powder Sachet')).toBe('powder')
  })

  test('parses strength in mg from Chinese and English product names', () => {
    expect(parseStrengthFromDrugName('得喜胃通60毫克緩釋膠囊')).toBe(60)
    expect(parseStrengthFromDrugName('Dexilant Delayed Release Capsules 30mg')).toBe(30)
    expect(parseStrengthFromDrugName('加斯克兒錠 40 毫克')).toBe(40)
    expect(parseStrengthFromDrugName('無數字藥品')).toBe(0)
    expect(parseStrengthFromDrugName('許可證 9999 號')).toBe(0)
  })
})

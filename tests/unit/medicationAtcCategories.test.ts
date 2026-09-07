/*
檔案用途：驗證 ATC 分類碼轉雙語主要功能標籤的比對規則，包含前綴優先序與未命中時的安全回退。
所在層：tests/unit 單元測試層。
主要關聯：驗證 src/lib/medicationAtcCategories.ts。
*/
import { describe, expect, test } from 'bun:test'
import { resolveMedicationCategory } from '../../src/lib/medicationAtcCategories'

describe('medication ATC category resolver', () => {
  test('matches a known therapeutic category and stays bilingual', () => {
    expect(resolveMedicationCategory('C09DA01')).toEqual({ id: 'Obat tekanan darah tinggi (ACE/ARB)', zh: '降血壓藥（ACE抑制劑／ARB）' ,en: "Medication blood pressure high (ACE/ARB)" })
    expect(resolveMedicationCategory('a10bh05')).toEqual({ id: 'Obat diabetes', zh: '糖尿病用藥' ,en: "Medication diabetes" })
  })

  test('prefers the more specific prefix when two entries could both match', () => {
    // B01AC 抗血小板藥是 B01A 抗凝血藥的子分類；命中順序不能被表格排列意外反轉。
    expect(resolveMedicationCategory('B01AC06')).toEqual({ id: 'Obat antiplatelet (pengencer darah)', zh: '抗血小板藥（血液稀釋劑）' ,en: "Medication antiplatelet (pengencer blood)" })
    expect(resolveMedicationCategory('B01AA03')).toEqual({ id: 'Obat antikoagulan (pengencer darah)', zh: '抗凝血藥（血液稀釋劑）' ,en: "Medication antikoagulan (pengencer blood)" })
  })

  test('matches the newer prefixes added for generic-only medications', () => {
    expect(resolveMedicationCategory('C01DA14')).toEqual({ id: 'Obat nitrat (angina)', zh: '硝酸鹽類（心絞痛用藥）' ,en: "Medication nitrat (angina)" })
    expect(resolveMedicationCategory('A04AD05')).toEqual({ id: 'Obat mual/vertigo', zh: '止吐／暈眩用藥' ,en: "Medication mual/vertigo" })
    expect(resolveMedicationCategory('N03AX09')).toEqual({ id: 'Obat anti-epilepsi', zh: '抗癲癇藥' ,en: "Medication anti-epilepsi" })
  })

  test('returns null for missing or unrecognized codes instead of guessing', () => {
    expect(resolveMedicationCategory(null)).toBeNull()
    expect(resolveMedicationCategory(undefined)).toBeNull()
    expect(resolveMedicationCategory('  ')).toBeNull()
    expect(resolveMedicationCategory('Z99ZZ99')).toBeNull()
  })
})

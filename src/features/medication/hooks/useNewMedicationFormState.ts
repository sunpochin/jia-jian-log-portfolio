/*
檔案用途：useMedicationAdminForm 三組職責之一——「新藥品表單」的原始狀態（品名、劑型、外觀、修正欄位等）。
所在層：src/features/medication/hooks；只持有這組狀態，不含跨組業務邏輯。
主要關聯：由 useMedicationAdminForm 組合使用；addNew／applyDraft／addExisting 的修正分支等跨組操作
  仍留在 useMedicationAdminForm，因為那些操作同時牽動「既有醫囑表單」與「資料載入」那兩組狀態。
*/
import { useState } from 'react'

export function useNewMedicationFormState() {
  const [brandName, setBrandName] = useState('')
  const [brandNameZh, setBrandNameZh] = useState('')
  const [genericName, setGenericName] = useState('')
  const [strengthMg, setStrengthMg] = useState('')
  // 「種類」三選一：處方藥／營養品・保健食品／其他（成藥、國外購入）。'other' 送出時等同 'drug'
  // （文件 §4.3：處方藥與其他行為相同，都維持 mg 數字欄），只有 'supplement' 會隱藏 mg 欄、改要求
  // strengthLabel。三個選項分開存放才能在畫面上保留各自的文案，而不是把「其他」誤存成「處方藥」。
  const [productKind, setProductKind] = useState<'drug' | 'supplement' | 'other'>('drug')
  // 包裝上的劑量原文：營養品必填（沒有可信的 mg 數字），處方藥／其他選填（複方藥標示、或 AI 藥袋
  // 讀到非 mg 單位時落地於此，讓照護者仍能看到、確認這段文字，而不是直接被丟掉）。
  const [strengthLabel, setStrengthLabel] = useState('')
  const [dosageForm, setDosageForm] = useState('tablet')
  const [newScheduleSlot, setNewScheduleSlot] = useState('after_breakfast')
  const [newScheduleSlots, setNewScheduleSlots] = useState<string[]>(['after_breakfast'])
  const [newDoseAmount, setNewDoseAmount] = useState('1')
  const [newAsNeeded, setNewAsNeeded] = useState(false)
  const [appearanceColor, setAppearanceColor] = useState('')
  const [appearanceShape, setAppearanceShape] = useState('')
  const [appearancePhotoUrl, setAppearancePhotoUrl] = useState('')
  // 「調整」既有醫囑時，藥品本身的劑型／外觀登錄預設收合，避免每次只是改時段或劑量卻被誤導去動藥品資料。
  const [isCorrectingMedication, setIsCorrectingMedication] = useState(false)
  // 修正欄位（劑型／顏色／形狀／照片）只要被實際改過，就算之後按「收合」也要在送出時一併帶入；
  // 若只沿用 isCorrectingMedication（單純代表面板是否展開），收合會讓已上傳的照片等修正在儲存時被悄悄丟棄。
  const [hasCorrectionEdits, setHasCorrectionEdits] = useState(false)
  const [newChangeReason, setNewChangeReason] = useState('')

  return {
    brandName, setBrandName,
    brandNameZh, setBrandNameZh,
    genericName, setGenericName,
    strengthMg, setStrengthMg,
    productKind, setProductKind,
    strengthLabel, setStrengthLabel,
    dosageForm, setDosageForm,
    newScheduleSlot, setNewScheduleSlot,
    newScheduleSlots, setNewScheduleSlots,
    newDoseAmount, setNewDoseAmount,
    newAsNeeded, setNewAsNeeded,
    appearanceColor, setAppearanceColor,
    appearanceShape, setAppearanceShape,
    appearancePhotoUrl, setAppearancePhotoUrl,
    isCorrectingMedication, setIsCorrectingMedication,
    hasCorrectionEdits, setHasCorrectionEdits,
    newChangeReason, setNewChangeReason,
  }
}

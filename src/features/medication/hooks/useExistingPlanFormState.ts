/*
檔案用途：useMedicationAdminForm 三組職責之一——「既有醫囑表單」的原始狀態（選藥、時段、劑量、調整目標等）。
所在層：src/features/medication/hooks；只持有這組狀態與同組欄位的重置，不含跨組業務邏輯。
主要關聯：由 useMedicationAdminForm 組合使用；跨組操作（resetSelection、chooseMedication、addExisting 等）
  仍留在 useMedicationAdminForm，因為那些操作同時牽動「新藥品表單」那組狀態。
*/
import { useState } from 'react'

export function useExistingPlanFormState() {
  const [medicationId, setMedicationId] = useState('')
  const [selectionConfirmed, setSelectionConfirmed] = useState(false)
  const [existingScheduleSlot, setExistingScheduleSlot] = useState('after_breakfast')
  const [existingScheduleSlots, setExistingScheduleSlots] = useState<string[]>(['after_breakfast'])
  const [existingDoseAmount, setExistingDoseAmount] = useState('1')
  const [existingAsNeeded, setExistingAsNeeded] = useState(false)
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null)
  const [catalogQuery, setCatalogQuery] = useState('')
  // 兩張表單各自保留原因，避免切換新增方式時把前一張表單的交接理由誤帶到另一筆醫囑。
  const [existingChangeReason, setExistingChangeReason] = useState('')
  // 藥袋 OCR 草稿只負責猜品名，交給既有搜尋＋逐項確認流程接手，不另外做一條寫入路徑。
  const [isCatalogSearchOpen, setIsCatalogSearchOpen] = useState(false)

  const resetPlanFields = () => {
    // 時段／劑量／PRN 屬於「上一顆藥的醫囑」，換藥或結束調整時必須回到預設值；
    // 否則剛調整完 PRN 藥再加新藥，會預帶「不限時間 · 需要時服用」而看起來像系統幫忙填好了。
    setExistingScheduleSlot('after_breakfast')
    setExistingScheduleSlots(['after_breakfast'])
    setExistingDoseAmount('1')
    setExistingAsNeeded(false)
  }

  return {
    medicationId, setMedicationId,
    selectionConfirmed, setSelectionConfirmed,
    existingScheduleSlot, setExistingScheduleSlot,
    existingScheduleSlots, setExistingScheduleSlots,
    existingDoseAmount, setExistingDoseAmount,
    existingAsNeeded, setExistingAsNeeded,
    editingPlanId, setEditingPlanId,
    catalogQuery, setCatalogQuery,
    existingChangeReason, setExistingChangeReason,
    isCatalogSearchOpen, setIsCatalogSearchOpen,
    resetPlanFields,
  }
}

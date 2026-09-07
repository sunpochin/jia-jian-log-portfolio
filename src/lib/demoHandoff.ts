/*
檔案用途：讓 /demo 試用時勾選的每日照護模組組合，能在使用者登入正式帳號後自動帶入初始設定。
所在層：src/lib 共用規則層；只搬「模組開關偏好」這種帳號層設定，不觸碰、不讀取任何 demo 健康數值。
主要關聯：App.tsx（試用導覽 CTA 寫入、首次登入讀取套用）、dailyCarePreferences（實際存檔）、
         onboardingWizard 的 buildOnboardingDailyCarePreference（把模組清單換算成完整開關物件）。
*/
import type { DailyCareModuleId } from './dailyCareModules'

const HANDOFF_STORAGE_KEY = 'jiajianlog.demo-handoff.v1'

export interface DemoHandoffPayload {
  moduleIds: DailyCareModuleId[]
  useCustomTemplate: boolean
  capturedAt: string
}

// 只接受目前模組清單裡真的存在的 id；避免舊版試用頁留下的過期或手動竄改的 key 混進正式偏好。
function isDailyCareModuleId(value: unknown): value is DailyCareModuleId {
  return typeof value === 'string' && ['bloodPressure', 'temperature', 'medication', 'nutrition', 'weight', 'petLiquidIntake', 'petDigestion', 'petAppetite', 'petFluidTherapy', 'petEndocrine', 'dementiaCare', 'fluidBalance'].includes(value)
}

// 導覽最後一步的 CTA 呼叫這個函式，把「試用時開了哪些模組」寫進一個與病人／帳號無關的中繼 key；
// 離開 /demo 導向登入頁後，首次登入的正式帳號才讀得到，讀完即清除，不留下可回溯的試用足跡。
export function writeDemoModuleHandoff(payload: Omit<DemoHandoffPayload, 'capturedAt'>): void {
  try {
    globalThis.localStorage.setItem(HANDOFF_STORAGE_KEY, JSON.stringify({ ...payload, capturedAt: new Date().toISOString() }))
  } catch {
    // 寫入失敗時最多是登入後看不到「沿用剛剛選的模組」，不影響試用與登入本身能不能完成。
  }
}

export function readDemoModuleHandoff(): DemoHandoffPayload | null {
  try {
    const raw = globalThis.localStorage.getItem(HANDOFF_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<DemoHandoffPayload>
    if (!Array.isArray(parsed.moduleIds)) return null
    const moduleIds = parsed.moduleIds.filter(isDailyCareModuleId)
    if (moduleIds.length === 0) return null
    return { moduleIds, useCustomTemplate: parsed.useCustomTemplate === true, capturedAt: typeof parsed.capturedAt === 'string' ? parsed.capturedAt : new Date().toISOString() }
  } catch {
    return null
  }
}

export function clearDemoModuleHandoff(): void {
  try {
    globalThis.localStorage.removeItem(HANDOFF_STORAGE_KEY)
  } catch {
    // 清除失敗頂多讓下次登入重複套用同一組模組偏好，不會外洩或覆蓋任何健康資料。
  }
}

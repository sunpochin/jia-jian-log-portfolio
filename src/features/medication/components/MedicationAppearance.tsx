/*
檔案用途：顯示藥品外觀特徵（顏色、形狀與實拍照示意圖），輔助移工看護核對正確藥丸。
所在層：src/components；為用藥管理與藥卡區塊共用的視覺呈現元件。
主要關聯：由 MedicationAdminSection 與服藥頁面載入，使用 lib/i18n 呈現雙語描述。
*/
import { useEffect, useState } from 'react'
import { useI18n } from '../../../lib/i18n'
import { resolveMedicationCategory } from '../../../lib/medicationAtcCategories'

interface MedicationAppearanceData {
  brand_name: string
  brand_name_zh: string | null
  dosage_form: string
  appearance_color: string | null
  appearance_shape: string | null
  appearance_photo_url: string | null
  appearance_note?: string | null
  // 多數由官方連結藥品的 TFDA ATC 公開資料回填；只知學名成分、未連結商品的藥品也可能由
  // 人工查證過的成分分類補上（見 20260828020047_backfill_generic_medication_atc_codes.sql）。
  // 缺值時不顯示任何主要功能標籤，不用猜測的分類誤導照護判斷。
  atc_code?: string | null
}

const colorOptions = {
  white: { id: 'Putih', zh: '白色', en: 'White', swatch: '#f8fafc' },
  yellow: { id: 'Kuning', zh: '黃色', en: 'Yellow', swatch: '#facc15' },
  orange: { id: 'Oranye', zh: '橘色', en: 'Orange', swatch: '#fb923c' },
  pink: { id: 'Merah muda', zh: '粉紅色', en: 'Pink', swatch: '#f9a8d4' },
  red: { id: 'Merah', zh: '紅色', en: 'Red', swatch: '#ef4444' },
  green: { id: 'Hijau', zh: '綠色', en: 'Green', swatch: '#4ade80' },
  blue: { id: 'Biru', zh: '藍色', en: 'Blue', swatch: '#60a5fa' },
  brown: { id: 'Cokelat', zh: '棕色', en: 'chocolate brown', swatch: '#a16207' },
  transparent: { id: 'Transparan', zh: '透明', en: 'Transparent', swatch: '#e0f2fe' },
} as const

const shapeOptions = {
  round: { id: 'Tablet bulat', zh: '圓形錠' ,en: 'Round tablet' },
  oval: { id: 'Tablet oval', zh: '橢圓形錠' ,en: 'Oval Tablet' },
  oblong: { id: 'Tablet lonjong', zh: '長橢圓形錠' ,en: 'Oblong tablet' },
  capsule: { id: 'Kapsul', zh: '膠囊' ,en: 'Capsule' },
  // 粉包沒有「錠形」，但照護者仍要能一眼分辨手上是藥錠還是要沖泡的粉包。
  sachet: { id: 'Sachet bubuk', zh: '粉包' ,en: 'Powder sachet' },
  other: { id: 'Lainnya', zh: '其他' ,en: 'Other' },
} as const

export const medicationAppearanceColors = Object.entries(colorOptions).map(([value, option]) => [value, { id: option.id, zh: option.zh ,en: option.en }] as const)
// 保留 key 的聯集型別，避免管理表單把任意字串當成可儲存的外觀代碼。
export const medicationAppearanceShapes = Object.entries(shapeOptions).map(([value, option]) => [value, { id: option.id, zh: option.zh, en: option.en }] as const) as Array<[keyof typeof shapeOptions, { id: string; zh: string; en: string }]>

export function MedicationAppearance({ medication, compact = false, showAppearanceNote = true, showCategory = true, details }: { medication: MedicationAppearanceData; compact?: boolean; showAppearanceNote?: boolean; showCategory?: boolean; details?: string }) {
  const { text } = useI18n()
  const [imageFailed, setImageFailed] = useState(false)
  const [isZoomOpen, setIsZoomOpen] = useState(false)

  // 放大檢視要用原始未裁切的官方照片，避免縮圖裁邊、放大造成的模糊誤導照護者吃錯藥。
  useEffect(() => {
    if (!isZoomOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsZoomOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isZoomOpen])
  // 外觀欄位必須是受限代碼後才轉成色塊，不能把自由輸入直接交給 CSS 造成顯示與資料不一致。
  const color = medication.appearance_color ? colorOptions[medication.appearance_color as keyof typeof colorOptions] : undefined
  const shapeKey = medication.appearance_shape as keyof typeof shapeOptions | null
  const shape = shapeKey ? shapeOptions[shapeKey] : undefined
  // 粉劑沒登錄形狀時不能退回圓錠示意圖，否則畫面會暗示照護者手上是一顆藥。
  const genericShape = medication.dosage_form === 'capsule' ? 'capsule' : medication.dosage_form === 'powder' ? 'sachet' : 'round'
  const hasPhoto = Boolean(medication.appearance_photo_url) && !imageFailed
  // 這段提示會被螢幕閱讀器讀出；跟著目前語系切換，避免印尼文照護者聽到中文。
  const illustrationLabel = text({ id: 'Ilustrasi tampilan obat, bukan foto produk asli', zh: '藥品外觀示意圖，並非實物照片' ,en: 'Medication appearance illustration, not a product photo' })
  const medicationLabel = medication.brand_name_zh ? `${medication.brand_name_zh} (${medication.brand_name})` : medication.brand_name
  // 只有官方連結藥品才會有 ATC 碼；未命中對照表（分類太罕見或碼缺漏）一律不顯示，避免猜錯的功能標籤誤導照護判斷。
  const category = resolveMedicationCategory(medication.atc_code)
  const zoomLabel = text({ id: 'Ketuk untuk memperbesar foto asli', zh: '點一下放大看原始照片' ,en: "Tap for enlarge photo original" })
  const closeZoomLabel = text({ id: 'Tutup', zh: '關閉' ,en: "Close" })

  const openZoom = (event: React.MouseEvent | React.KeyboardEvent) => {
    // 縮圖常巢狀在服藥打勾按鈕裡，一定要擋掉事件冒泡，否則放大照片會誤觸「已服用」。
    event.stopPropagation()
    setIsZoomOpen(true)
  }

  return (
    <div className={`flex min-w-0 items-center gap-2 ${compact ? 'text-[11px]' : 'text-xs'}`}>
      {hasPhoto
        // 日常服藥要先看清藥錠，裁去官方圖上方標題並對齊下方；完整原圖仍留在調藥頁供核對，放大時一律換回原圖。
        ? <span
            role="button"
            tabIndex={0}
            aria-label={zoomLabel}
            title={zoomLabel}
            onClick={openZoom}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') openZoom(event)
            }}
            className={`${compact ? 'h-10 w-10' : 'h-20 w-20'} shrink-0 cursor-zoom-in overflow-hidden rounded-lg border border-gray-200 bg-white`}
          >
            <img src={medication.appearance_photo_url ?? ''} alt={medicationLabel} referrerPolicy="no-referrer" onError={() => setImageFailed(true)} className={`h-full w-full ${compact ? 'object-contain' : 'origin-bottom scale-[1.7] object-cover'}`} />
          </span>
        /* 圓錠與膠囊尺寸不同，照片失效時也能靠示意圖快速區分，而不是顯示無用的破圖圖示；粉包沒有錠形高度，畫成扁長條才不會被誤認成藥錠。 */
        : <span role="img" aria-label={illustrationLabel} title={illustrationLabel} className={`block shrink-0 border border-gray-400/70 ${shapeKey === 'round' || (!shapeKey && genericShape === 'round') ? 'h-7 w-7 rounded-full' : shapeKey === 'capsule' || (!shapeKey && genericShape === 'capsule') ? 'h-7 w-10 rounded-full' : shapeKey === 'oval' ? 'h-7 w-10 rounded-[50%]' : shapeKey === 'sachet' || (!shapeKey && genericShape === 'sachet') ? 'h-3 w-10 rounded-sm' : 'h-7 w-10 rounded-md'}`} style={{ backgroundColor: color?.swatch ?? '#f8fafc' }} />}
      {/* 外觀文字同樣要佔剩餘欄寬，否則 flex 預設的內容寬度會讓整張藥卡產生水平捲動。 */}
      <span className={`min-w-0 flex-1 break-words ${compact ? 'text-gray-600' : 'text-base font-semibold leading-tight text-gray-700'}`}>
        {details && <span className="block text-sm font-semibold text-gray-700">{details}</span>}
        {/* 主要功能標籤只在官方資料回填出可信分類時出現；showCategory=false 代表呼叫端已在藥名下方顯示過，這裡不重複。 */}
        {showCategory && category && <span className="mt-1 inline-block rounded-full bg-fuchsia-100 px-2.5 py-1 text-sm font-black text-fuchsia-800">{text(category)}</span>}
        {/* 直接顯示顏色與形狀即可辨識藥品，省略固定標籤把有限寬度留給真正有用的描述。 */}
        <span className={`${compact ? 'block' : 'mt-1 block text-lg font-black leading-tight'}`}>{color ? text(color) : text({ id: 'Warna belum tercatat', zh: '顏色未登錄' ,en: 'Color not yet recorded' })} · {shape ? text(shape) : text({ id: 'Bentuk belum tercatat', zh: '形狀未登錄' ,en: 'Shape is not logged in' })}
        {showAppearanceNote && medication.appearance_note && ` · ${medication.appearance_note}`}
        {/* 沒有實拍照時仍標示為示意圖，避免照護者把介面提示誤當成產品資訊。 */}
        {!hasPhoto && <span className="text-gray-400"> · {text({ id: 'Ilustrasi', zh: '示意圖' ,en: 'Ilustrasi' })}</span>}
        </span>
      </span>
      {hasPhoto && isZoomOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={medicationLabel}
          onClick={event => {
            event.stopPropagation()
            setIsZoomOpen(false)
          }}
        >
          <button
            type="button"
            onClick={event => {
              event.stopPropagation()
              setIsZoomOpen(false)
            }}
            aria-label={closeZoomLabel}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-2xl font-black text-gray-900 shadow-lg"
          >
            ×
          </button>
          {/* 這裡不加 scale／object-cover，直接用原始官方照片全圖，讓照護者能看清楚藥丸真實比例與細節。 */}
          <img
            src={medication.appearance_photo_url ?? ''}
            alt={medicationLabel}
            referrerPolicy="no-referrer"
            onClick={event => event.stopPropagation()}
            className="max-h-[90vh] max-w-[95vw] rounded-lg object-contain shadow-2xl"
          />
        </div>
      )}
    </div>
  )
}

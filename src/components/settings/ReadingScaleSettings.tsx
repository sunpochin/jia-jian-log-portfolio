/*
檔案用途：讓使用者調整全站閱讀字級（標準／大／特大），並在卡片內即時預覽放大後的血壓讀值與說明文字。
所在層：src/components/settings；只負責呈現控制項與即時套用，不寫入資料庫。
主要關聯：SettingsPage、src/lib/readingScale.ts 與 src/index.css 的 :root[data-reading-scale]。
*/
import { useState } from 'react'
import { useI18n, type LocalizedText } from '../../lib/i18n'
import { READING_SCALE_OPTIONS, applyReadingScale, readReadingScale, saveReadingScale, type ReadingScale } from '../../lib/readingScale'

const SCALE_LABELS: Record<ReadingScale, LocalizedText> = {
  standard: { id: 'Standar', zh: '標準' ,en: 'Standard' },
  large: { id: 'Besar', zh: '大' ,en: 'Large' },
  xlarge: { id: 'Sangat besar', zh: '特大' ,en: 'Extra large' },
}

// 用「這是幾成大」而不是 px：照護者不需要知道 18px 是什麼，只需要知道比原本大多少。
const SCALE_HINTS: Record<ReadingScale, LocalizedText> = {
  standard: { id: 'Ukuran asli', zh: '原本大小' ,en: 'Original size' },
  large: { id: 'Sekitar 1,1× lebih besar', zh: '約放大 1.1 倍' ,en: 'About 1.1× larger' },
  xlarge: { id: 'Sekitar 1,25× lebih besar', zh: '約放大 1.25 倍' ,en: 'About 1.25× larger' },
}

export function ReadingScaleSettings() {
  const { text } = useI18n()
  // 為什麼用 lazy initializer：readReadingScale 會碰 localStorage，每次重繪都讀一次沒有意義，
  // 而且 storage 被封鎖時會走 try/catch，重複執行只是白白付出成本。
  const [scale, setScale] = useState<ReadingScale>(() => readReadingScale())

  const handleSelect = (next: ReadingScale) => {
    // 先套用再儲存：無痕模式存不進 localStorage 時，這一次的放大仍然要立刻生效，
    // 使用者不該因為瀏覽器設定而完全看不到效果。
    applyReadingScale(next)
    saveReadingScale(next)
    setScale(next)
  }

  return (
    <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-4" aria-labelledby="reading-scale-settings-title">
      <h2 id="reading-scale-settings-title" className="font-bold text-gray-900">{text({ id: 'Ukuran teks', zh: '文字大小' ,en: 'Text size' })}</h2>
      <p id="reading-scale-settings-help" className="mt-1 text-sm text-gray-500">
        {text({ id: 'Perbesar seluruh tampilan aplikasi jika tulisan terasa terlalu kecil. Anda juga tetap bisa memperbesar layar dengan dua jari.', zh: '覺得字太小時可以放大整個 App。也可以隨時用兩指縮放畫面。' ,en: 'Increase the app-wide text size if the writing feels too small. You can still pinch to zoom the screen.' })}
      </p>

      {/* 用原生 <input type="radio"> 而不是自己貼 role="radio" 的按鈕：同一組 name 的原生 radio
          本來就有方向鍵切換、roving tabindex 與讀屏器的「三選一，目前第 N 項」語意，
          自製版本要另外寫一整套鍵盤處理才能追平，而且很容易在後續改版時漏掉。
          視覺上的卡片交給 <label> 呈現，radio 本身只在畫面右上角當作勾選指示。 */}
      <fieldset className="mt-4">
        <legend className="sr-only">{text({ id: 'Ukuran teks', zh: '文字大小' ,en: 'Text size' })}</legend>
        <div className="grid grid-cols-3 gap-2">
          {READING_SCALE_OPTIONS.map(option => {
            const selected = option === scale
            return (
              // radio 本身是 sr-only，鍵盤焦點看不見；改由外層 label 顯示焦點環（focus-within），
              // 否則用鍵盤操作的人完全不知道現在停在哪一格。
              // label 加 relative 的原因：sr-only 是絕對定位，沒有這個定位基準時它會被釘在
              // 更外層祖先的左上角、跑到畫面外，聚焦時瀏覽器會把頁面捲到奇怪的位置。
              <label
                key={option}
                htmlFor={`reading-scale-${option}`}
                className={`relative flex min-h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border px-2 py-3 text-center focus-within:ring-2 focus-within:ring-indigo-500 ${selected ? 'border-indigo-600 bg-indigo-50 text-indigo-900' : 'border-gray-200 bg-gray-50 text-gray-700'}`}
              >
                <input
                  id={`reading-scale-${option}`}
                  type="radio"
                  name="reading-scale"
                  className="sr-only"
                  checked={selected}
                  onChange={() => handleSelect(option)}
                  aria-describedby="reading-scale-settings-help"
                />
                {/* 每顆卡片自己就用該段位的相對字級當範例，讓人不用先按下去才知道會變多大。 */}
                <span aria-hidden="true" className={`font-black leading-none ${option === 'standard' ? 'text-base' : option === 'large' ? 'text-xl' : 'text-2xl'}`}>Aa</span>
                <span className="text-sm font-semibold">{text(SCALE_LABELS[option])}</span>
                <span className="text-xs text-gray-500">{text(SCALE_HINTS[option])}</span>
              </label>
            )
          })}
        </div>
      </fieldset>

      {/* 預覽用真的會出現在每日照護頁的血壓讀值，而不是抽象的示範句；
          照護者最在意的就是「這個數字我看不看得清楚」。顏色沿用血壓識別色規範。 */}
      <div className="mt-4 rounded-xl bg-gray-50 px-3 py-3">
        <p className="text-xs font-semibold text-gray-500">{text({ id: 'Pratinjau', zh: '預覽' ,en: 'Preview' })}</p>
        <p className="mt-1">
          <span className="vital-systolic text-2xl font-black">128</span>
          <span className="mx-1 text-lg text-gray-400">/</span>
          <span className="vital-diastolic text-2xl font-black">76</span>
          <span className="ml-2 text-sm text-gray-500">mmHg</span>
        </p>
        <p className="mt-1 text-sm text-gray-600">{text({ id: 'Tekanan darah pagi, sebelum minum obat.', zh: '早上血壓，服藥前量測。' ,en: 'Morning blood pressure, measured before medication.' })}</p>
      </div>

      <p className="mt-3 text-xs text-gray-500">
        {text({ id: 'Pengaturan ini hanya berlaku di perangkat ini dan tidak mengubah catatan kesehatan apa pun.', zh: '這個設定只套用在這台裝置，不會改動任何健康紀錄。' ,en: 'This setting applies only on this device and does not change any health records.' })}
      </p>
    </section>
  )
}

/*
檔案用途：登入後外殼最上方的狀態列，集中呈現台北日期時間與語言切換。
所在層：src/components/system；只呈現全域狀態，不持有任何照護資料。
主要關聯：由 App.tsx 掛在 main 之上，取代原本只放語言切換的空白橫條；時鐘原本重複在每個頁面的 TabHeader 內。

為什麼把時鐘搬到這裡：原本每一頁的 TabHeader 各自跑一個每秒計時器並顯示到秒，
等於每頁每秒重繪一次頁首，而照護情境沒有任何需要看到秒的動作
（唯一與秒有關的血壓一分鐘間隔另有專屬倒數元件）。
同時原本的語言列是一條 48px 高、右側只有一顆切換鈕、左側整片空白的橫條。
兩者合併後少掉一整條浪費的高度，語言切換仍隨時可按——
中文家屬與印尼籍看護共用同一支手機，切換語言是常態動作，不能只藏在設定頁。
*/
import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import 'dayjs/locale/id'
import 'dayjs/locale/zh-tw'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { useI18n } from '../../lib/i18n'
import { TZ } from '../../lib/timezone'
import { LanguageSwitcher } from '../ui/LanguageSwitcher'

dayjs.extend(utc)
dayjs.extend(timezone)

export function AppStatusBar() {
  const { locale } = useI18n()
  const [now, setNow] = useState(() => dayjs().tz(TZ))

  useEffect(() => {
    // 只顯示到分鐘，所以先對齊到下一個整分再每分鐘更新；
    // 這樣顯示永遠是準的，又不必像原本那樣每秒重繪。
    let intervalId: ReturnType<typeof setInterval> | undefined
    const tick = () => setNow(dayjs().tz(TZ))
    const msToNextMinute = 60_000 - (Date.now() % 60_000)
    const timeoutId = setTimeout(() => {
      tick()
      intervalId = setInterval(tick, 60_000)
    }, msToNextMinute)

    return () => {
      clearTimeout(timeoutId)
      if (intervalId) clearInterval(intervalId)
    }
  }, [])

  return (
    <div className="print-hidden flex min-h-12 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4">
      <time className="min-w-0 truncate text-sm tabular-nums text-gray-700" dateTime={now.toISOString()}>
        {/* 中文使用「8月16日 (週日)」的月/日順序才符合閱讀習慣；印尼文維持 ddd, D MMM 的原生順序。 */}
        <span className="font-medium capitalize text-gray-500">
          {locale === 'zh' ? now.locale('zh-tw').format('M月D日 (ddd)') : now.locale('id').format('ddd, D MMM')}
        </span>
        <span className="ml-2 font-bold">{now.format('HH:mm')}</span>
      </time>
      <LanguageSwitcher className="shrink-0" />
    </div>
  )
}

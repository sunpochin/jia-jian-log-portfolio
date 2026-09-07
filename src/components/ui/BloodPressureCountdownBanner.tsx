/*
檔案用途：在主要頁面上方顯示血壓第二次量測的 60 秒休息倒數。
所在層：src/components/ui；跨每日照護、照護大事記與健康資料頁共用的狀態提示。
主要關聯：使用 i18n 顯示雙語文案，資料由 App 保存的病人級量測流程提供。
*/
import { useEffect, useState } from 'react'
import type { BloodPressureMeasurementSession } from '../../lib/bloodPressureMeasurementSession'
import { useI18n } from '../../lib/i18n'

export function BloodPressureCountdownBanner({ session }: { session: BloodPressureMeasurementSession | null }) {
  const { text } = useI18n()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!session) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [session])

  if (!session) return null

  const remainingSeconds = Math.max(0, Math.ceil((session.deadline - now) / 1_000))
  const countdown = `${String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:${String(remainingSeconds % 60).padStart(2, '0')}`
  const isReady = remainingSeconds === 0

  // 倒數中用紅色提醒「還不能量」，歸零轉綠色表示「現在可以量」，讓長輩不用細看文字也能靠顏色判斷。
  const bannerToneClass = isReady ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'
  const titleToneClass = isReady ? 'text-green-950' : 'text-red-950'
  const subtitleToneClass = isReady ? 'text-green-800' : 'text-red-800'
  const countdownToneClass = isReady ? 'border-green-700 text-green-900' : 'border-red-700 text-red-900'

  return (
    <aside className={`sticky top-0 z-30 border-y px-4 py-3 shadow-md transition-colors ${bannerToneClass}`} aria-label={text({ id: 'Jeda pengukuran tekanan darah', zh: '血壓量測休息倒數', en: 'Jeda pengukuran blood pressure' })}>
      <div className="mx-auto flex max-w-md items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className={`text-lg font-extrabold ${titleToneClass}`}>
            {text({ id: 'Istirahat sebelum pengukuran kedua', zh: '第二次量測前請休息', en: 'Istirahat senot yet pengukuran kedua' })}
          </p>
          <p className={`mt-0.5 text-base font-semibold ${subtitleToneClass}`}>
            {isReady ? text({ id: 'Sekarang boleh ukur lagi', zh: '現在可以再量一次', en: 'Now you can measure it again' }) : text({ id: 'Anda boleh melihat catatan lain sementara menunggu', zh: '等待時可以查看其他紀錄', en: 'You boleh melihat record lain temporary menunggu' })}
          </p>
        </div>
        <div className={`shrink-0 rounded-xl border-2 bg-white px-3 py-1 text-center text-4xl font-black leading-none tracking-wider tabular-nums shadow-sm transition-colors ${countdownToneClass}`} role="timer" aria-live="off">
          {countdown}
        </div>
      </div>
    </aside>
  )
}

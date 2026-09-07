/*
檔案用途：在報告與交接手冊的列印版面底部顯示產品來源、免責文字與公開首頁 QR。
所在層：src/components/system；跨列印文件共用的品牌與安全邊界元件。
主要關聯：RecordReport、CareHandbookPage、canonicalUrl 與 qrCode；不接收病人資料，避免 QR 或來源文字洩漏識別資訊。
*/
import { useMemo } from 'react'
import { APP_CANONICAL_URL, APP_NAME } from '../../lib/appInfo'
import { type LocalizedText, useI18n } from '../../lib/i18n'
import { createPublicHomepageQrMatrix, PUBLIC_HOMEPAGE_QR_MODULE_COUNT, PUBLIC_HOMEPAGE_QR_PAYLOAD, type QrMatrix } from '../../lib/qrCode'

const SOURCE_DISCLAIMER: LocalizedText = {
  id: 'Catatan keluarga, bukan dokumen diagnosis medis',
  zh: '家庭自記錄，非醫療診斷文件',
  en: 'Family record, not a medical diagnostic document',
}

function matrixPath(matrix: QrMatrix, quietZone: number): string {
  return matrix.flatMap((row, rowIndex) => row.flatMap((dark, columnIndex) => {
    if (!dark) return []
    const x = columnIndex + quietZone
    const y = rowIndex + quietZone
    return [`M${x} ${y}h1v1h-1z`]
  })).join('')
}

function InlinePublicHomepageQr({ matrix, label }: { matrix: QrMatrix; label: string }) {
  const quietZone = 4
  const viewBoxSize = PUBLIC_HOMEPAGE_QR_MODULE_COUNT + quietZone * 2
  return (
    <svg
      className="print-source-qr shrink-0"
      viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect width={viewBoxSize} height={viewBoxSize} fill="white" />
      <path d={matrixPath(matrix, quietZone)} fill="currentColor" />
    </svg>
  )
}

export function PrintSourceFooter() {
  const { text } = useI18n()
  const matrix = useMemo(() => createPublicHomepageQrMatrix(), [])
  const qrLabel = text({ id: 'Kode QR menuju halaman utama publik.', zh: 'QR 碼連至公開首頁。', en: 'QR code links to the public home page.' })

  return (
    <footer className="print-source-footer hidden items-center gap-3 border-slate-300 text-slate-700 print:flex" aria-label={text({ id: 'Sumber dokumen', zh: '文件來源', en: 'Document source' })}>
      <InlinePublicHomepageQr matrix={matrix} label={qrLabel} />
      <div className="min-w-0 text-[9px] leading-snug">
        <p className="font-bold">{APP_NAME}</p>
        {/* 固定正式首頁而不是目前 host，避免 staging、登入路由或病人 query 被印進 QR／紙本。 */}
        <p className="break-all"><a href={PUBLIC_HOMEPAGE_QR_PAYLOAD}>{APP_CANONICAL_URL}</a></p>
        <p>{text(SOURCE_DISCLAIMER)}</p>
      </div>
    </footer>
  )
}

/*
檔案用途：驗證列印來源 QR 的固定首頁 payload、版本容量與矩陣基本結構。
所在層：tests/unit；不讀取 Supabase、不碰病人資料，只保護 QR 的公開網址邊界。
主要關聯：src/lib/qrCode.ts、src/lib/canonicalUrl.ts 與 PrintSourceFooter。
*/
import { describe, expect, test } from 'bun:test'
import { APP_CANONICAL_URL } from '../../src/lib/canonicalUrl'
import { createPublicHomepageQrMatrix, PUBLIC_HOMEPAGE_QR_MODULE_COUNT, PUBLIC_HOMEPAGE_QR_PAYLOAD, PUBLIC_HOMEPAGE_QR_VERSION } from '../../src/lib/qrCode'

describe('public homepage QR', () => {
  test('uses only the production homepage and a version 3 matrix', () => {
    expect(PUBLIC_HOMEPAGE_QR_PAYLOAD).toBe(APP_CANONICAL_URL)
    expect(PUBLIC_HOMEPAGE_QR_PAYLOAD).toBe('https://demo.careapp.local/')
    expect(PUBLIC_HOMEPAGE_QR_VERSION).toBe(3)
    expect(PUBLIC_HOMEPAGE_QR_MODULE_COUNT).toBe(29)
  })

  test('returns a complete square matrix with the three finder patterns', () => {
    const matrix = createPublicHomepageQrMatrix()
    expect(matrix).toHaveLength(29)
    expect(matrix.every(row => row.length === 29 && row.every(module => typeof module === 'boolean'))).toBe(true)

    const finderCorners = [[0, 0], [0, 22], [22, 0]] as const
    for (const [row, column] of finderCorners) {
      expect(matrix[row][column]).toBe(true)
      expect(matrix[row + 1][column + 1]).toBe(false)
      expect(matrix[row + 3][column + 3]).toBe(true)
    }
  })
})

/*
檔案用途：產生只指向家健錄公開首頁的最小 QR 矩陣，供列印來源 footer 畫成 inline SVG。
所在層：src/lib 共用純函式層；不讀取登入者、病人或目前路由，也不呼叫外部 QR 服務。
主要關聯：src/components/system/PrintSourceFooter.tsx 使用固定首頁 payload；tests/unit/qrCode.test.ts 驗證矩陣與資料邊界。
*/
import { APP_CANONICAL_URL } from './canonicalUrl'

// 只暴露固定的公開首頁，呼叫端沒有傳入任意字串的入口，避免把病人資料或 token 編進紙本 QR。
export const PUBLIC_HOMEPAGE_QR_PAYLOAD = APP_CANONICAL_URL
export const PUBLIC_HOMEPAGE_QR_VERSION = 3
export const PUBLIC_HOMEPAGE_QR_MODULE_COUNT = 17 + PUBLIC_HOMEPAGE_QR_VERSION * 4

type MutableQrMatrix = Array<Array<boolean | null>>
export type QrMatrix = ReadonlyArray<ReadonlyArray<boolean>>

const DATA_CODEWORDS = 44
const ERROR_CORRECTION_CODEWORDS = 26
const ERROR_CORRECTION_LEVEL_BITS = 0b00 // QR level M
const MASK_PATTERN = 0

function appendBits(bits: number[], value: number, length: number) {
  for (let index = length - 1; index >= 0; index -= 1) {
    bits.push((value >>> index) & 1)
  }
}

function buildDataCodewords(payload: string): number[] {
  const bytes = Array.from(new TextEncoder().encode(payload))
  const capacityBits = DATA_CODEWORDS * 8
  const bits: number[] = []

  // Byte mode + 8-bit length 欄位足以容納固定首頁 URL；若日後改 payload，先失敗比靜默截斷安全。
  if (bytes.length > 42) throw new Error('Public homepage QR payload is too long for version 3-M.')
  appendBits(bits, 0b0100, 4)
  appendBits(bits, bytes.length, 8)
  for (const byte of bytes) appendBits(bits, byte, 8)

  appendBits(bits, 0, Math.min(4, capacityBits - bits.length))
  while (bits.length % 8 !== 0) bits.push(0)

  const data = [] as number[]
  for (let index = 0; index < bits.length; index += 8) {
    data.push(bits.slice(index, index + 8).reduce((value, bit) => (value << 1) | bit, 0))
  }
  let padByte = 0xec
  while (data.length < DATA_CODEWORDS) {
    data.push(padByte)
    padByte = padByte === 0xec ? 0x11 : 0xec
  }
  return data
}

function buildGaloisTables() {
  const exponent = new Array<number>(512).fill(0)
  const logarithm = new Array<number>(256).fill(-1)
  let value = 1

  for (let index = 0; index < 255; index += 1) {
    exponent[index] = value
    logarithm[value] = index
    value <<= 1
    if (value & 0x100) value ^= 0x11d
  }
  for (let index = 255; index < exponent.length; index += 1) {
    exponent[index] = exponent[index - 255]
  }
  return { exponent, logarithm }
}

function multiplyGalois(a: number, b: number, tables: ReturnType<typeof buildGaloisTables>): number {
  if (a === 0 || b === 0) return 0
  return tables.exponent[tables.logarithm[a] + tables.logarithm[b]]
}

function buildErrorCorrection(data: number[]): number[] {
  const tables = buildGaloisTables()
  let generator = [1]

  // Reed–Solomon generator degree 26 是 version 3-M 的固定規格，不依賴任何照護資料。
  for (let index = 0; index < ERROR_CORRECTION_CODEWORDS; index += 1) {
    const next = new Array<number>(generator.length + 1).fill(0)
    for (let coefficient = 0; coefficient < generator.length; coefficient += 1) {
      next[coefficient] ^= generator[coefficient]
      next[coefficient + 1] ^= multiplyGalois(generator[coefficient], tables.exponent[index], tables)
    }
    generator = next
  }

  const remainder = new Array<number>(ERROR_CORRECTION_CODEWORDS).fill(0)
  for (const byte of data) {
    const factor = byte ^ remainder[0]
    remainder.copyWithin(0, 1)
    remainder[remainder.length - 1] = 0
    for (let coefficient = 0; coefficient < ERROR_CORRECTION_CODEWORDS; coefficient += 1) {
      remainder[coefficient] ^= multiplyGalois(generator[coefficient + 1], factor, tables)
    }
  }
  return remainder
}

function buildCodewords(): number[] {
  const data = buildDataCodewords(PUBLIC_HOMEPAGE_QR_PAYLOAD)
  return [...data, ...buildErrorCorrection(data)]
}

function emptyMatrix(): MutableQrMatrix {
  return Array.from({ length: PUBLIC_HOMEPAGE_QR_MODULE_COUNT }, () =>
    new Array<boolean | null>(PUBLIC_HOMEPAGE_QR_MODULE_COUNT).fill(null)
  )
}

function setupFinderPattern(matrix: MutableQrMatrix, row: number, column: number) {
  for (let localRow = -1; localRow <= 7; localRow += 1) {
    for (let localColumn = -1; localColumn <= 7; localColumn += 1) {
      const targetRow = row + localRow
      const targetColumn = column + localColumn
      if (targetRow < 0 || targetRow >= matrix.length || targetColumn < 0 || targetColumn >= matrix.length) continue
      matrix[targetRow][targetColumn] = (
        localRow >= 0 && localRow <= 6 && (localColumn === 0 || localColumn === 6)
        || localColumn >= 0 && localColumn <= 6 && (localRow === 0 || localRow === 6)
        || localRow >= 2 && localRow <= 4 && localColumn >= 2 && localColumn <= 4
      )
    }
  }
}

function setupAlignmentPattern(matrix: MutableQrMatrix, row: number, column: number) {
  // 版本 3 的對齊點中心是 (22, 22)；與定位點重疊的其他組合由 null 檢查略過。
  if (matrix[row][column] !== null) return
  for (let localRow = -2; localRow <= 2; localRow += 1) {
    for (let localColumn = -2; localColumn <= 2; localColumn += 1) {
      matrix[row + localRow][column + localColumn] = Math.max(Math.abs(localRow), Math.abs(localColumn)) !== 1
    }
  }
}

function setupFunctionPatterns(matrix: MutableQrMatrix) {
  const last = PUBLIC_HOMEPAGE_QR_MODULE_COUNT - 7
  setupFinderPattern(matrix, 0, 0)
  setupFinderPattern(matrix, 0, last)
  setupFinderPattern(matrix, last, 0)

  for (const row of [6, 22]) {
    for (const column of [6, 22]) setupAlignmentPattern(matrix, row, column)
  }

  for (let index = 8; index < PUBLIC_HOMEPAGE_QR_MODULE_COUNT - 8; index += 1) {
    if (matrix[6][index] === null) matrix[6][index] = index % 2 === 0
    if (matrix[index][6] === null) matrix[index][6] = index % 2 === 0
  }
}

function bchDigit(value: number): number {
  let digit = 0
  while (value !== 0) {
    digit += 1
    value >>>= 1
  }
  return digit
}

function bchTypeInfo(data: number): number {
  const generator = 0x537
  const mask = 0x5412
  let value = data << 10
  while (bchDigit(value) - bchDigit(generator) >= 0) {
    value ^= generator << (bchDigit(value) - bchDigit(generator))
  }
  return ((data << 10) | value) ^ mask
}

function setupFormatInfo(matrix: MutableQrMatrix) {
  const bits = bchTypeInfo((ERROR_CORRECTION_LEVEL_BITS << 3) | MASK_PATTERN)
  for (let index = 0; index < 15; index += 1) {
    const dark = ((bits >>> index) & 1) === 1
    if (index < 6) matrix[index][8] = dark
    else if (index < 8) matrix[index + 1][8] = dark
    else matrix[matrix.length - 15 + index][8] = dark

    if (index < 8) matrix[8][matrix.length - index - 1] = dark
    else if (index < 9) matrix[8][15 - index] = dark
    else matrix[8][15 - index - 1] = dark
  }
  // QR 規格固定的 dark module，不能讓資料映射流程覆蓋。
  matrix[matrix.length - 8][8] = true
}

function maskApplies(row: number, column: number): boolean {
  // 固定 mask 0 已足夠這個短首頁 URL，避免為單一固定 payload 引入額外的評分與狀態。
  return (row + column) % 2 === 0
}

function mapData(matrix: MutableQrMatrix, codewords: number[]) {
  let row = matrix.length - 1
  let direction = -1
  let byteIndex = 0
  let bitIndex = 7

  for (let column = matrix.length - 1; column > 0; column -= 2) {
    if (column === 6) column -= 1
    while (true) {
      for (let offset = 0; offset < 2; offset += 1) {
        const targetColumn = column - offset
        if (matrix[row][targetColumn] !== null) continue
        const dark = byteIndex < codewords.length && ((codewords[byteIndex] >>> bitIndex) & 1) === 1
        matrix[row][targetColumn] = maskApplies(row, targetColumn) ? !dark : dark
        bitIndex -= 1
        if (bitIndex < 0) {
          byteIndex += 1
          bitIndex = 7
        }
      }
      row += direction
      if (row < 0 || row >= matrix.length) {
        row -= direction
        direction = -direction
        break
      }
    }
  }
}

export function createPublicHomepageQrMatrix(): QrMatrix {
  const matrix = emptyMatrix()
  setupFunctionPatterns(matrix)
  setupFormatInfo(matrix)
  mapData(matrix, buildCodewords())
  return matrix.map(row => row.map(module => module ?? false))
}

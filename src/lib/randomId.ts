/*
檔案用途：產生瀏覽器端可用的隨機 UUID，供各種上傳檔名/暫存 id 使用。
所在層：src/lib；不含任何業務邏輯。
主要關聯：careEventPhotos.ts 與 medicationAppearancePhotos.ts 用來命名上傳的照片檔案。
*/

function formatUuid(bytes: Uint8Array) {
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function randomId() {
  const cryptoApi = globalThis.crypto
  if (typeof cryptoApi !== 'undefined' && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID()

  const bytes = new Uint8Array(16)
  if (typeof cryptoApi !== 'undefined' && typeof cryptoApi.getRandomValues === 'function') {
    // 舊版 Safari 可能沒有 randomUUID，但仍有安全亂數；補上 v4/variant 位元即可符合資料庫 UUID 型別。
    cryptoApi.getRandomValues(bytes)
  } else {
    // 沒有 Web Crypto 時仍要產生 UUID 形狀，避免上傳成功後 insert 因 PostgreSQL 型別錯誤而回滾流程。
    const timestamp = Date.now()
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = ((timestamp >>> ((index % 4) * 8)) ^ Math.floor(Math.random() * 256)) & 0xff
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  return formatUuid(bytes)
}

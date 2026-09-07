/*
檔案用途：保護照護事件表單同時提供拍照與選取既有相片的入口。
所在層：tests/unit；以靜態檢查鎖住 iOS/Android 原生 input 的意圖，不啟動瀏覽器。
主要關聯：CareTimeline、cameraPhotoInputRef 與 libraryPhotoInputRef。
*/
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

const component = readFileSync(new URL('../../src/features/care-family/components/CareTimeline.tsx', import.meta.url), 'utf8')

describe('care timeline photo inputs', () => {
  test('keeps camera capture and existing-photo selection as separate controls', () => {
    expect(component).toContain('id="care-timeline-camera-photo-input"')
    expect(component).toContain('capture="environment"')
    expect(component).toContain('id="care-timeline-photo-input"')
    expect(component).toContain('📷 {text({ id: \'Ambil foto\', zh: \'拍照\', en: \'Take Photo\' })}')
    expect(component).toContain('🖼️ {text({ id: \'Pilih dari galeri\', zh: \'從相簿選取\', en: \'Select from album\' })}')
  })

  test('retries stale preview URLs and keeps an original-photo fallback', () => {
    expect(component).toContain('signCareEventPhotoPathsBestEffort')
    expect(component).toContain('photo.thumbnail_path, photo.path')
    expect(component).toContain('onError={() =>')
    expect(component).toContain('重試次數用盡就要離開「載入中」')
  })
})

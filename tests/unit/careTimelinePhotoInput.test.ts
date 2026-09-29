/*
檔案用途：保護軌跡頁的新增紀錄表單同時提供拍照與選取既有相片的入口，以及展示模式儲存滿版的錯誤處理。
所在層：tests/unit；以靜態檢查鎖住 iOS/Android 原生 input 的意圖與展示模式錯誤文案，不啟動瀏覽器。
主要關聯：TrajectoryEntryForm.tsx（表單 UI）、useTrajectoryEntryEditor.ts（儲存邏輯）、
TrajectoryEventPhotos.tsx（縮圖重試邏輯）；原檔案在 issue #735（#659 D 期）從 CareTimeline.tsx 拆分。
*/
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

const form = readFileSync(new URL('../../src/features/care-family/components/trajectory/TrajectoryEntryForm.tsx', import.meta.url), 'utf8')
const editor = readFileSync(new URL('../../src/features/care-family/hooks/useTrajectoryEntryEditor.ts', import.meta.url), 'utf8')
const photos = readFileSync(new URL('../../src/features/care-family/components/trajectory/TrajectoryEventPhotos.tsx', import.meta.url), 'utf8')

describe('trajectory entry form photo inputs', () => {
  test('keeps camera capture and existing-photo selection as separate controls', () => {
    expect(form).toContain('id="care-timeline-camera-photo-input"')
    expect(form).toContain('capture="environment"')
    expect(form).toContain('id="care-timeline-photo-input"')
    expect(form).toContain('📷 {text({ id: \'Ambil foto\', zh: \'拍照\', en: \'Take Photo\' })}')
    expect(form).toContain('🖼️ {text({ id: \'Pilih dari galeri\', zh: \'從相簿選取\', en: \'Select from album\' })}')
  })
})

describe('trajectory event photo previews', () => {
  test('retries stale preview URLs and keeps an original-photo fallback', () => {
    expect(photos).toContain('signCareEventPhotoPathsBestEffort')
    expect(photos).toContain('photo.thumbnail_path, photo.path')
    expect(photos).toContain('onError={() =>')
    expect(photos).toContain('重試次數用盡就要離開「載入中」')
  })
})

describe('demo mode storage-full handling (Codex review on PR #727)', () => {
  test('throws a dedicated error when saveDemoCareTimelineEntry reports the entry was not persisted', () => {
    expect(editor).toContain('if (!persisted) throw new Error(\'demo_care_timeline_storage_full\')')
  })

  test('shows a local-storage-specific message instead of blaming the network', () => {
    expect(editor).toContain("databaseMessage === 'demo_care_timeline_storage_full'")
    expect(editor).toContain('瀏覽器本機儲存空間已滿，請刪除較舊的展示紀錄或照片後再試。')
  })
})

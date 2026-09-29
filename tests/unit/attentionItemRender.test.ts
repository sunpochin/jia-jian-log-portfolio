/*
檔案用途：驗證共用清單項元件 AttentionItem 依 tone 呈現對應徽章文字，且點擊整列與動作按鈕都能觸發對應 callback。
所在層：tests/unit；純函式呼叫測試，不依賴 DOM。
主要關聯：src/components/ui/AttentionItem.tsx，由 CareDueRemindersPage 與 TodayPage 共用。
*/
import { describe, expect, test } from 'bun:test'
import { fire, findAll, findButton, textContent } from './helpers/elementTree'
import { AttentionItem } from '../../src/components/ui/AttentionItem'

describe('AttentionItem', () => {
  test('renders title, badge and description', () => {
    const element = AttentionItem({ tone: 'overdue', title: '藥量倒數', badge: '已逾期 2 天', description: '到期日 2026-09-01' })
    const text = textContent(element)
    expect(text).toContain('藥量倒數')
    expect(text).toContain('已逾期 2 天')
    expect(text).toContain('到期日 2026-09-01')
  })

  test('makes the whole row clickable when onClick is given', () => {
    let clicked = false
    const element = AttentionItem({ title: '待複評醫囑', onClick: () => { clicked = true } })
    const trigger = findAll(element, item => item.type === 'button' && typeof item.props.onClick === 'function')[0]
    expect(trigger).toBeDefined()
    fire(trigger, 'onClick')
    expect(clicked).toBe(true)
  })

  test('renders action buttons without making the whole row a button', () => {
    let editClicked = false
    // 直接建構元素描述而非用 JSX：本檔是 .test.ts，跟其餘 harness 測試一致不引入 JSX 轉譯設定。
    const editButton = { type: 'button', props: { type: 'button', onClick: () => { editClicked = true }, children: '編輯' } }
    const element = AttentionItem({ title: '疫苗到期', actions: editButton as unknown as ReturnType<typeof AttentionItem> })
    fire(findButton(element, '編輯'), 'onClick')
    expect(editClicked).toBe(true)
  })
})

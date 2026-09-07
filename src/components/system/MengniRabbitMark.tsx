/*
檔案用途：顯示設定頁寵物類型選項使用的兔子 SVG 向量圖示。
所在層：src/components 呈現元件層；只負責視覺，不管理寵物資料或選擇狀態。
主要關聯：由 CareRecipientManagement 與 components 匯出入口使用，和狗、貓圖示維持同一套寵物選項視覺語言。
*/

export function MengniRabbitMark({ className = 'h-7 w-9 shrink-0' }: { className?: string }) {
  // 用長耳、圓臉與小粉鼻取代 emoji，是為了讓兔子在小尺寸選項中仍能和其他 SVG 寵物一致辨識。
  return <svg aria-hidden="true" viewBox="0 0 48 40" className={className} fill="none">
    <path d="M16.5 14.8C13.1 10.7 11.9 3.3 14.3 2.3c2.5-1 5.7 5.5 6.4 10.4M31.5 14.8c3.4-4.1 4.6-11.5 2.2-12.5-2.5-1-5.7 5.5-6.4 10.4" fill="#E9E4DE" stroke="#AAA19A" strokeWidth="1.3" strokeLinejoin="round" />
    <path d="M17 5.2c-.4 2.3.3 5.6 1.6 7.8M31 5.2c.4 2.3-.3 5.6-1.6 7.8" stroke="#E8A8B0" strokeWidth="1.5" strokeLinecap="round" />
    <ellipse cx="24" cy="24" rx="13.7" ry="11.5" fill="#E9E4DE" stroke="#AAA19A" strokeWidth="1.3" />
    <circle cx="18.8" cy="22.2" r="1.45" fill="#403A36" />
    <circle cx="29.2" cy="22.2" r="1.45" fill="#403A36" />
    <path d="M16.5 20.4c1.1-.9 2.4-1.1 3.7-.5M27.8 19.9c1.3-.6 2.6-.4 3.7.5" stroke="#B8B0A9" strokeWidth=".9" strokeLinecap="round" />
    <path d="M21.7 26.1c1.3-1.1 3.3-1.1 4.6 0l-2.3 1.7-2.3-1.7Z" fill="#E8A8B0" stroke="#8D686B" strokeWidth=".7" strokeLinejoin="round" />
    <path d="M24 27.8v1.2M24 29c-1.2 1-2.4 1-3.5.3M24 29c1.2 1 2.4 1 3.5.3" stroke="#6E5A58" strokeWidth=".8" strokeLinecap="round" />
    <path d="M18.7 26.6c-3-.2-5-.6-6.6-1.4M18.5 28.2c-2.8.3-4.7.4-6.2 0M29.3 26.6c3-.2 5-.6 6.6-1.4M29.5 28.2c2.8.3 4.7.4 6.2 0" stroke="#B8B0A9" strokeWidth=".75" strokeLinecap="round" />
    <path d="M16.8 33.3c2.1 1.4 4.5 2.1 7.2 2.1s5.1-.7 7.2-2.1" stroke="#AAA19A" strokeWidth="2.6" strokeLinecap="round" />
  </svg>
}

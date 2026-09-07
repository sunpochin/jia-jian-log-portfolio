/*
檔案用途：顯示設定頁寵物類型選項使用的胖胖橘貓 SVG 向量圖示。
所在層：src/components 呈現元件層；只負責視覺，不管理寵物資料或選擇狀態。
主要關聯：由 CareRecipientManagement 與 components 匯出入口使用，和 MengniDogMark 維持同一套寵物選項視覺語言。
*/

export function MengniCatMark({ className = 'h-7 w-9 shrink-0' }: { className?: string }) {
  // 參考小乖的尖耳、額頭條紋、綠眼與粉鼻改成正面頭像，因為小尺寸下比側身更容易辨識是貓。
  return <svg aria-hidden="true" viewBox="0 0 48 40" className={className} fill="none">
    <path d="M8.5 22.8c-.6-5.8.3-13.1 2.2-17.8.4-1 1.6-1.1 2.2-.2l4.4 5.7c4.4-1.5 10.4-1.5 14.8 0l4.4-5.7c.6-.9 1.8-.8 2.2.2 1.9 4.7 2.8 12 2.2 17.8-.9 8.1-7.4 12.3-16.2 12.3S9.4 30.9 8.5 22.8Z" fill="#D9822B" stroke="#A95217" strokeWidth="1.4" strokeLinejoin="round" />
    <path d="M11.1 9.3 12.8 7l4.1 5.1M36.9 9.3 35.2 7l-4.1 5.1" fill="#F3B16D" stroke="#C56A24" strokeWidth=".8" strokeLinejoin="round" />
    <path d="M22.2 12.2 24 16.3l1.8-4.1M18.5 12.7 20 16.5M29.5 12.7 28 16.5" stroke="#A95217" strokeWidth="1.2" strokeLinecap="round" />
    <ellipse cx="17.8" cy="21.2" rx="4.4" ry="4.9" fill="#A9B47A" stroke="#5D632D" strokeWidth="1" />
    <ellipse cx="30.2" cy="21.2" rx="4.4" ry="4.9" fill="#A9B47A" stroke="#5D632D" strokeWidth="1" />
    <ellipse cx="17.8" cy="21.3" rx="1.1" ry="3.2" fill="#2B211A" />
    <ellipse cx="30.2" cy="21.3" rx="1.1" ry="3.2" fill="#2B211A" />
    <path d="M14.3 18.3c1.6-1.5 3.7-1.8 5.7-.8M28 17.5c2-.9 4.1-.7 5.7.8" stroke="#F7D5A7" strokeWidth="1" strokeLinecap="round" />
    <path d="M15.4 26.7c2.2-1.9 4.3-1.9 6.4-.2 1.2 1 1.4 2.1 2.2 2.1s1-1.1 2.2-2.1c2.1-1.7 4.2-1.7 6.4.2-1 4.2-4.2 5.8-8.6 5.8s-7.6-1.6-8.6-5.8Z" fill="#F7E8D2" />
    <path d="M21.8 26.7c.9-.9 3.5-.9 4.4 0l-2.2 1.8-2.2-1.8Z" fill="#E58B91" stroke="#A95217" strokeWidth=".7" strokeLinejoin="round" />
    <path d="M24 28.5v1.2M24 29.7c-1.2 1.2-2.5 1.4-3.8.6M24 29.7c1.2 1.2 2.5 1.4 3.8.6" stroke="#71351C" strokeWidth=".8" strokeLinecap="round" />
    <path d="M16.8 27.4c-3.5-.3-5.7-.8-7.5-1.8M16.3 29.2c-3.2.5-5.5.6-7.1.1M31.2 27.4c3.5-.3 5.7-.8 7.5-1.8M31.7 29.2c3.2.5 5.5.6 7.1.1" stroke="#F7E8D2" strokeWidth=".75" strokeLinecap="round" />
    <path d="M15 34.5c2.5 1.4 5.5 2.1 9 2.1s6.5-.7 9-2.1" stroke="#A95217" strokeWidth="2.6" strokeLinecap="round" />
  </svg>
}

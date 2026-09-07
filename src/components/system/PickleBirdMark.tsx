/*
檔案用途：顯示設定頁寵物類型選項使用的 Pickle 鳥 SVG 向量圖示。
所在層：src/components 呈現元件層；只負責視覺，不管理寵物資料或選擇狀態。
主要關聯：由 CareRecipientManagement 與 components 匯出入口使用，和小乖、猛膩圖示維持同一套寵物選項視覺語言。
*/

export function PickleBirdMark({ className = 'h-7 w-9 shrink-0' }: { className?: string }) {
  // Pickle 需要獨立 SVG 才能在不同手機維持同樣比例；不用 emoji 免得鳥的外觀跟系統字型一起漂移。
  return <svg aria-hidden="true" viewBox="0 0 48 40" className={className} fill="none">
    <path d="M10.2 23.6c0-7 5.8-12.6 13-12.6 5.5 0 10.3 3.1 12.1 7.8 3.6.1 6.2 2.1 6.2 4.8 0 3-3.2 5.2-7.7 5.2H21.7c-6.4 0-11.5-2-11.5-5.2Z" fill="#8CBF4A" stroke="#4D7C2A" strokeWidth="1.4" strokeLinejoin="round" />
    <path d="M24.1 15.1c3.8 1.1 6.4 3.7 7.2 7.4-3.5 1.5-7.6 1.1-10.5-1.3 1.2-2.2 2.1-4.3 3.3-6.1Z" fill="#D7E987" stroke="#6A9334" strokeWidth="1" strokeLinejoin="round" />
    <path d="M35.2 19.1 42.8 21c1 .3 1 1.6 0 1.9l-7.4 2.2" fill="#F2A23A" stroke="#B56718" strokeWidth="1" strokeLinejoin="round" />
    <circle cx="29.2" cy="16.8" r="2.3" fill="#F7F3DC" stroke="#4D7C2A" strokeWidth=".8" />
    <circle cx="29.4" cy="16.9" r=".8" fill="#243119" />
    <path d="M13.6 30.8c2.2 2.4 4.5 3.7 7 3.7M27.2 30.8c2.2 2.4 4.5 3.7 7 3.7" stroke="#4D7C2A" strokeWidth="1.3" strokeLinecap="round" />
    <path d="M17.8 34.5v2.2M31.4 34.5v2.2" stroke="#B56718" strokeWidth="1.4" strokeLinecap="round" />
    <path d="M14.8 12.2c2.1-2.9 5.1-4.4 8.6-4.4" stroke="#D7E987" strokeWidth="2" strokeLinecap="round" />
  </svg>
}

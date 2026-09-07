/*
檔案用途：顯示「猛膩」小黑狗的共用 SVG 視覺標記。
所在層：src/components 呈現元件層；不管理版本資訊或頁面位置。
主要關聯：由 ReleaseVersion 組合，讓設定頁與其他合法入口可使用同一個標記。
*/

export function MengniDogMark({ className = 'h-7 w-9 shrink-0' }: { className?: string }) {
  // 把吉祥物獨立成元件，日後移動版本資訊時不必複製 SVG 而讓造型逐漸分歧。
  return <svg aria-hidden="true" viewBox="0 0 48 40" className={className} fill="none">
    <ellipse cx="27" cy="24" rx="13" ry="8.5" fill="#151515" />
    <path d="M36 20.5c3.2-5.3 6.4-5 8.1-1.8 1.2 2.1.6 5.8-2.2 6.5-2.1.6-3.7-.8-4.4-2.7" fill="#151515" />
    <path d="M18 22.3c-3.2-1-5.9-3.3-6-6.8-.1-3.7 2.7-6.4 6.6-6.4 4.1 0 7.3 3.4 7.3 7.6v6.6" fill="#151515" />
    <path d="M15.2 11.2 13.5 4.7c-.3-1.1 1-1.7 1.8-.8l4.4 5.5M21.2 9.8l3.5-5c.7-1 2.1-.4 1.8.8L25.1 12" fill="#151515" stroke="#151515" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M12.4 15.5 7.1 16.8c-1.1.3-1.1 1.8 0 2.1l5.4 1.2" fill="#151515" />
    <circle cx="16.8" cy="14.2" r="1.35" fill="white" />
    <circle cx="16.8" cy="14.2" r=".55" fill="#151515" />
    <path d="M13.2 20.6c2.2 1.7 5.1 1.8 7.3.2" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
    <path d="M18.2 21.7c1.4.7 3.8.8 5.5.1" stroke="#E24A4A" strokeWidth="2" strokeLinecap="round" />
    <path d="M19.5 30.2v6.4M26 31v5.6M33 30.7v5.9M37.3 29.4v5.5" stroke="#151515" strokeWidth="3" strokeLinecap="round" />
    <path d="M23.7 22.5c1.8 1.4 3.6 1.9 5.8 1.9" stroke="#303030" strokeWidth="1.1" strokeLinecap="round" />
  </svg>
}

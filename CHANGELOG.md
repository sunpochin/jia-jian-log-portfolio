<!--
檔案用途：保存 release-please 產生的版本變更，並供 /releases 頁面建置時讀取。
所在層：repository root；是 source-control metadata，不保存照護資料或應用程式狀態。
主要關聯：.github/release-please-config.json、.github/workflows/release-please.yml 與 src/features/system-admin/pages/ReleasesPage.tsx。
-->

# Changelog

## [1.14.0](https://github.com/portfolio-author/jia-jian-log/compare/jia-jian-log-v1.13.1...jia-jian-log-v1.14.0) (2026-09-01)


### Features

* Implement database backup v2 V1 ([d8f40a9](https://github.com/portfolio-author/jia-jian-log/commit/d8f40a97c8792d8c3bfe63f6f1c77c6362127ec4))


### Bug Fixes

* address database backup review comments ([3b458e2](https://github.com/portfolio-author/jia-jian-log/commit/3b458e20dd62dd5c82cdba9d2f354f843b12f7d8))
* clarify backup review handoff ([9f0844e](https://github.com/portfolio-author/jia-jian-log/commit/9f0844e96ae68f948cb4b2a7f622b63a7e841257))
* Close anonymous health-data access and document black-box checks ([2ad2cff](https://github.com/portfolio-author/jia-jian-log/commit/2ad2cff4d747098c49f27324eaec39661b77c5dc))
* close database backup v2 review gaps ([9ccf27d](https://github.com/portfolio-author/jia-jian-log/commit/9ccf27d2044ea3f68d4a1b4c981378c1bc13423e))
* make restore and dump checks production-shaped ([ed1ce95](https://github.com/portfolio-author/jia-jian-log/commit/ed1ce954ef6492c1409bc33eb9c3d3b28feef2f6))
* parse quoted restore table identifiers ([1c632ae](https://github.com/portfolio-author/jia-jian-log/commit/1c632ae13fe88f0dd3f6daa37b2acca117e3cf7a))
* Preserve public demo allowlist ([9de30c1](https://github.com/portfolio-author/jia-jian-log/commit/9de30c18cec3d77f0a1b6759c0bb8de29dce8c8b))
* propagate gzip failures during encryption ([8bf0ee9](https://github.com/portfolio-author/jia-jian-log/commit/8bf0ee9c2f692023717e63e066e75b3bd75dee84))
* Revoke anonymous health data access ([3cfe2d0](https://github.com/portfolio-author/jia-jian-log/commit/3cfe2d068424d318a3ba7eaa6a31d2cdf65f79e5))
* Revoke anonymous health-data access ([c8dabf8](https://github.com/portfolio-author/jia-jian-log/commit/c8dabf8f0f9af226c24b0900e4aabaa2bb6a82ac))
* Revoke anonymous health-data access ([ae48f87](https://github.com/portfolio-author/jia-jian-log/commit/ae48f87844bd1dea5bc099262c83405d7c21d758))
* run optional RLS checks as authenticated ([13cec6c](https://github.com/portfolio-author/jia-jian-log/commit/13cec6cd756847cf4e8986f66b98a3da31b06817))
* separate backup validation environments ([357b381](https://github.com/portfolio-author/jia-jian-log/commit/357b381f2b109a1eeaa87e8230fd7141faab0cfb))
* suspend triggers during local restore ([25a0d63](https://github.com/portfolio-author/jia-jian-log/commit/25a0d6377e716bb6b38a6b2a3ae73a4cdcdfe3d4))

## [1.13.1](https://github.com/portfolio-author/jia-jian-log/compare/jia-jian-log-v1.13.0...jia-jian-log-v1.13.1) (2026-08-31)


### Bug Fixes

* allow care event photo previews ([ce0f047](https://github.com/portfolio-author/jia-jian-log/commit/ce0f0477890adf4ac9fb5d057b59322a4e7d3d69))
* finish care photo retry state ([36d0a96](https://github.com/portfolio-author/jia-jian-log/commit/36d0a96a8faed58f94ad3ca2b2f4c2a08841e9f0))
* keep care event photos visible ([32360f1](https://github.com/portfolio-author/jia-jian-log/commit/32360f1342038cf81c376fbed13b7e7b5d96f900))
* keep care event photos visible ([fa5b45d](https://github.com/portfolio-author/jia-jian-log/commit/fa5b45d5700c87cc13ae4718123277d705bccf0e))
* remove stale npm lockfile ([91a726e](https://github.com/portfolio-author/jia-jian-log/commit/91a726e125ec5fa82b5f518230c000ffd2dc79e0))
* sign single care event photos directly ([f26f25f](https://github.com/portfolio-author/jia-jian-log/commit/f26f25fa8068d12394962edae058bde82e3118b4))
* unblock care event photo previews ([2bc0bf0](https://github.com/portfolio-author/jia-jian-log/commit/2bc0bf026d1edf2f95fd04717a0f636633b7338b))
* 補送重試命中 already-existed 時也要通知家人 ([fe92549](https://github.com/portfolio-author/jia-jian-log/commit/fe92549fa9bd8b4fd51f7179c6816be900e57c0f))
* 離線補送失敗通知加上病人切換防呆，並更新技術文件 ([ec134d0](https://github.com/portfolio-author/jia-jian-log/commit/ec134d014435e79be7e4d42943ac177049e4c935))
* 離線補送的血壓紀錄也要觸發 Telegram 通知 ([a561762](https://github.com/portfolio-author/jia-jian-log/commit/a56176214dae14ecf421dbbcfc4456613bac2240))
* 離線補送的血壓紀錄也要觸發 Telegram 通知 ([bfb73df](https://github.com/portfolio-author/jia-jian-log/commit/bfb73df127d16e66a3c404f265ca73320f121f37))

## [1.13.0](https://github.com/portfolio-author/jia-jian-log/compare/jia-jian-log-v1.12.3...jia-jian-log-v1.13.0) (2026-08-30)


### Features

* 服藥打卡的每時段標題加上總顆數，不只顯示服藥次數 ([bc1d60d](https://github.com/portfolio-author/jia-jian-log/commit/bc1d60df8e1e45ef07c64bff96546c485cfe8737))
* 修正劑型混算：顆數摘要改按劑型分組，粉包／液劑不再被誤標成「顆」 ([bae04ad](https://github.com/portfolio-author/jia-jian-log/commit/bae04ad1ab40e77b1b36dc81bbcf5a254b4fdacd))
* 服藥打卡的全天進度卡也加上總顆數，跟每個時段同一套規則 ([bccd7ed](https://github.com/portfolio-author/jia-jian-log/commit/bccd7ed4813d416a2cd045107d26dad62a684663))

## [1.12.3](https://github.com/portfolio-author/jia-jian-log/compare/jia-jian-log-v1.12.2...jia-jian-log-v1.12.3) (2026-08-30)


### Bug Fixes

* **ci:** auto-retry promote-staging when migration run gets cancelled ([5ac80d0](https://github.com/portfolio-author/jia-jian-log/commit/5ac80d0766f8e11f90387bf0426c5c973c4b4f5e))
* **ci:** auto-retry promote-staging when migration run gets cancelled ([b6c2e9b](https://github.com/portfolio-author/jia-jian-log/commit/b6c2e9b95f7c27a2cf9368814bca5a729ac9bbdd))

## [1.12.2](https://github.com/portfolio-author/jia-jian-log/compare/jia-jian-log-v1.12.1...jia-jian-log-v1.12.2) (2026-08-29)


### Bug Fixes

* drop legacy medication_plans account_email unique constraint ([92cd15f](https://github.com/portfolio-author/jia-jian-log/commit/92cd15fe28a02a5e0498eb8ef9bdaee860a9becf))
* drop legacy medication_plans account_email unique constraint ([ede4ce8](https://github.com/portfolio-author/jia-jian-log/commit/ede4ce858996e32b2b860badfa679468b925ca18))

## [1.12.1](https://github.com/portfolio-author/jia-jian-log/compare/jia-jian-log-v1.12.0...jia-jian-log-v1.12.1) (2026-08-29)


### Bug Fixes

* surface the real database error when a medication save fails ([ba74cdd](https://github.com/portfolio-author/jia-jian-log/commit/ba74cdd1dff55ae31b87f50cf41afc6f06151c73))
* surface the real database error when a medication save fails ([96cea3e](https://github.com/portfolio-author/jia-jian-log/commit/96cea3eb608ba5d28ddea562e54d99febd42bb3c))

## [1.12.0](https://github.com/portfolio-author/jia-jian-log/compare/jia-jian-log-v1.11.0...jia-jian-log-v1.12.0) (2026-08-29)


### Features

* Android/桌面 Chrome 加到主畫面也依語系顯示中文/印尼文 ([425039b](https://github.com/portfolio-author/jia-jian-log/commit/425039bed5b2cf29d5e794874c67050cc20dd726))
* 加到主畫面的桌面捷徑文字依語系區分中文/印尼文 ([ca4bdb6](https://github.com/portfolio-author/jia-jian-log/commit/ca4bdb64f34211c4372d32428834b2a4117f44e1))
* 藥品詳情視窗加 Google 搜尋英文藥名的備援連結 ([3427405](https://github.com/portfolio-author/jia-jian-log/commit/3427405640a0eb8d819bfab897a4e3a0833c34b2))
* 點擊本週藥單藥名開啟藥品詳情視窗 ([104671a](https://github.com/portfolio-author/jia-jian-log/commit/104671a58de9f74f3065838dd8e53f8d60950a98))


### Bug Fixes

* **ci:** cancel superseded staging migration runs to save Actions quota ([d06f823](https://github.com/portfolio-author/jia-jian-log/commit/d06f823e339c6dcf95d37a06785fd1a895a2e12e))
* **ci:** serialize staging/production Supabase migration runs ([fed2f2e](https://github.com/portfolio-author/jia-jian-log/commit/fed2f2ed91390ea3e3e18c8c6b49a89de412ff07))
* **ci:** serialize/cancel Supabase migration runs to fix race + save quota ([8164d92](https://github.com/portfolio-author/jia-jian-log/commit/8164d9226e46290781a6a036d50adf38ce6ba4e4))
* iOS 加到主畫面的 standalone PWA 不再誤判為嵌入式瀏覽器 ([cd122bd](https://github.com/portfolio-author/jia-jian-log/commit/cd122bd78f1913ed5470edd0f27e3d68a532ef30))
* PWA manifest short_name 改回中文「家健錄」，修正桌面捷徑仍顯示英文 ([de2cee0](https://github.com/portfolio-author/jia-jian-log/commit/de2cee05bc14ce7139efc720339337cb787f1f2b))
* PWA manifest short_name 改回中文「家健錄」，修正桌面捷徑仍顯示英文 ([e06de9f](https://github.com/portfolio-author/jia-jian-log/commit/e06de9f99fda3f8ad6ea9e8da419263a8a9c0a2f))
* surface medication save confirm failures instead of silent no-op ([0d83335](https://github.com/portfolio-author/jia-jian-log/commit/0d83335c0622f0e03311fb5fbd6ca8149c6ac5dc))
* 健康資料同意讀取失敗時重試一次，避免已同意帳號被誤判成需要重新同意 ([84b7f0a](https://github.com/portfolio-author/jia-jian-log/commit/84b7f0a7add9544790f3bcdbf41b605dbf37b9b1))
* 健康資料同意讀取失敗時重試一次，避免已同意帳號被誤判成需要重新同意 ([4faf56b](https://github.com/portfolio-author/jia-jian-log/commit/4faf56bc2fcfb44556213f45ab1eb83720226bda))
* 加到主畫面的 standalone PWA 不再誤判為嵌入式瀏覽器 ([6b9f4b5](https://github.com/portfolio-author/jia-jian-log/commit/6b9f4b55f98d5487cc94f374a1dd9242bbda847f))
* 白名單 gitleaks 誤判的測試藥品 id ([4773d9a](https://github.com/portfolio-author/jia-jian-log/commit/4773d9a3769a7c036f8d86b56afdc7f035eed8e3))
* 白名單 gitleaks 誤判的測試藥品 id ([cbebd2f](https://github.com/portfolio-author/jia-jian-log/commit/cbebd2f8f63038b2351d337f40c41984c324d54f))

## [1.11.0](https://github.com/portfolio-author/jia-jian-log/compare/jia-jian-log-v1.10.0...jia-jian-log-v1.11.0) (2026-08-28)


### Features

* show dose-count checkmark on collapsed completed meal slots ([2e82c32](https://github.com/portfolio-author/jia-jian-log/commit/2e82c3233460f44828ffde5c121d9fc445555849))
* show drug category on the simplified taken-dose card ([5685d97](https://github.com/portfolio-author/jia-jian-log/commit/5685d974423a2f2355fa33a4f01c430caf669202))
* show x/y dose progress in each meal-slot heading ([fb981ee](https://github.com/portfolio-author/jia-jian-log/commit/fb981ee77bbf6083fb640090af7372d9c2d362e8))
* simplify a medication card after it's marked taken ([6bfdd6f](https://github.com/portfolio-author/jia-jian-log/commit/6bfdd6f6c246e98d81163975f2200d8d17dcecbd))


### Bug Fixes

* 已服用藥卡改用 emerald 色階，不再混紅色/洋紅 ([93dbd1b](https://github.com/portfolio-author/jia-jian-log/commit/93dbd1b266968b3238c0b575d951d617703882a9))
* 已服用藥卡藥名/分類改用 emerald 色階 ([74348ae](https://github.com/portfolio-author/jia-jian-log/commit/74348aec7a047f0fc4089329b8301a25e6991b61))
* 用診斷找到的真實 id 補上 BRILINTA/Exforge 的 atc_code ([1c8a2e9](https://github.com/portfolio-author/jia-jian-log/commit/1c8a2e914c457335f5415a194782a36dceec69a5))
* 用診斷找到的真實 id 補上 BRILINTA/Exforge 的 atc_code ([78e4ec5](https://github.com/portfolio-author/jia-jian-log/commit/78e4ec55f3957680807c659046c0684485945361))

## [1.10.0](https://github.com/portfolio-author/jia-jian-log/compare/jia-jian-log-v1.9.0...jia-jian-log-v1.10.0) (2026-08-28)


### Features

* add post-op fluid balance tracking module ([ee7bb41](https://github.com/portfolio-author/jia-jian-log/commit/ee7bb41fe246d6e98ab07220b3120dc824d9fe92))
* add post-op fluid balance tracking module ([ad7e315](https://github.com/portfolio-author/jia-jian-log/commit/ad7e3156660b791e121769ec30a786c18c7ca476))

## [1.9.0](https://github.com/portfolio-author/jia-jian-log/compare/jia-jian-log-v1.8.0...jia-jian-log-v1.9.0) (2026-08-27)


### Features

* 幫示範／種子資料的藥品補上查證過的 WHO ATC 分類碼 ([fdd8c23](https://github.com/portfolio-author/jia-jian-log/commit/fdd8c2343af4d073ac750d108ed378dfd787580e))
* 幫示範／種子資料的藥品補上查證過的 WHO ATC 分類碼 ([12a88d3](https://github.com/portfolio-author/jia-jian-log/commit/12a88d3dcf2b2d676a78f5886b009c75d83eb0fa))


### Bug Fixes

* ATC 主要功能回填改用 catalog_source_id，不再依賴幾乎沒人有值的 drug_product_id ([ebfd809](https://github.com/portfolio-author/jia-jian-log/commit/ebfd80934d07bfb47029d506e3856c1d6d268d84))
* ATC 主要功能回填改用 catalog_source_id，修正 20260827050000 的錯誤假設 ([b1b4a0f](https://github.com/portfolio-author/jia-jian-log/commit/b1b4a0f59bd95cd5e07fc03b53814cd1b009f081))
* 修正 ATC 回填函式的 LATERAL 關聯語法錯誤 ([f262b14](https://github.com/portfolio-author/jia-jian-log/commit/f262b1465c4d5e35a492168e6b1e8128110b278e))
* 修正 ATC 回填函式的 LATERAL 關聯語法錯誤（42P10） ([ccafa0a](https://github.com/portfolio-author/jia-jian-log/commit/ccafa0a6896c3fd0da3b5ae8960f5ad55d511954))
* 連結 staging 種子資料的 Bokey／BRILINTA／Exforge 到官方 TFDA 藥品目錄 ([67b5cbc](https://github.com/portfolio-author/jia-jian-log/commit/67b5cbc928267f7eb7783c20b1e5c0cffcc324be))
* 連結 staging 種子資料的 Bokey／BRILINTA／Exforge 到官方 TFDA 藥品目錄 ([1a42399](https://github.com/portfolio-author/jia-jian-log/commit/1a423993011aeff0c4f3ab0bf3814edea49369b2))

## [1.8.0](https://github.com/portfolio-author/jia-jian-log/compare/jia-jian-log-v1.7.0...jia-jian-log-v1.8.0) (2026-08-27)


### Features

* add dementia care module (agitation, day-night reversal, wandering risk) ([eb3cb40](https://github.com/portfolio-author/jia-jian-log/commit/eb3cb40ee29fa0dcd8ca3cdb2c75d9f2ee850848))
* add first-use onboarding wizard for daily care modules ([1cbe9da](https://github.com/portfolio-author/jia-jian-log/commit/1cbe9daf619c67de246b1027d90ce37ae920a3b1))
* add first-use onboarding wizard for daily care modules ([d507aa4](https://github.com/portfolio-author/jia-jian-log/commit/d507aa431d981c6ac7ccf6434fbc895725d98b61))
* Add navigation hub for educational guide pages (issue [#442](https://github.com/portfolio-author/jia-jian-log/issues/442) follow-up) ([85173a1](https://github.com/portfolio-author/jia-jian-log/commit/85173a11ab62c40d73afe3a4604860175ad2907b))
* add pet vet report and widen pet modules to human care ([07d5e17](https://github.com/portfolio-author/jia-jian-log/commit/07d5e17fc1ab0a42bf9c8b1f784163a7a3b4b4cb))
* add public bilingual SEO content guide pages ([#442](https://github.com/portfolio-author/jia-jian-log/issues/442)) ([fbcb649](https://github.com/portfolio-author/jia-jian-log/commit/fbcb6493f2b8d210c774f61cf7dca68def088217))
* demo 導覽最後加登入 CTA，並把試用模組偏好交接給正式帳號 ([595d0f1](https://github.com/portfolio-author/jia-jian-log/commit/595d0f1e7eb8aa2d2d25fc2e454a588286cfd9df))
* demo 導覽最後加登入 CTA，並把試用模組偏好交接給正式帳號 ([5b67aaa](https://github.com/portfolio-author/jia-jian-log/commit/5b67aaa5fc90c6e7118edc26fb88d2fe0a1d6284))
* garbage-collect orphaned medication appearance photos ([c798cc2](https://github.com/portfolio-author/jia-jian-log/commit/c798cc2271fac99343fb6ca06fa179b95fceea13))
* Queue blood pressure saves while offline ([6804ed0](https://github.com/portfolio-author/jia-jian-log/commit/6804ed0a84f6e1a1a783ee60367ca53c39b9d7b3))
* robots.txt、sitemap.xml 與公開路由靜態化 ([acbbd11](https://github.com/portfolio-author/jia-jian-log/commit/acbbd1168e959988f09b3ab8b8429dcc033949b0))
* staging 種子資料的「王阿姨」改名為李阿姨並加入 Bokey/Brilinta/Exforge ([5d577ff](https://github.com/portfolio-author/jia-jian-log/commit/5d577ff3596971510151310cd5de9202a20d2433))
* staging 種子資料的「王阿姨」改名為李阿姨並加入 Bokey/Brilinta/Exforge ([4f82466](https://github.com/portfolio-author/jia-jian-log/commit/4f82466ba95df445254a41a261fe29c2e53d8d99))
* 公開雙語衛教內容頁（A3 內容型入口頁） ([8f970cb](https://github.com/portfolio-author/jia-jian-log/commit/8f970cb3226ca78300e35db0d5128efc50134bff))
* 同步 TFDA ATC 藥理治療分類，自動標示藥品主要功能 ([72d1ff7](https://github.com/portfolio-author/jia-jian-log/commit/72d1ff7abff8a785b30e06299fd9f73436ac0233))
* 同步 TFDA ATC 藥理治療分類，自動標示藥品主要功能 ([37765cf](https://github.com/portfolio-author/jia-jian-log/commit/37765cf1cf20d760e8c7d8b5770d135f4d5ec130))
* 建置期產生 robots.txt 對應的 sitemap.xml 與公開路由靜態 HTML ([c9e1cfe](https://github.com/portfolio-author/jia-jian-log/commit/c9e1cfe1a556a76300a937ea65c9b978226dd55a))
* 換看護交接手冊，一頁雙語照護手冊可列印 ([#418](https://github.com/portfolio-author/jia-jian-log/issues/418)) ([aecbaeb](https://github.com/portfolio-author/jia-jian-log/commit/aecbaeba3c4fa80576347dadbb2543a8e6ccb8d1))
* 換看護交接手冊，一頁雙語照護手冊可列印 ([#418](https://github.com/portfolio-author/jia-jian-log/issues/418)) ([678c5b7](https://github.com/portfolio-author/jia-jian-log/commit/678c5b7c89db53c04c8c00b4d65f147bf41d1d80))
* 服藥頁改為四個分頁並新增藥名紅色醒目與英文優先偏好 ([7945403](https://github.com/portfolio-author/jia-jian-log/commit/7945403e735fb0ce2d7548ebe12685cbc2b3aadf))
* 服藥頁改為四個分頁並新增藥名紅色醒目與英文優先偏好 ([9a84cdc](https://github.com/portfolio-author/jia-jian-log/commit/9a84cdc8eb33aa248536b376ad0b0176ddb3d178))
* 移除禁止縮放並加入可調閱讀字級，讓老花家屬看得清楚 ([0825d25](https://github.com/portfolio-author/jia-jian-log/commit/0825d259f1508aaa71927868ff9bd5986d3c61d8))
* 移除禁止縮放並加入可調閱讀字級，讓老花家屬看得清楚 ([04bff21](https://github.com/portfolio-author/jia-jian-log/commit/04bff21a1d4ec0e66df069e1ba4860291bea40df))
* 補上分享預覽卡與 SEO meta，讓 APP_CANONICAL_URL 不再是死碼 ([c30870e](https://github.com/portfolio-author/jia-jian-log/commit/c30870e8e539735ea5b3ddc079f608e8ae8cd572))
* 補上分享預覽卡與 SEO meta（issue [#437](https://github.com/portfolio-author/jia-jian-log/issues/437)） ([fd81d33](https://github.com/portfolio-author/jia-jian-log/commit/fd81d3355b2b7b045c09dbb1f486324d9979a617))
* 點擊藥品照片可放大看原始清晰版 ([456b56e](https://github.com/portfolio-author/jia-jian-log/commit/456b56ea5844e89b4fc4356eccb8ee0bad2fd29d))
* 點擊藥品照片可放大看原始清晰版 ([5ca0e97](https://github.com/portfolio-author/jia-jian-log/commit/5ca0e97e3094f922a5296a6d61932781ba150a1f))


### Bug Fixes

* add missing security headers flagged by ZAP baseline scan ([83e6163](https://github.com/portfolio-author/jia-jian-log/commit/83e61630ece5d2df51fcf357404601a2fc6f6256))
* add missing security headers flagged by ZAP baseline scan ([566b28d](https://github.com/portfolio-author/jia-jian-log/commit/566b28dc333c5a365a3028eba0d170a946a681c3))
* address offline-queue reviewer findings ([522b3db](https://github.com/portfolio-author/jia-jian-log/commit/522b3db5c2925a501a8fb214d47c716c9f13d716))
* align guide page colors with shared palette, add per-page SEO title/description ([d65454e](https://github.com/portfolio-author/jia-jian-log/commit/d65454eb027a9f288aa04fa74efbcec4fc308bfa))
* allow COOP popups so Google GIS sign-in doesn't blank out ([4b188a6](https://github.com/portfolio-author/jia-jian-log/commit/4b188a63ff01b4ec1e57677ea28e82e92370d908))
* allow COOP popups so Google GIS sign-in doesn't blank out ([01403e3](https://github.com/portfolio-author/jia-jian-log/commit/01403e397520981639fb0c57d5bfd99cd2fc4d30))
* allow sachet as a valid medication appearance shape ([a015316](https://github.com/portfolio-author/jia-jian-log/commit/a015316df446d51bd5020d0cda124eea931ce7c6))
* base onboarding wizard on stored preference row, not localStorage ([fef93dd](https://github.com/portfolio-author/jia-jian-log/commit/fef93dd4cce0348f5d07d053c31fead177c7bdcf))
* Harden security checks and RLS verification ([01db3e7](https://github.com/portfolio-author/jia-jian-log/commit/01db3e74c2c93cca3dc7b6d4fc72e68d48295e4c))
* isolate onboarding wizard state per patient and its own saving flag ([66f4241](https://github.com/portfolio-author/jia-jian-log/commit/66f42417919e4e8ef36147f7d106150d7fcd02b3))
* localize trend chart units instead of hardcoding Indonesian words ([15b078b](https://github.com/portfolio-author/jia-jian-log/commit/15b078b7d4b26aaed2350f2db835874ece03e564))
* make endocrine report and glucose thresholds species-aware ([0cb7493](https://github.com/portfolio-author/jia-jian-log/commit/0cb7493ce6c83d60e2619778cadebee9d6a14ffd))
* Repair RLS test for mother's canonical patient and add BP mutation checks ([07b65ec](https://github.com/portfolio-author/jia-jian-log/commit/07b65ec34e35f5df6f0ea4f4bd7ecf4fe835bd5d))
* Track meta tag ownership to prevent SEO breakage on unmount ([83acf46](https://github.com/portfolio-author/jia-jian-log/commit/83acf4614fad48c509bf0cc2881976a3751f8b85))
* Use psql comment syntax in migration replay heredoc ([d9d1144](https://github.com/portfolio-author/jia-jian-log/commit/d9d1144eccaab2ad40d3556e425a206da63321ce))
* 修正 TFDA ATC 欄位名稱，改用官方標示的主項分類 ([ed25ca7](https://github.com/portfolio-author/jia-jian-log/commit/ed25ca700e73a59d0e531409b0c2727b02c1c940))
* 修正 TFDA ATC 欄位名稱，改用官方標示的主項分類 ([6b11453](https://github.com/portfolio-author/jia-jian-log/commit/6b114538ec1433ad08f5d1d5ce43b8d5aea87d45))
* 修正調整藥品時「收合」按鈕會丟棄已上傳照片的問題 ([bf2d4a4](https://github.com/portfolio-author/jia-jian-log/commit/bf2d4a45c0e0dd092bdc3a0b84864f7f4f3acc63))
* 分享預覽卡雙語順序改為印尼文在前，補上 TECHNICAL.md 說明 ([26ba32e](https://github.com/portfolio-author/jia-jian-log/commit/26ba32e0948377d5f50c61e08c684e38342de3be))
* 列印時用 beforeprint/afterprint 主動重設閱讀字級 ([a384022](https://github.com/portfolio-author/jia-jian-log/commit/a3840225825685a4263d49999c9069963c580f05))
* 只在真的修改欄位時才標記藥品修正為待儲存 ([52a24f5](https://github.com/portfolio-author/jia-jian-log/commit/52a24f54b1796c71f5ec3016411d1137bfaca45a))
* 放寬 ATC 主要功能回填條件，不再限定 verification_status = official ([aeceb50](https://github.com/portfolio-author/jia-jian-log/commit/aeceb505b83d2f069961f96fadcb4f417101ee39))
* 放寬 ATC 主要功能回填條件，不再限定 verification_status = official ([751fb92](https://github.com/portfolio-author/jia-jian-log/commit/751fb922af455ab235bdd57702aee8dbd3fe1878))
* 標註 App.tsx 病人身分解析 effect 刻意省略的依賴 ([460f070](https://github.com/portfolio-author/jia-jian-log/commit/460f070240358f0efe3221b467612ac614d3c96f))
* 標註 App.tsx 病人身分解析 effect 刻意省略的依賴 ([7c475bc](https://github.com/portfolio-author/jia-jian-log/commit/7c475bc1121242c67d59ca0c081d20841590d0ab))
* 補上 pageshow 監聽讓 iOS Chrome 也能觸發 PWA 更新提示 ([ac9e16d](https://github.com/portfolio-author/jia-jian-log/commit/ac9e16d1053c3db28fd5561c3690ddd709f2f031))
* 試用承接改用 ref 讀最新物種，避免重跑 effect 清掉承接提示 ([66e06b5](https://github.com/portfolio-author/jia-jian-log/commit/66e06b5a7036d48aa237e9f2f1753802385be065))

## [1.7.0](https://github.com/portfolio-author/jia-jian-log/compare/jia-jian-log-v1.6.0...jia-jian-log-v1.7.0) (2026-08-22)


### Features

* Add bird pet option ([781fd5f](https://github.com/portfolio-author/jia-jian-log/commit/781fd5f8405284b0f818baf053d1cfdb0c609678))
* Add bird pet option ([59a4244](https://github.com/portfolio-author/jia-jian-log/commit/59a42448803565101c9c5dd6184b87ba27aa8aec))
* Add pet chronic care history trends ([91cd7dc](https://github.com/portfolio-author/jia-jian-log/commit/91cd7dcccb91827f6755f7e8c19ec4bd8ee06a35))
* Add pet chronic care history trends ([9e442e8](https://github.com/portfolio-author/jia-jian-log/commit/9e442e888a8a904650b17360573e9271091db984))
* enrich staging care fixtures ([526e456](https://github.com/portfolio-author/jia-jian-log/commit/526e456b76a5582b9cfbdde3d2eb6cc75bb2e671))
* Enrich staging care fixtures ([50de0df](https://github.com/portfolio-author/jia-jian-log/commit/50de0dfbe0a2efbe257b5d9d180c4b4bb19e6246))


### Bug Fixes

* address Codex P1 findings on the v1.6.0 promotion PR ([#380](https://github.com/portfolio-author/jia-jian-log/issues/380)) ([a235b16](https://github.com/portfolio-author/jia-jian-log/commit/a235b167bcb02f0d5b3aa55a57c20ad3bb09d39c))
* Debounce review thread gate race ([d0728bc](https://github.com/portfolio-author/jia-jian-log/commit/d0728bcf0b57ca9f428e9a8fb409b3bb1b20562f))
* Exclude birds from cat litter module ([35301be](https://github.com/portfolio-author/jia-jian-log/commit/35301be04ed7b60a5396c6362105657cda9e4bf6))
* keep each security scan independent, skip badge when tests skipped ([cf51505](https://github.com/portfolio-author/jia-jian-log/commit/cf515054d2486a7c35c8aea6e97dca3566df6a66))
* Keep share tokens out of URL paths ([e1278d4](https://github.com/portfolio-author/jia-jian-log/commit/e1278d4f7c5798c6163ac2eb7e442d1774d0b834))
* pin oven-sh/setup-bun to a commit SHA ([054c4c8](https://github.com/portfolio-author/jia-jian-log/commit/054c4c8327f48cf484258d4cc683de6d4793a74b))
* prefix semgrep docker run with the semgrep command ([f3be9a8](https://github.com/portfolio-author/jia-jian-log/commit/f3be9a8a2de034f9772661b2c51aaf2d1a58e753))
* Preserve staging medication change snapshots ([e58c1e6](https://github.com/portfolio-author/jia-jian-log/commit/e58c1e6975bfd20a600b80c6dbd3ad5994d624f4))
* run unit tests with --isolate to fix flaky app-ci ([9794d93](https://github.com/portfolio-author/jia-jian-log/commit/9794d93003a9759e6f56c0a210271e557d5136e8))
* run unit tests with --isolate to fix flaky app-ci ([fdcbc41](https://github.com/portfolio-author/jia-jian-log/commit/fdcbc4141f2512550ba60dedf4da529327347f99))
* stop activePatientPreference test from hitting live network ([2588c9b](https://github.com/portfolio-author/jia-jian-log/commit/2588c9bbf9018f24f9308140035177041ac48985))
* stop CI false-green on failing tests, cut Actions job count ~35-50% ([596cb0c](https://github.com/portfolio-author/jia-jian-log/commit/596cb0c3c94e6b42f8fd6d90dca54431eb02faff))
* stop CI reporting false green on failing tests, cut Actions job count ([e35e46e](https://github.com/portfolio-author/jia-jian-log/commit/e35e46ec4501beda40137051626a856095a00ab2))
* Telegram 通知失敗時在畫面上顯示警示 ([8950245](https://github.com/portfolio-author/jia-jian-log/commit/895024597b834dfdb5a9a095d02b0eb6b76c5190))
* Telegram 通知失敗時在畫面上顯示警示 ([3f38776](https://github.com/portfolio-author/jia-jian-log/commit/3f38776be7447fc8f233eed252db90aca46870be))
* 修正藥品資料的確認提示與防止修正被靜默忽略 ([4be3db2](https://github.com/portfolio-author/jia-jian-log/commit/4be3db2fce80fa45fbc2caca4126f5af5f8ced7c))
* 補上共用藥品目錄的跨病人保護、稽核快照修正與技術文件 ([2f76698](https://github.com/portfolio-author/jia-jian-log/commit/2f766986ccdf848aedbf68e09c0aeedd737f012e))
* 讓照護者能修正既有藥品的劑型與外觀登錄錯誤 ([7707dba](https://github.com/portfolio-author/jia-jian-log/commit/7707dba3f3160b0603f5e8ce46b4619676221fe2))
* 通知警示要按病人歸戶，也要涵蓋設定缺漏 ([405b113](https://github.com/portfolio-author/jia-jian-log/commit/405b113a89cad3e6df91566ec4cdab3ea82ae9c2))
* 邀請被照顧者失敗時顯示實際原因 ([30ae539](https://github.com/portfolio-author/jia-jian-log/commit/30ae539e6411691fcc578e0292b5ac161fc6553b))

## [1.6.0](https://github.com/portfolio-author/jia-jian-log/compare/jia-jian-log-v1.5.0...jia-jian-log-v1.6.0) (2026-08-21)


### Features

* add custom daily-care template option and fix pet preference persistence ([0a5e3fa](https://github.com/portfolio-author/jia-jian-log/commit/0a5e3fa789feb93ed6941d7a0da7fce442a2aa34))
* add one demo pet patient per species and wire pet pages to demo storage ([0853ec7](https://github.com/portfolio-author/jia-jian-log/commit/0853ec74bec6f80301ca38a4ec9be9830f011535))
* integrate careRecipientType into module visibility filtering ([d87c0a5](https://github.com/portfolio-author/jia-jian-log/commit/d87c0a58d83420fa0a79fb6953f4c8647aca818a))
* integrate pet care pages into daily care module system ([8a86ff0](https://github.com/portfolio-author/jia-jian-log/commit/8a86ff00ca188127429e4de22e717bdbe68d0727))
* wire pet chronic care pages to real Supabase tables ([53d0a03](https://github.com/portfolio-author/jia-jian-log/commit/53d0a03dc38a4a91c14778cda9bb0021c26c0bae))


### Bug Fixes

* correct osv-scanner checksums filename ([d91e688](https://github.com/portfolio-author/jia-jian-log/commit/d91e688174a2e5e211821a7879c6ea2a345f395d))
* correct semgrep CLI flag from --baseline-ref to --baseline-commit ([716f845](https://github.com/portfolio-author/jia-jian-log/commit/716f845e11a44ea2940f2931ec3c2628df1b03f1))
* name downloaded osv-scanner binary to match checksums entry ([2781507](https://github.com/portfolio-author/jia-jian-log/commit/278150787b010c3b3f620480489915e6a4092b90))
* read staging Supabase service_role key from env instead of hardcoding ([7ce704e](https://github.com/portfolio-author/jia-jian-log/commit/7ce704e27f178766a5f6e92efc9b1cbaeb616f52))
* read staging Supabase service_role key from env instead of hardcoding ([97c67b6](https://github.com/portfolio-author/jia-jian-log/commit/97c67b625d967ecc670da6f7305dc0f6a2d084a8))
* revoke EXECUTE from PUBLIC (not just anon/authenticated) on 16 lint-flagged functions ([041327f](https://github.com/portfolio-author/jia-jian-log/commit/041327fef59ca59754ea3914374d19e6758753c5))
* revoke EXECUTE from PUBLIC, not just anon/authenticated, on 16 lint-flagged functions ([4d73e25](https://github.com/portfolio-author/jia-jian-log/commit/4d73e25d19fb5651f2f02a6f18bed9e9190cbfc7))
* species-scoped fallback when leaving custom template empties the visible set ([bcb81ba](https://github.com/portfolio-author/jia-jian-log/commit/bcb81bad815c17d8313b21ae40c369601f7b13fb))
* validate STAGING_SUPABASE_URL against known staging project ref ([bf6b0c5](https://github.com/portfolio-author/jia-jian-log/commit/bf6b0c56676ddb20f5b4d327af5d414fc84e710b))
* 體溫輸入時不因格式檢查而禁用提交按鈕 ([04c7b23](https://github.com/portfolio-author/jia-jian-log/commit/04c7b23ad76ada04ac4ac13505606522f54b86e0))
* 體溫輸入時不因格式檢查而禁用提交按鈕 ([5b130ba](https://github.com/portfolio-author/jia-jian-log/commit/5b130ba3391ea5928707bb9de047f74b76ec2c15))

## [1.5.0](https://github.com/portfolio-author/jia-jian-log/compare/jia-jian-log-v1.4.1...jia-jian-log-v1.5.0) (2026-08-19)


### Features

* enlarge rest-reminder text and color-code BP countdown banner ([fd9b28c](https://github.com/portfolio-author/jia-jian-log/commit/fd9b28c17f139ba4d3538fb4503f6d914fe6a517))
* 自動應用 production Supabase migration ([34579f3](https://github.com/portfolio-author/jia-jian-log/commit/34579f30700609ee60d20d19417cb56d3d3e2ebe))
* 自動應用 production Supabase migration，與 staging 流程一致 ([6d5763f](https://github.com/portfolio-author/jia-jian-log/commit/6d5763f9e3e7a62ca1e7f0fca4232cf7edb24ce3))
* 血壓醫師版列印報告加入目前藥單 ([20c71dd](https://github.com/portfolio-author/jia-jian-log/commit/20c71ddd3a95532c1564caf3578307c2e05a45f8))


### Bug Fixes

* 修正血壓今日明細因時間字串格式不同而重複顯示「同步中」 ([ada4de0](https://github.com/portfolio-author/jia-jian-log/commit/ada4de08fea8aff0d0fd65a024179b3097614250))
* 修正血壓今日明細因時間字串格式不同而重複顯示同步中 ([3d46095](https://github.com/portfolio-author/jia-jian-log/commit/3d46095c79594604f50efc8e403b9c2e9a536f92))

## [1.4.1](https://github.com/portfolio-author/jia-jian-log/compare/jia-jian-log-v1.4.0...jia-jian-log-v1.4.1) (2026-08-18)


### Bug Fixes

* 移除體重紀錄的人類體型假設上下限 ([8606d9e](https://github.com/portfolio-author/jia-jian-log/commit/8606d9ebe4bba607c6e76d626bfd12d6b37350ab))
* 移除體重紀錄的人類體型假設上下限 ([227c60f](https://github.com/portfolio-author/jia-jian-log/commit/227c60fcd08e4a5e529187a17ab648e676c0f8f5))

## [1.4.0](https://github.com/portfolio-author/jia-jian-log/compare/jia-jian-log-v1.3.1...jia-jian-log-v1.4.0) (2026-08-18)


### Features

* 把近期趨勢移進各照護模組，資料分頁改為綜合報告 ([429e849](https://github.com/portfolio-author/jia-jian-log/commit/429e849726442a5b19ab5d0e2041fab1483e8119))
* 新增粉包劑型，劑量單位可顯示「幾包」 ([6f5fd02](https://github.com/portfolio-author/jia-jian-log/commit/6f5fd02fe1028efff5bf203e31fe454b79203c82))


### Bug Fixes

* fall back to JPEG when the browser can't encode WebP for care event photos ([dcb8060](https://github.com/portfolio-author/jia-jian-log/commit/dcb80603a3c701a51ac85043d1104c3283d6bf43))
* JPEG fallback for care event photos when browser can't encode WebP ([feaebd8](https://github.com/portfolio-author/jia-jian-log/commit/feaebd84b77ca194fe69e14813033434d257d062))
* re-enable care event photo upload buttons ([28144df](https://github.com/portfolio-author/jia-jian-log/commit/28144df4d507df7301898642383d71d4b2ac1c4e))
* re-enable care event photo upload buttons ([ea11ec2](https://github.com/portfolio-author/jia-jian-log/commit/ea11ec26eae50c5bc63f9ee6aa1ee3d4487e06a1))
* stabilize bottom nav during keyboard close, surface photo save error detail ([#329](https://github.com/portfolio-author/jia-jian-log/issues/329)) ([a8deeff](https://github.com/portfolio-author/jia-jian-log/commit/a8deeff501cfdfd55177f8b36a46f0a0282f6986))
* temporarily hide care event photo upload buttons ([#332](https://github.com/portfolio-author/jia-jian-log/issues/332)) ([d74f774](https://github.com/portfolio-author/jia-jian-log/commit/d74f774e13bdbb2e3e2f226fc7a84a85a307010e))
* **vitals:** 量測清單改成最新的量測時間排在最上面 ([cfa1bd1](https://github.com/portfolio-author/jia-jian-log/commit/cfa1bd1136f8e2e41a78197d9a8ecd9aa0e1f505))
* **vitals:** 量測清單改成最新的量測時間排在最上面 ([b7d436b](https://github.com/portfolio-author/jia-jian-log/commit/b7d436b87f8e23fd2dd0603a156da3d6b924b395))
* **vitals:** 體重「今天的紀錄」也改成最新量測排最上面 ([bddfe8b](https://github.com/portfolio-author/jia-jian-log/commit/bddfe8b13de16d59de61d728a0ef4d18431907f7))
* **vitals:** 體重「今天的紀錄」也改成最新量測排最上面 ([f9d8b42](https://github.com/portfolio-author/jia-jian-log/commit/f9d8b42e6b0c2c845ecd948b7eb702f294ed2045))
* 家庭成員與顯示名稱錯誤改用共用雙語訊息，不再洩漏 RPC 原文 ([bbbc8f0](https://github.com/portfolio-author/jia-jian-log/commit/bbbc8f00822403934b46db217d097ec87490ba06))
* 家庭成員與顯示名稱錯誤改用共用雙語訊息，不再洩漏 RPC 原文 ([90066c4](https://github.com/portfolio-author/jia-jian-log/commit/90066c49c72133200c2f64e34b8b1c58b625a0da))
* 移除報告與通知的中文硬編碼，並讓飲食頁跨午夜換日 ([bd46547](https://github.com/portfolio-author/jia-jian-log/commit/bd4654748e103afac5d67f046ee4fc343eb147c1))
* 移除體重「最近紀錄」清單殘留的槽位編號文字 ([a9b1649](https://github.com/portfolio-author/jia-jian-log/commit/a9b164916309784c62d19c9db7e866892f4a6438))
* 統一血壓跳欄規則、體重改以時間操作、體溫額度改為接近上限才提示 ([914bf92](https://github.com/portfolio-author/jia-jian-log/commit/914bf928637a88de898dbe1ce192ccbfa0a1fb76))
* 藥單「調整」按鈕的可見回饋與覆蓋提示，並新增粉包劑型 ([5d73773](https://github.com/portfolio-author/jia-jian-log/commit/5d737735dd1054d203352a79364c42cf44598b6e))
* 說明教學導覽 effect 為何不依賴 startTutorial ([945f3a2](https://github.com/portfolio-author/jia-jian-log/commit/945f3a29575343ed8f71cb176f52d2def440f333))
* 讓藥單「調整」按鈕看得見反應並講清楚覆蓋既有醫囑 ([1f28e5e](https://github.com/portfolio-author/jia-jian-log/commit/1f28e5ecf0d88a6a5ef5fac123e09c9be672ff78))
* 防止已歸檔照護對象讓畫面顯示的人與寫入的人不一致 ([ee2475b](https://github.com/portfolio-author/jia-jian-log/commit/ee2475b02b94fa737b15457846d827571c801eea))
* 體重顯示改為小數點後兩位 ([32c8147](https://github.com/portfolio-author/jia-jian-log/commit/32c814766615703025b86a4a7183753dbadd8ef4))
* 體重顯示改為小數點後兩位 ([981af2d](https://github.com/portfolio-author/jia-jian-log/commit/981af2d18c7bdabc5cc62191bae867e3edf7c8e5))

## [1.3.1](https://github.com/portfolio-author/jia-jian-log/compare/jia-jian-log-v1.3.0...jia-jian-log-v1.3.1) (2026-08-16)


### Bug Fixes

* skip Vercel builds for docs-only pushes; batch pushes in workflow ([61a363c](https://github.com/portfolio-author/jia-jian-log/commit/61a363ccd06b04d6fa2e924a4c6e5c47b00fe3dd))
* skip Vercel builds for docs-only pushes; batch pushes in workflow ([1f3c441](https://github.com/portfolio-author/jia-jian-log/commit/1f3c4410ba6c1e42614138c3ffc6a2332559507e))

## [1.3.0](https://github.com/portfolio-author/jia-jian-log/compare/jia-jian-log-v1.2.4...jia-jian-log-v1.3.0) (2026-08-16)


### Features

* Add patient-scoped calendar agenda ([19b36ab](https://github.com/portfolio-author/jia-jian-log/commit/19b36ab66ea9819c559efb3c5dd155a17ebc1598))
* Enable photos for every care event ([0e39836](https://github.com/portfolio-author/jia-jian-log/commit/0e3983661eee66399d2503c6c681b25de8b3a49e))


### Bug Fixes

* mark fallback release notes as untranslated instead of guessing ([8705f7f](https://github.com/portfolio-author/jia-jian-log/commit/8705f7fe50ed186ef4e3d2f18516ae4893c9fb79))
* never show a blank bilingual placeholder on release notes ([fc62cc9](https://github.com/portfolio-author/jia-jian-log/commit/fc62cc93b2a323be3b3dd6834ff479e1f9e18fca))
* stop showing blank bilingual placeholder on release notes ([5aa95c3](https://github.com/portfolio-author/jia-jian-log/commit/5aa95c30313216cda6353a2d8b39b164f4e858eb))

## [1.2.4](https://github.com/portfolio-author/jia-jian-log/compare/jia-jian-log-v1.2.3...jia-jian-log-v1.2.4) (2026-08-16)


### Bug Fixes

* Add keyboard navigation to medication tabs ([c6af164](https://github.com/portfolio-author/jia-jian-log/commit/c6af164e4a50a4bf0f11d0b25e8d395b9d751cad))
* Announce saved fever warnings ([b7e77df](https://github.com/portfolio-author/jia-jian-log/commit/b7e77df4fc609bd2b1579a0c92914e7f8be0f535))
* Clarify bottom navigation semantics ([052b442](https://github.com/portfolio-author/jia-jian-log/commit/052b442c4a39f9ab0362fbbb2fde621eb557acaf))
* Harden persisted blood pressure sessions ([7cfbd7c](https://github.com/portfolio-author/jia-jian-log/commit/7cfbd7c5c31497fc7f426bcb6159e1f796789e2a))
* Improve mobile report typography ([9eae497](https://github.com/portfolio-author/jia-jian-log/commit/9eae4979cf99999530e76db8846ff0ffd689c83e))
* Improve modal keyboard focus ([e3119fb](https://github.com/portfolio-author/jia-jian-log/commit/e3119fb5c8aab0beaec61d49f3a351ddf17d385f))
* Improve settings bilingual form semantics ([a1691eb](https://github.com/portfolio-author/jia-jian-log/commit/a1691ebe2ad309c9125f73647275406118cbdd45))
* Improve vital form live regions ([d679677](https://github.com/portfolio-author/jia-jian-log/commit/d679677aa401d913aeb228e3cae46e97f5e9d88c))
* Keep app shell on one scroll container ([c000742](https://github.com/portfolio-author/jia-jian-log/commit/c0007421ec35c4bf1dcb187d6300c08de47936ba))
* Keep blood pressure countdown visible ([7e9afc4](https://github.com/portfolio-author/jia-jian-log/commit/7e9afc49e018b2b94ddce8b4c33978eae86f8e78))
* Keep blood pressure countdown visible ([4b4aef3](https://github.com/portfolio-author/jia-jian-log/commit/4b4aef3c4db0aef28be18dd6e84a0c32621a8556))
* Keep daily care tabs visible on mobile ([4196c03](https://github.com/portfolio-author/jia-jian-log/commit/4196c0306066aac1475610b30e4ca487a47d9565))
* Keep demo care management read-only ([0a67a4a](https://github.com/portfolio-author/jia-jian-log/commit/0a67a4aa02b6cd613d5c0bece678028e9de11db1))
* Keep demo care management read-only ([4be8a58](https://github.com/portfolio-author/jia-jian-log/commit/4be8a58f2497f8b4aaa12be4e4db3d615f65604d))
* Localize release sections ([8929c1d](https://github.com/portfolio-author/jia-jian-log/commit/8929c1dfa0bca32b974c7f1e2717a53eba9421db))
* Localize UX-09 visible language surfaces ([cbcff90](https://github.com/portfolio-author/jia-jian-log/commit/cbcff90c3ac523e2f4080c121bb454718ffb6e4f))
* Prioritize dashboard overview on mobile ([cefd077](https://github.com/portfolio-author/jia-jian-log/commit/cefd077d2a8ee9e0d513fdd19871fa0e35947457))
* Prioritize routine medication actions ([50b1783](https://github.com/portfolio-author/jia-jian-log/commit/50b1783dbb8b09c5bd398282b48f23dfeef3e520))
* Protect modal exports from Escape dismissal ([f17cab9](https://github.com/portfolio-author/jia-jian-log/commit/f17cab9f64ac8bc139e24cb89babe8bac2e56254))
* Raise care touch targets ([be5b2cf](https://github.com/portfolio-author/jia-jian-log/commit/be5b2cfaceaa03dae0f08d5177726ed7b0137cc1))
* Respect reduced motion preferences ([50a35fe](https://github.com/portfolio-author/jia-jian-log/commit/50a35fe8f0707c3f22a447fdaba4b24d5a963933))
* Reveal older timeline entries on demand ([4d2358b](https://github.com/portfolio-author/jia-jian-log/commit/4d2358b170f2189eb69ae111b90072506caed9c1))
* Simplify weight measurement slot flow ([ced5d11](https://github.com/portfolio-author/jia-jian-log/commit/ced5d11192b605fde8e1e027d31d55e928b1768a))
* Unify public brand headers ([de04292](https://github.com/portfolio-author/jia-jian-log/commit/de042920f89e2b9ef29ba0728be6df2485793786))

## [1.2.3](https://github.com/portfolio-author/jia-jian-log/compare/jia-jian-log-v1.2.2...jia-jian-log-v1.2.3) (2026-08-15)


### Bug Fixes

* Add v1.2.3 bilingual release summary ([489b536](https://github.com/portfolio-author/jia-jian-log/commit/489b536fda65739d7c39c54923d471c2b1e3eb8d))
* Finalize release-please tags ([35f574f](https://github.com/portfolio-author/jia-jian-log/commit/35f574f4b558bf3ffacd3f40f25dc6baf7a25df0))
* Finalize release-please tags ([eb4adc3](https://github.com/portfolio-author/jia-jian-log/commit/eb4adc33230c8e7507d9a6a236f6ded1c81d74da))
* Make release log summaries durable ([1bdc32e](https://github.com/portfolio-author/jia-jian-log/commit/1bdc32e5e128f956b786f5c5b4d19a92cf0bba3f))
* Make release log summaries durable ([21762f4](https://github.com/portfolio-author/jia-jian-log/commit/21762f44d7804035e1e14f162b2481c6d09b2331))
* Narrow patient access release wording ([56e1b7f](https://github.com/portfolio-author/jia-jian-log/commit/56e1b7fc99275dd115eca34fd2463dca9f3df4a0))

## [1.2.2](https://github.com/portfolio-author/jia-jian-log/compare/jia-jian-log-v1.2.1...jia-jian-log-v1.2.2) (2026-08-15)


### Bug Fixes

* Close patient access cleanup race ([c5b5cf8](https://github.com/portfolio-author/jia-jian-log/commit/c5b5cf8da06ae9625241c1fce31fe5ce67dd51d2))
* Restrict mother account to own patient ([4f4c852](https://github.com/portfolio-author/jia-jian-log/commit/4f4c8522444cdae357a6d1e2dd835ab7a8eec212))
* Restrict mother account to own patient ([f3628ce](https://github.com/portfolio-author/jia-jian-log/commit/f3628ce3395c3f64de8c373a0aac86f4fe8ae1f5))
* Run access cleanup locks in a transaction ([e85bb6b](https://github.com/portfolio-author/jia-jian-log/commit/e85bb6b88fc1a1605a1d3e7fc1c14fade82525b8))

## [1.2.1](https://github.com/portfolio-author/jia-jian-log/compare/jia-jian-log-v1.2.0...jia-jian-log-v1.2.1) (2026-08-15)


### Bug Fixes

* anchor staging release history ([#278](https://github.com/portfolio-author/jia-jian-log/issues/278)) ([63901e4](https://github.com/portfolio-author/jia-jian-log/commit/63901e48ff4343e314007af9cee16b82dc5e01bd))
* bound release history scanning ([#275](https://github.com/portfolio-author/jia-jian-log/issues/275)) ([1661465](https://github.com/portfolio-author/jia-jian-log/commit/1661465a544fd7c17ccb0237e4b10d8180a51375))
* keep release notes bilingual by default ([#276](https://github.com/portfolio-author/jia-jian-log/issues/276)) ([445704b](https://github.com/portfolio-author/jia-jian-log/commit/445704ba7ae5e252ee01c200e4517cd7bc49e237))
* make staging use its release marker ([40e7828](https://github.com/portfolio-author/jia-jian-log/commit/40e782895d85c669dd066c13e3c118daf6be4a2c))

## [1.2.0](https://github.com/portfolio-author/jia-jian-log/compare/jia-jian-log-v1.1.2...jia-jian-log-v1.2.0) (2026-08-15)


### Features

* add 04:00 care day boundary ([f6d321d](https://github.com/portfolio-author/jia-jian-log/commit/f6d321d9d5acc68cec9c7b4ddfb6d77727e0adc0))
* add animated pointer arrow pointing to target tab ([b58fb26](https://github.com/portfolio-author/jia-jian-log/commit/b58fb26e50b0daf5a403f1afaddc72861ebb8e20))
* add body temperature tracking ([9794d7d](https://github.com/portfolio-author/jia-jian-log/commit/9794d7def448d7850866f395a6a0ed63cd93ae7b))
* Add calendar notification foundation ([5da94f5](https://github.com/portfolio-author/jia-jian-log/commit/5da94f58c760e5bbfa9fd1b03525eb079b7e1ee8))
* Add care decision timeline ([66be6e6](https://github.com/portfolio-author/jia-jian-log/commit/66be6e65fa58d45fb523f04fa0d7450ac5a5d8a4))
* Add care event photo timeline ([77a8c9f](https://github.com/portfolio-author/jia-jian-log/commit/77a8c9fa0cd922e9ab755b67e4a2a042c6982a19))
* Add care event photo timeline ([d58acf7](https://github.com/portfolio-author/jia-jian-log/commit/d58acf751de6f3eff235835d84a8bf4cbbf54b1e))
* Add cross-device weight feature toggle ([d5760d2](https://github.com/portfolio-author/jia-jian-log/commit/d5760d2455afe953d5362de5948c916da367d4cb))
* add demo onboarding tutorial and replay button ([4506e09](https://github.com/portfolio-author/jia-jian-log/commit/4506e09c55d337b07a100b2a420b161f48a7505f))
* Add event blood-pressure review ([4226e37](https://github.com/portfolio-author/jia-jian-log/commit/4226e375a13e6849df74a59d5535b5751b07bdbe))
* Add MOA animal drug Open Data import script and GitHub Actions sync workflow ([c0996f8](https://github.com/portfolio-author/jia-jian-log/commit/c0996f81f9fc7bc25fadceef33f46c52d9e5d4cf))
* Add orange cat pet icon ([62ebaee](https://github.com/portfolio-author/jia-jian-log/commit/62ebaee971658072ba12b18ed23bc23dcb41f380))
* Add patient-level care delegation ([45b7351](https://github.com/portfolio-author/jia-jian-log/commit/45b7351d5128ab36400d585376f359e54e4dabae))
* Add patient-scoped meal calorie care ([f5718ad](https://github.com/portfolio-author/jia-jian-log/commit/f5718ad2e9261410b3b8fb9c5fbac7c4942e8f3b))
* Add PRN medication event tracking ([3e0b771](https://github.com/portfolio-author/jia-jian-log/commit/3e0b7714cfa274dcf995ac3d5e283931dde287fe))
* Add PRN medication event tracking ([8a49fb0](https://github.com/portfolio-author/jia-jian-log/commit/8a49fb010b33ff9b2a692604e328cc9e1ee2c2f6))
* Add rabbit pet icon ([b1baec3](https://github.com/portfolio-author/jia-jian-log/commit/b1baec3fac46b97881ff4243b98dfe7fdf414955))
* Add release provenance page ([ffe1411](https://github.com/portfolio-author/jia-jian-log/commit/ffe14119a4d1dba1b8b98c7083772a40a5cadf24))
* Add release provenance page ([132f4eb](https://github.com/portfolio-author/jia-jian-log/commit/132f4ebdf2d886fa7f02499dfa9e544abebe64c0))
* add seed dataset and local fallback for NHI TCM products ([b083855](https://github.com/portfolio-author/jia-jian-log/commit/b083855651ac93478cb05c90637df580c0004bff))
* Add shared care timeline ([1379550](https://github.com/portfolio-author/jia-jian-log/commit/1379550ac409078557ed30b28ab7889d065e9960))
* adopt JiaJian Log brand architecture ([c334161](https://github.com/portfolio-author/jia-jian-log/commit/c334161285f49a666b1e2ba07a76201cdee2d7b6))
* adopt JiaJian Log brand architecture ([e7093a3](https://github.com/portfolio-author/jia-jian-log/commit/e7093a36e6b9e93bd8239f6dc758a13a008782dc))
* Archive pets safely ([0964447](https://github.com/portfolio-author/jia-jian-log/commit/09644475160d5d9e2887e507754e6db6beaaf589))
* Brand app as CareTrail ([23f7bfa](https://github.com/portfolio-author/jia-jian-log/commit/23f7bfa194e8ffb881878b13f349508a2442fa54))
* Brand app as CareTrail ([6034677](https://github.com/portfolio-author/jia-jian-log/commit/603467789d7304f927335b18dd07a0f3709ca399))
* Contextualize care timeline entries ([d8c3855](https://github.com/portfolio-author/jia-jian-log/commit/d8c38559c5eed5bec349dac47e40806b84d5206a))
* Default blood pressure entry to keyboard ([d98fe89](https://github.com/portfolio-author/jia-jian-log/commit/d98fe89573c63ad3e0f4c060d88ab54d32f0bc32))
* Default-expand medication meal cards ([c65cb1a](https://github.com/portfolio-author/jia-jian-log/commit/c65cb1aaee3f99323489d3756ff695af3e951a50))
* Enable live TFDA OpenData catalog search in medication management ([5e47db7](https://github.com/portfolio-author/jia-jian-log/commit/5e47db74790996bb7596262bf211e052edeb4b09))
* enable single-character search for Traditional Chinese Medicine (TCM) and add explicit RPC grants ([9fbc107](https://github.com/portfolio-author/jia-jian-log/commit/9fbc1070d43b737f6e58bee481188bde93572d92))
* expand landing page feature grid to highlight pets, family care, and timeline events ([0e28077](https://github.com/portfolio-author/jia-jian-log/commit/0e28077fa9e4ebde8c89401c0bec24de1088da24))
* Export complete care CSV ([c35f0af](https://github.com/portfolio-author/jia-jian-log/commit/c35f0afd24ed66c760ab5ef82829c7dc5b418a02))
* Give medication history its own workspace ([a78664d](https://github.com/portfolio-author/jia-jian-log/commit/a78664d3ff69fd3fa19f64fde3ac847cc34ca589))
* implement anonymous staging database seeding for Pepper Cake Family test suite ([b306056](https://github.com/portfolio-author/jia-jian-log/commit/b306056d975392d00281054a94015dd11790428d))
* implement family health record multispecies model and 3-layer d… ([745a8d1](https://github.com/portfolio-author/jia-jian-log/commit/745a8d13faacb913f64a33d5a8d666a3bc7c88d5))
* implement family health record multispecies model and 3-layer drug architecture ([219278c](https://github.com/portfolio-author/jia-jian-log/commit/219278c6948fd7d458216444e913fe9fb28a1cbb))
* Implement Registry Pattern for Medication Catalog ([0f281b7](https://github.com/portfolio-author/jia-jian-log/commit/0f281b72acce26985f7b6fc7b596e980d643f0f3))
* Implement Registry Pattern for Medication Catalog ([e2bdbbd](https://github.com/portfolio-author/jia-jian-log/commit/e2bdbbd75089191667fbcb32b506fe7a01b7826e))
* integrate Traditional Chinese Medicine with Strategy Pattern ([51949c5](https://github.com/portfolio-author/jia-jian-log/commit/51949c5941420cb18114374c86f31cd30a7e9c77))
* integrate Traditional Chinese Medicine with Strategy Pattern ([782b9e2](https://github.com/portfolio-author/jia-jian-log/commit/782b9e2a3eaf09656ff999ef9c372dac07d31dad))
* Integrate Vercel Speed Insights component into React root ([8472611](https://github.com/portfolio-author/jia-jian-log/commit/84726114af5fea1294eed3aa56fb98440a1526d6))
* Integrate Vercel Speed Insights component into React root ([ccf59c7](https://github.com/portfolio-author/jia-jian-log/commit/ccf59c78ce3b26df0e694ae8dd7dac28445098b8))
* Keep latest historical weight measurement ([85ccc2a](https://github.com/portfolio-author/jia-jian-log/commit/85ccc2acee0bc89866e3cdef26198a6988e049cc))
* Limit daily care entries and allow corrections ([e164819](https://github.com/portfolio-author/jia-jian-log/commit/e164819770ebc9dd461c728141f86834901508bd))
* make Google sign-in button full-width aligned and add bilingual i18n to header slogan ([e2c41ad](https://github.com/portfolio-author/jia-jian-log/commit/e2c41ad7d2fbcb505638914e73bc5a86d0fb60ed))
* make local Qwen produce actionable improve suggestions ([#162](https://github.com/portfolio-author/jia-jian-log/issues/162)) ([ede62a5](https://github.com/portfolio-author/jia-jian-log/commit/ede62a58c378540213139b738667dba3498780a7))
* Make medication changes timeline events ([4638b20](https://github.com/portfolio-author/jia-jian-log/commit/4638b2043ff3e2791aea5efdbbbeadd69c960700))
* Make medication changes timeline events ([ae2c39c](https://github.com/portfolio-author/jia-jian-log/commit/ae2c39c0f0ed8ecf8f235a86d8f8701183405cd1))
* Make the interview demo interactive ([085fb69](https://github.com/portfolio-author/jia-jian-log/commit/085fb696f8bea49aef3b7b2cc964d31ade461d55))
* Mark Mengni release with dog and date ([50c5301](https://github.com/portfolio-author/jia-jian-log/commit/50c5301a8585a798bb3937b4173cbc51853ddf2a))
* optimize direct numeric input UX for blood pressure ([2114649](https://github.com/portfolio-author/jia-jian-log/commit/2114649d488fd28e23d3df180cd7f3097356be65))
* Organize events and daily care tabs ([8e0f6f5](https://github.com/portfolio-author/jia-jian-log/commit/8e0f6f5abcb15883f11905574cd129acad97c29c))
* personalize daily care modules ([043d779](https://github.com/portfolio-author/jia-jian-log/commit/043d779c7c9846f29574129ebc46f36328672345))
* personalize daily care modules ([b872f95](https://github.com/portfolio-author/jia-jian-log/commit/b872f954c39aa41de82dd7d85ed1487d18bef949))
* populate comprehensive NHI TCM products dataset and verify live RPC search ([a5be791](https://github.com/portfolio-author/jia-jian-log/commit/a5be791ec863020d35df29ed794c897acd5ef43f))
* Prepare account usage tiers ([538efa8](https://github.com/portfolio-author/jia-jian-log/commit/538efa8e984bf33aff75168006fb7e96b66bca1a))
* Prioritize pet care timeline ([766bd32](https://github.com/portfolio-author/jia-jian-log/commit/766bd32ea3cba2dd39517edbf3ace85796fc6fa3))
* Record versioned health-data consent ([f038e77](https://github.com/portfolio-author/jia-jian-log/commit/f038e77e4607ee192189fe4d7eea509f9613594a))
* require consent before adding human patient ([5fd68a3](https://github.com/portfolio-author/jia-jian-log/commit/5fd68a31c84354d729426a31360144bfbcf77e9d))
* require consent before adding human patient ([505afa3](https://github.com/portfolio-author/jia-jian-log/commit/505afa35971c5a789088c49cc9bdb4b497c2cf21))
* Require visible bilingual text ([108f271](https://github.com/portfolio-author/jia-jian-log/commit/108f271aa82ce513e9d4e6d1f6fbbfa8b18104c0))
* Separate medication workspaces ([8935123](https://github.com/portfolio-author/jia-jian-log/commit/89351233b1d2c5b9d2690918b0068284a037e1ac))
* Separate medication workspaces ([b410968](https://github.com/portfolio-author/jia-jian-log/commit/b410968fb47f85359953d15c0f127376f7328c86))
* share daily care display settings ([605a973](https://github.com/portfolio-author/jia-jian-log/commit/605a9732d2459fd6044df76711fc6c14abb4264a))
* share daily care display settings by patient ([b3f8fdc](https://github.com/portfolio-author/jia-jian-log/commit/b3f8fdc76e9fd7cb45b61b1a911edcff338c0bcb))
* Share pet management with caregivers ([f4c5ea3](https://github.com/portfolio-author/jia-jian-log/commit/f4c5ea3302b41315e4feb199234ddf0839df055b))
* Show Mengni in pet type picker ([dbebce3](https://github.com/portfolio-author/jia-jian-log/commit/dbebce39a7227de9623508907c8c40c1d9c7cc08))
* smart query length filtering for single Chinese characters vs ASCII letters ([50fb2a7](https://github.com/portfolio-author/jia-jian-log/commit/50fb2a7488090fcba47ff67ce3bf616febdb340f))
* **staging:** generate 60-day fluctuating blood pressure test data ([cb9e2f9](https://github.com/portfolio-author/jia-jian-log/commit/cb9e2f9cf92db42f1e519db7fca16d9ab4c80127))
* Support four daily weight records ([a954a10](https://github.com/portfolio-author/jia-jian-log/commit/a954a10493896b04ea924530c1641378e7bb4662))
* Support four daily weight records ([ed75246](https://github.com/portfolio-author/jia-jian-log/commit/ed75246fe33d249e7f707fabb846e94b1b629065))
* Support pet care recipients ([e0881de](https://github.com/portfolio-author/jia-jian-log/commit/e0881de7a64c17639be56c32151a159efd0efe16))
* Support pet removal and many care recipients ([f88b780](https://github.com/portfolio-author/jia-jian-log/commit/f88b780ef233955cbd13bd54a0ce23c915e7eae3))
* Surface care recipient creation ([3dc72c3](https://github.com/portfolio-author/jia-jian-log/commit/3dc72c3d35785225a37ffb17235d386dba99c906))
* switch local PR review to Devstral ([f8cc8ce](https://github.com/portfolio-author/jia-jian-log/commit/f8cc8ce64e939df9162b959b870d7a382f379aaa))
* switch local Qwen to actionable improve suggestions ([3b8ab15](https://github.com/portfolio-author/jia-jian-log/commit/3b8ab15449f725752ee4723578335a8a06be111f))
* Sync medication display preference across devices ([b7b032e](https://github.com/portfolio-author/jia-jian-log/commit/b7b032e993d362425ef732a793d836747d5bb88d))
* Unify tab headers ([2cac470](https://github.com/portfolio-author/jia-jian-log/commit/2cac470e575b6c8a2d708320eb006894d8c53c21))
* Use Google GIS ID-token login ([39af339](https://github.com/portfolio-author/jia-jian-log/commit/39af339925bbfc16cc753b974931e0c0406fd2b2))
* Use Google GIS ID-token login ([0fc2a72](https://github.com/portfolio-author/jia-jian-log/commit/0fc2a725b43f926cbdf8df6bcfd7d283c24f0c36))
* Use Mengni mark in pet lists ([0694430](https://github.com/portfolio-author/jia-jian-log/commit/0694430420f8412f7ce8f577cc5ea16ec96e1780))
* **vercel:** add automated Vercel Ignored Build Step filter script ([6a6aba1](https://github.com/portfolio-author/jia-jian-log/commit/6a6aba1cac6085cb6ee11e62a2a089e41ed44a7d))


### Bug Fixes

* Add CI cost guardrails ([4b21e8f](https://github.com/portfolio-author/jia-jian-log/commit/4b21e8f2434aad3949b5eb62898146a01598d324))
* Add required file orientation headers ([edc8ccf](https://github.com/portfolio-author/jia-jian-log/commit/edc8ccfdb00f22d2f825260247c27828c27b533d))
* address body temperature review findings ([a514e00](https://github.com/portfolio-author/jia-jian-log/commit/a514e001ef4de253bc2368392cd7c32b5b766cae))
* Address care event photo review comments ([a69c2ab](https://github.com/portfolio-author/jia-jian-log/commit/a69c2ab7fac2c22508613746f2dd928dbe19bde6))
* Address patient invitation review feedback ([700448d](https://github.com/portfolio-author/jia-jian-log/commit/700448d7f35904156b7b751dd8d43d066a26a04f))
* address PR [#259](https://github.com/portfolio-author/jia-jian-log/issues/259) review feedback ([7e239be](https://github.com/portfolio-author/jia-jian-log/commit/7e239be6359d5fc9180186438c54ca09ad9e68e9))
* Address PR 196 agent map review ([299dcfc](https://github.com/portfolio-author/jia-jian-log/commit/299dcfc13401a4073de6bd79617ed915c42f4f05))
* Address PR 196 agent map review ([8f5daf6](https://github.com/portfolio-author/jia-jian-log/commit/8f5daf6c9e974aea75e0139ae03be86ae7d4b120))
* address PR branding review comments ([5303536](https://github.com/portfolio-author/jia-jian-log/commit/5303536f9644fde71e7c6a87dce810ac5e29940e))
* Address PR review feedback ([3656f60](https://github.com/portfolio-author/jia-jian-log/commit/3656f6059eb24fb93ee5bd8bd3e55a7956de1441))
* Address PR review port allocation ([b371e1a](https://github.com/portfolio-author/jia-jian-log/commit/b371e1ad977b13aa1f6d59c0301f7e74245a3df0))
* Address PRN review feedback and staging conflicts ([6e948f3](https://github.com/portfolio-author/jia-jian-log/commit/6e948f3e2c1353e4a6544410369d2ef4fd7e541f))
* Address PWA i18n review ([a147e13](https://github.com/portfolio-author/jia-jian-log/commit/a147e132af275a8770033afb701d1589adcb981b))
* Address release workflow review ([3367a79](https://github.com/portfolio-author/jia-jian-log/commit/3367a79d47599c60134ed3bb2965336781ab8995))
* Address review feedback for patient-scoped records ([04da268](https://github.com/portfolio-author/jia-jian-log/commit/04da268d6f231dfc8bb45c4614602a33bb6296d7))
* Address review feedback for patient-scoped records ([901359a](https://github.com/portfolio-author/jia-jian-log/commit/901359aa101d204f2fd317f2093d94bbbfd78343))
* Address staging promotion review feedback ([904af6e](https://github.com/portfolio-author/jia-jian-log/commit/904af6e97e5f9663a7ac2352d5cde275a66683c9))
* Address staging promotion review feedback\n\nKeep production promotion snapshots immutable, route staging migrations through the staging branch, and delay GitHub release creation until an approved promotion reaches main. Also authorize the production custom domain for Google GIS. ([2b6cc93](https://github.com/portfolio-author/jia-jian-log/commit/2b6cc93a61fc715bcb432c78610da5728f0dead3))
* Address v1.0.2 PR review feedback ([ea46b68](https://github.com/portfolio-author/jia-jian-log/commit/ea46b68b8d45c72ef420de1b4ecf04812d0bdccc))
* Address weight feature review feedback ([4a2a20b](https://github.com/portfolio-author/jia-jian-log/commit/4a2a20b688784981b4cac984646f738b17e7dd91))
* Align care events with report period ([bc32a13](https://github.com/portfolio-author/jia-jian-log/commit/bc32a13e10e6aadaa6dcc050c427af34800ad646))
* Align dashboard header and compact records ([d1fe1d4](https://github.com/portfolio-author/jia-jian-log/commit/d1fe1d4a1e995f4f4f30c09bd2f48005989ec0d4))
* align Google button width with card on desktop and remove redundant intro text ([ac5c673](https://github.com/portfolio-author/jia-jian-log/commit/ac5c673f1cc99b0f45f53874925b68f08dc36ebf))
* Align Google GIS origins with Vercel deployments ([8ad93f1](https://github.com/portfolio-author/jia-jian-log/commit/8ad93f1fbf5b8683840da1ffa269c7fe70aef9b5))
* Align tab headers and backgrounds ([e1c82ef](https://github.com/portfolio-author/jia-jian-log/commit/e1c82efd27c339e8db78c38216e12e899b13629f))
* Align weight seed data with patient model ([89a29e3](https://github.com/portfolio-author/jia-jian-log/commit/89a29e356a7e1144809263c385d55f2be98a4ace))
* Allow backfilled staging migrations ([f9c82ac](https://github.com/portfolio-author/jia-jian-log/commit/f9c82ac3c8901fc8d7cd3b20b86a6e96c36aa69d))
* allow new promotion snapshots after stale PRs ([49ff03c](https://github.com/portfolio-author/jia-jian-log/commit/49ff03cc352c1f5fe4a3d095bfb5e16045dd2da8))
* allow successful fallback reviews ([eb88e3e](https://github.com/portfolio-author/jia-jian-log/commit/eb88e3e2f2b3bfca28c0a257407ff122d81c8281))
* anchor demo medication timestamps ([0243446](https://github.com/portfolio-author/jia-jian-log/commit/024344619b914a085a8b12ca3701f748098f98de))
* assign yAxisId to ReferenceLine in DashboardChart ([c38168e](https://github.com/portfolio-author/jia-jian-log/commit/c38168e223f737cc42b49cfc0170e0111bed0884))
* assign yAxisId to ReferenceLine in DashboardChart ([220b567](https://github.com/portfolio-author/jia-jian-log/commit/220b5679daeb786a0ab1b95aa6395aca985b3734))
* authorize exact migration status check ([ac888db](https://github.com/portfolio-author/jia-jian-log/commit/ac888dbb211bd39d2718d251f7cad412c4db6b72))
* **auth:** retain database-backed displayName from useAuth across app reload ([3e57e17](https://github.com/portfolio-author/jia-jian-log/commit/3e57e17df0d3c1d1a405852fdcd5bdeae43fea83))
* automate release date display ([fea9121](https://github.com/portfolio-author/jia-jian-log/commit/fea9121cfec1a7135430306e4a6d1d2ac40b4037))
* automate release date display ([e1a3bf4](https://github.com/portfolio-author/jia-jian-log/commit/e1a3bf445f9a675b04a5a6e15ee64e64f71cc350))
* avoid macOS setup-python cache permission failure ([21b532b](https://github.com/portfolio-author/jia-jian-log/commit/21b532b34b1fb6f03cdb13aee15a1a92de3188b3))
* avoid macOS setup-python cache permission failure ([a9b134c](https://github.com/portfolio-author/jia-jian-log/commit/a9b134cab3f76e1251e812277c8f6885ff5b88b6))
* Avoid redundant pet-list RPC in settings ([457af6a](https://github.com/portfolio-author/jia-jian-log/commit/457af6abe19da9325821d419d239ce3b265b2d66))
* avoid zoom triggering keyboard mode ([31e79de](https://github.com/portfolio-author/jia-jian-log/commit/31e79decad8ac1a737e452c961d30c8614d55c1a))
* Balance recipient menu icons ([1084fe9](https://github.com/portfolio-author/jia-jian-log/commit/1084fe994127c446794aea4b9f1531c2c160230a))
* bind promotion gate to workflow event SHA ([bb74dbc](https://github.com/portfolio-author/jia-jian-log/commit/bb74dbc4058591dbd206040260d3cd676427bb68))
* block extra temperature decimals ([7c11537](https://github.com/portfolio-author/jia-jian-log/commit/7c1153722183469b2fb2cf19788ae4c52e78dcf3))
* block extra temperature decimals ([4258c48](https://github.com/portfolio-author/jia-jian-log/commit/4258c48ef029f578c3661fb2419ad652de3576e2))
* Block PWA reload while a measurement is unsaved ([6436515](https://github.com/portfolio-author/jia-jian-log/commit/64365152719fadce00120a5869b8881c7a9ca558))
* bound Release Please runtime ([#266](https://github.com/portfolio-author/jia-jian-log/issues/266)) ([73719ee](https://github.com/portfolio-author/jia-jian-log/commit/73719ee28ef4e26d437c657b9f2dc54d9e6214e0))
* **ci:** pin Supabase CLI version to 2.109.1 and update setup-cli to v3 ([b743484](https://github.com/portfolio-author/jia-jian-log/commit/b743484df34e082d7fef4aaa44f5773cd2ecc2fc))
* **ci:** remove machine-specific Supabase image cache ([52053df](https://github.com/portfolio-author/jia-jian-log/commit/52053df585e977eeec9ce4370d1188055eb25484))
* **ci:** remove machine-specific Supabase image cache ([cf7521e](https://github.com/portfolio-author/jia-jian-log/commit/cf7521ec1b08fac23ada557068d2981c63c9678a))
* **ci:** start local Supabase container before replaying migrations ([3f8543c](https://github.com/portfolio-author/jia-jian-log/commit/3f8543c72ff70141257ccde001862f24ae4f9c4c))
* Clarify medication record confirmation ([939c7f7](https://github.com/portfolio-author/jia-jian-log/commit/939c7f73f4b8f960dd20ac65bdf315944dcfbb72))
* Clarify medication record confirmation ([125f70b](https://github.com/portfolio-author/jia-jian-log/commit/125f70baf32c09a54de5a70f95b845762fd0c226))
* Clarify Mengni black dog mark ([e6984ac](https://github.com/portfolio-author/jia-jian-log/commit/e6984acff05b71e9ac7e6309a343b709abfdb250))
* Clarify weight visibility settings ([642ac5a](https://github.com/portfolio-author/jia-jian-log/commit/642ac5a4aeaa724db7324e7726b7d74b3d29ed9e))
* clear reconciled blood-pressure snapshots ([5df29dd](https://github.com/portfolio-author/jia-jian-log/commit/5df29dd6410d7fe7e052ea867b7da67f90c4505a))
* Close medication authorization review gaps ([73b3717](https://github.com/portfolio-author/jia-jian-log/commit/73b37170be6188635cbd4001f4df653f048221a9))
* Complete medication and admin translations ([17a414d](https://github.com/portfolio-author/jia-jian-log/commit/17a414d83f54562133c78d4fb051821f3423b825))
* configure Qwen token budget for PR-Agent ([#161](https://github.com/portfolio-author/jia-jian-log/issues/161)) ([35afe87](https://github.com/portfolio-author/jia-jian-log/commit/35afe872a6901107a2cb67151536ba8b182ea93e))
* configure release-please changelog path ([7dc6187](https://github.com/portfolio-author/jia-jian-log/commit/7dc6187d8f4787995d4e9583fd6d35363e72a564))
* Consolidate weight under daily care ([ea71a01](https://github.com/portfolio-author/jia-jian-log/commit/ea71a011ad1491cf967eaf24a14172ecd46169b6))
* Consolidate weight under daily care ([#253](https://github.com/portfolio-author/jia-jian-log/issues/253)) ([91c7962](https://github.com/portfolio-author/jia-jian-log/commit/91c7962fb4081ec8180a3c882e546076bac0be62))
* decode changelog safely in promotion gate ([c11e35a](https://github.com/portfolio-author/jia-jian-log/commit/c11e35aca07f2c386a2003c78ad1a4b8f57d0c93))
* decode wrapped changelog API content ([5a2df90](https://github.com/portfolio-author/jia-jian-log/commit/5a2df90a98a0af9b7f1748ffcc00e6115c061956))
* Default first visit to Traditional Chinese ([e0ccb23](https://github.com/portfolio-author/jia-jian-log/commit/e0ccb23e971e3d08d68e381e4f3308196063731c))
* Default first visit to Traditional Chinese ([455af2c](https://github.com/portfolio-author/jia-jian-log/commit/455af2ceedf8fc31bd1699f9ad5b2cef9297f4d0))
* do not let stale promotion PRs block releases ([5e11fce](https://github.com/portfolio-author/jia-jian-log/commit/5e11fcef2d6dcbfe48882c42bb009abbc840cd5c))
* Draw orange cat in profile view ([188d3e0](https://github.com/portfolio-author/jia-jian-log/commit/188d3e063ef97475bef8ce0dbe923464a64f5bd5))
* enable RLS on legacy weight measurements ([f8971a1](https://github.com/portfolio-author/jia-jian-log/commit/f8971a16d2ab8f9426fc8307ee276900d9c7a506))
* enable RLS on recovered legacy weight table ([ab3d2ae](https://github.com/portfolio-author/jia-jian-log/commit/ab3d2aef1bc0447b2bcae326536947d0e0df4a72))
* enforce shared care preference write access ([#260](https://github.com/portfolio-author/jia-jian-log/issues/260)) ([b305e4c](https://github.com/portfolio-author/jia-jian-log/commit/b305e4c858c6b1ecc479f9ae6db5ede218a2006c))
* Exempt existing family accounts from consent screen ([4e0f818](https://github.com/portfolio-author/jia-jian-log/commit/4e0f818687a9adac4303d5788b13a374e374883f))
* Explain unavailable pet management ([f116e18](https://github.com/portfolio-author/jia-jian-log/commit/f116e182f86c2963c68e499ef12f143bf911ff89))
* fail local review on parser errors ([64764d3](https://github.com/portfolio-author/jia-jian-log/commit/64764d3dd4dec159f142cd763581f48524f7877a))
* fallback generic_name to prevent null value constraint violation ([9ecd9a8](https://github.com/portfolio-author/jia-jian-log/commit/9ecd9a8f4284d91b41d10e4627a84b4826b8c76d))
* fallback to VITE_SUPABASE_PUBLISHABLE_KEY if ANON_KEY is not set ([bd25042](https://github.com/portfolio-author/jia-jian-log/commit/bd25042e101291d3b3bb47bec7210a3e63f055c6))
* filter archived care recipients from top switcher and settings ([5d0d95b](https://github.com/portfolio-author/jia-jian-log/commit/5d0d95bd17d74b952dcbdeaf4aa1beacd5066435))
* Gate review thread automation behind verification ([7da2e0b](https://github.com/portfolio-author/jia-jian-log/commit/7da2e0b379f174f9fa4bbfe02b2c63f31af6021b))
* gate staging promotion on migration success ([47b93bc](https://github.com/portfolio-author/jia-jian-log/commit/47b93bce0edf20b6cb6437417702422f3c629ce4))
* gate staging promotion on migration success ([f230586](https://github.com/portfolio-author/jia-jian-log/commit/f230586927edcad7e8fcb94d38c2a3966358e7fa))
* Generalize Telegram blood-pressure title ([d1a7fbc](https://github.com/portfolio-author/jia-jian-log/commit/d1a7fbc257bc30c336364996f2ebd1544824aebc))
* generate PNG PWA icons to prevent Chrome desktop shortcut falling back to letter icon ([a8a33ac](https://github.com/portfolio-author/jia-jian-log/commit/a8a33ac1a81188ee6d5956a3a7d676d5d60e9922))
* grant migration gate actions read permission ([e028864](https://github.com/portfolio-author/jia-jian-log/commit/e0288644e2fbe0ac7851e9b8dd51a981b00e0967))
* guard daily care preference saves ([945c4dc](https://github.com/portfolio-author/jia-jian-log/commit/945c4dc78395c449ab2d33bf8ef5661d096e9c15))
* Guard edited temperature decimals ([bee8516](https://github.com/portfolio-author/jia-jian-log/commit/bee851641f9e1ab0ad928bcd7cb9133db9647709))
* Guard edited temperature decimals ([4084589](https://github.com/portfolio-author/jia-jian-log/commit/408458990ae5c8c6c32bbca0f4a7c45c8c6547fb))
* Guard edited temperature decimals ([29e0220](https://github.com/portfolio-author/jia-jian-log/commit/29e02206d060550bd383c0bbd78626a1d4c9c1aa))
* guard Vercel staging branch ([30ba11a](https://github.com/portfolio-author/jia-jian-log/commit/30ba11abf7274ecf459f46325083b49b8c35b91d))
* Harden demo trial persistence ([fde7340](https://github.com/portfolio-author/jia-jian-log/commit/fde7340df42f73cf65603121efcc639cd529d4d5))
* harden LINE browser login gate ([ebb8774](https://github.com/portfolio-author/jia-jian-log/commit/ebb8774c5af50218966b4f17951ad6812d2132c0))
* harden manual staging promotion ([#265](https://github.com/portfolio-author/jia-jian-log/issues/265)) ([1703eee](https://github.com/portfolio-author/jia-jian-log/commit/1703eeeeebf150d76cf1c73dadbc6e4d71850a7f))
* improve mobile blood pressure keyboard mode ([2113288](https://github.com/portfolio-author/jia-jian-log/commit/211328871475513c9a466645e01ee34ff0985cd8))
* improve mobile blood pressure keyboard mode ([e19a896](https://github.com/portfolio-author/jia-jian-log/commit/e19a8963f53901124ec6d6148c3bbfa168690063))
* Isolate archived pet list failures ([ea7fbca](https://github.com/portfolio-author/jia-jian-log/commit/ea7fbca2d8a76337c70941a18c56d3362c3e76e6))
* Isolate Playwright servers per worktree ([ed93fb5](https://github.com/portfolio-author/jia-jian-log/commit/ed93fb519a7a7224f6b1037438433e9f49827c74))
* Isolate Playwright servers per worktree ([7551e4f](https://github.com/portfolio-author/jia-jian-log/commit/7551e4f0fc36cf769fb960508dca452134acd4e1))
* Keep archived pet histories visible ([ca2a5fb](https://github.com/portfolio-author/jia-jian-log/commit/ca2a5fb677fd2c8dac58bf58260c73612650caf6))
* Keep daily quota records editable ([537cb25](https://github.com/portfolio-author/jia-jian-log/commit/537cb25fe6d289393e5287e6c0b8ac47aa1f11e1))
* Keep Mengni in compact pet menu ([ff29386](https://github.com/portfolio-author/jia-jian-log/commit/ff293862a3f5fa23b77c872c970b959e5407f3d2))
* Keep pet removal available during list errors ([a5848e2](https://github.com/portfolio-author/jia-jian-log/commit/a5848e2bcfc26367385757a0cbfb0065a82d5866))
* keep Qwen as local review fallback ([57f5f8a](https://github.com/portfolio-author/jia-jian-log/commit/57f5f8a94058f57d5e434c4b7d67fb31a8124d5c))
* Keep test accounts personal ([d82d4d0](https://github.com/portfolio-author/jia-jian-log/commit/d82d4d0207646b61dfabd9e21ce57bfefa577aac))
* localize PWA update prompt ([5133a4a](https://github.com/portfolio-author/jia-jian-log/commit/5133a4a6c86f30f87425351fb06b4e89f7c3d5d0))
* Localize release note items ([85d4e2a](https://github.com/portfolio-author/jia-jian-log/commit/85d4e2a9aca77eb5773fa62a8aabb2dc411b2a87))
* make Google sign-in button responsive to prevent mobile layout breaking ([9457a0a](https://github.com/portfolio-author/jia-jian-log/commit/9457a0aacf8d3793e46916e4c204f57943384a5c))
* Make installed PWA updates user-safe ([475292c](https://github.com/portfolio-author/jia-jian-log/commit/475292cc58d3eaec284480dd07a251a54702a6c6))
* Make nutrition migration restartable ([ae9e99d](https://github.com/portfolio-author/jia-jian-log/commit/ae9e99d1656a3479cba15869dfa7fb012095ec08))
* Make nutrition RLS rerunnable ([3085da3](https://github.com/portfolio-author/jia-jian-log/commit/3085da3bfd5646ad7602d01ad35dfc2fb2935f80))
* make staging promotion manual ([cfeaf4c](https://github.com/portfolio-author/jia-jian-log/commit/cfeaf4c7ca65d65cf9065e529ea7221057999386))
* make staging promotion manual ([eca9474](https://github.com/portfolio-author/jia-jian-log/commit/eca9474fc927e0d0627d5e6a7884a8f3482e128d))
* Make staging promotion target explicit ([6a13580](https://github.com/portfolio-author/jia-jian-log/commit/6a13580b1a91a7b25dd55e85511d8e83e7d09c8e))
* Make staging promotion target explicit\n\nEnsure GitHub Actions gh commands work without a checked-out repository by passing the repository explicitly. This prevents promotion workflow failures caused by missing .git metadata. ([b5fd4ed](https://github.com/portfolio-author/jia-jian-log/commit/b5fd4ed123deb1fdb4261b53db7eded91de5053d))
* make Telegram blood pressure notifications reliable ([d88417d](https://github.com/portfolio-author/jia-jian-log/commit/d88417dfda6629cda0a643de4edfbf7c944330c9))
* make Telegram blood pressure notifications reliable ([c157c17](https://github.com/portfolio-author/jia-jian-log/commit/c157c17cdccc71213d012f1287c2662ac36f24ea))
* **migration:** backfill legacy personal medication plans ([2a06988](https://github.com/portfolio-author/jia-jian-log/commit/2a06988127c781a8d8307d6d109e2f49777312a7))
* **migration:** replay test-account access safely ([3fbca3e](https://github.com/portfolio-author/jia-jian-log/commit/3fbca3ea8fe9c040764d6a8feb901a3a350f3500))
* **migration:** respect profile dependency for care access ([9b3dc87](https://github.com/portfolio-author/jia-jian-log/commit/9b3dc87fc81009e0a3ec550451aaf34a5ff29f93))
* **migration:** seed confirmed supplement plan owner ([006ef07](https://github.com/portfolio-author/jia-jian-log/commit/006ef07a05184ad819499ecdfa82b223f30077d0))
* Move release version to settings ([fad5321](https://github.com/portfolio-author/jia-jian-log/commit/fad5321fdf4f4770c0579f9d110b7e7db6b20d41))
* normalize OAuth redirectTo trailing slash for Supabase allowlist ([95182b8](https://github.com/portfolio-author/jia-jian-log/commit/95182b8bfd1dd893d71e0b802b4d011856c21833))
* normalize OAuth redirectTo trailing slash for Supabase allowlist ([911b34f](https://github.com/portfolio-author/jia-jian-log/commit/911b34fb72573113cfb92d58910436c126c606b2))
* open Google login outside LINE WebView ([0da5b71](https://github.com/portfolio-author/jia-jian-log/commit/0da5b71bd7d73b7dc5b7f624dda2295cb67a68f9))
* open Google login outside LINE WebView ([9312132](https://github.com/portfolio-author/jia-jian-log/commit/9312132439dcb95fd029b9a89cfa5bf00a9f7545))
* pass GitHub token to manual improve CLI ([af07128](https://github.com/portfolio-author/jia-jian-log/commit/af0712823aa4066005fa190f059439a6ff0e6eac))
* Persist demo medication schedule edits ([511e806](https://github.com/portfolio-author/jia-jian-log/commit/511e806a8801c4306b3c1bf4ac844ddb325a7b65))
* personalize blood pressure Telegram headings ([50146f0](https://github.com/portfolio-author/jia-jian-log/commit/50146f0a6b37459c9e2b318584a17ef3c6e789e5))
* personalize blood pressure Telegram headings ([0ecad7a](https://github.com/portfolio-author/jia-jian-log/commit/0ecad7a441a11fa654ed0093a9a739ff1d5cac68))
* Polish mobile care UI ([de612d5](https://github.com/portfolio-author/jia-jian-log/commit/de612d58f66af59f3bb63d6d4636c9bc7740a842))
* Polish mobile care UI ([b936df7](https://github.com/portfolio-author/jia-jian-log/commit/b936df717733af17348b73aa07979843eca71513))
* prefer Supabase publishable key ([a805e61](https://github.com/portfolio-author/jia-jian-log/commit/a805e61d0c1c267446570b9254c22a0111812953))
* prefer Supabase publishable key ([d75fd8f](https://github.com/portfolio-author/jia-jian-log/commit/d75fd8f676c5fb88e248889611daa57b238723d2))
* Preserve care tabs when adding pets ([cd20c59](https://github.com/portfolio-author/jia-jian-log/commit/cd20c597bd9ef9726109c1a71e1a60854e1167fa))
* preserve invitation safety during review flow ([a7433d5](https://github.com/portfolio-author/jia-jian-log/commit/a7433d5cbe35b047a914680cddd50e30e43b6c5d))
* Preserve remote migration history ([534d157](https://github.com/portfolio-author/jia-jian-log/commit/534d15756cdb90480deb07434bdb0116e1ba5b73))
* prevent ambiguous Telegram notification retries ([49de833](https://github.com/portfolio-author/jia-jian-log/commit/49de83304904a6925f5e85c1a48712fc4e90751e))
* prevent stale feature deployments from reaching staging ([f6fbfa1](https://github.com/portfolio-author/jia-jian-log/commit/f6fbfa10a2b2ed609b0bc18b29252e8425e38e3f))
* publish readable bilingual release notes ([7c0f2f7](https://github.com/portfolio-author/jia-jian-log/commit/7c0f2f7c0a10c888e11b1da10fc35a861030d5d1))
* read raw changelog in promotion gate ([4951e03](https://github.com/portfolio-author/jia-jian-log/commit/4951e0318f727d1adc873363aebf0922defd3bbb))
* read raw changelog in promotion gate ([df6674c](https://github.com/portfolio-author/jia-jian-log/commit/df6674c66a7ce8002d65228bdc3011a1c4cb9dde))
* Record caregiver medication doses ([3637788](https://github.com/portfolio-author/jia-jian-log/commit/363778805138aa4a867528313c72bbfc511a2b26))
* record migration status for every staging snapshot ([1964b9f](https://github.com/portfolio-author/jia-jian-log/commit/1964b9f5e5e550798a2b9d26ff180f21a29a4791))
* Redirect retired Vercel hostname ([872e19e](https://github.com/portfolio-author/jia-jian-log/commit/872e19e7ee2ba3bd3b92be1fdd5dfe008f0b6597))
* Redirect retired Vercel hostname ([8e3420b](https://github.com/portfolio-author/jia-jian-log/commit/8e3420b1a747d6fa2aec304cb77734630012c465))
* Refine cat icon from Xiao Guai reference ([99a4a19](https://github.com/portfolio-author/jia-jian-log/commit/99a4a1910690de079c1aaea2ad7d61b33d3ab6b2))
* Reject ambiguous legacy weight matches ([849e7bb](https://github.com/portfolio-author/jia-jian-log/commit/849e7bb027cf0fd0b6e300f88d256c2baf8af9dd))
* remove dropped subject column from readMedicationHistory query ([2856f6d](https://github.com/portfolio-author/jia-jian-log/commit/2856f6d5688a301abe93c1bd3f87dd1d9e237ad0))
* repair legacy weight migration dependency ([6b4d9ff](https://github.com/portfolio-author/jia-jian-log/commit/6b4d9ff8ee53e2970218b85d16dd0ffc832b04ea))
* repair legacy weight migration dependency ([6b4d9ff](https://github.com/portfolio-author/jia-jian-log/commit/6b4d9ff8ee53e2970218b85d16dd0ffc832b04ea))
* repair legacy weight migration dependency ([c9226e9](https://github.com/portfolio-author/jia-jian-log/commit/c9226e9e51ed0d4b380db982bfa966ebf7688c5c))
* repair migration gate shell syntax ([e926864](https://github.com/portfolio-author/jia-jian-log/commit/e926864b65fc239cf56ea8a01b1a778acc5cf46c))
* Repair pet removal RPC access ([0fa5e2c](https://github.com/portfolio-author/jia-jian-log/commit/0fa5e2c20a8d3cd15ac2d3f482b61a36c91113ca))
* Replace String.prototype.replaceAll with regex replace in MedicationAdminSection for TypeScript build compatibility ([5712f28](https://github.com/portfolio-author/jia-jian-log/commit/5712f2869db486be9a5554de94b87ecc46439ce7))
* replace tilted emoji heart with centered SVG icon ([8f7d432](https://github.com/portfolio-author/jia-jian-log/commit/8f7d432ebaf9c89c6b0eaa4b0f0924df4d621bb9))
* Require explicit patient access ([32432e7](https://github.com/portfolio-author/jia-jian-log/commit/32432e7c70446bbe87e6e866f721f36bdc4da7df))
* require release notes before promotion ([0c05973](https://github.com/portfolio-author/jia-jian-log/commit/0c0597345a5e587b95b6f165217c7e7df864bc76))
* resolve merge conflicts with main ([ddcdfdf](https://github.com/portfolio-author/jia-jian-log/commit/ddcdfdf10a3ecbea5eff461c0f0a7e0ae7c3439a))
* Resolve PR [#182](https://github.com/portfolio-author/jia-jian-log/issues/182) staging conflicts ([4787c39](https://github.com/portfolio-author/jia-jian-log/commit/4787c394397c925564ad3317db67243531193efb))
* Resolve PR [#224](https://github.com/portfolio-author/jia-jian-log/issues/224) staging conflicts ([1a326bf](https://github.com/portfolio-author/jia-jian-log/commit/1a326bf963f12a80bffa5db325049f078ad230b2))
* Resolve PR 234 staging conflicts ([d5a7aa8](https://github.com/portfolio-author/jia-jian-log/commit/d5a7aa897d4a384d41917fc061dd0dff7c66c52c))
* resolve pre-launch build errors, bilingual compliance and file headers ([f91691f](https://github.com/portfolio-author/jia-jian-log/commit/f91691f561b844f6fa0923efb9e45c335626c909))
* resolve reviewer feedback for static imports, unused vars, and local file fallback ([4fcc2d2](https://github.com/portfolio-author/jia-jian-log/commit/4fcc2d2a4bfbaf666589524b181b3dba48511435))
* resolve staging conflicts for body temperature ([f48e164](https://github.com/portfolio-author/jia-jian-log/commit/f48e1646eb3f0bad6a0ecf0bc11a7ea4b5deb582))
* Resolve weight PR conflicts ([690473c](https://github.com/portfolio-author/jia-jian-log/commit/690473cd0fd703f4b473a61ff052db5adb3b433d))
* Restore core household memberships ([4aeb086](https://github.com/portfolio-author/jia-jian-log/commit/4aeb0863194fe903d4bc5f159e92c987834ba5dd))
* Restore core household memberships ([fa118cb](https://github.com/portfolio-author/jia-jian-log/commit/fa118cb602cf6bb6105e86d863893c71f555fb22))
* Restore locale-specific interface copy ([760b854](https://github.com/portfolio-author/jia-jian-log/commit/760b8546ca5104bb8230c7bbfe224fc0d41694b8))
* Restore medication focus after cancellation ([8830b1b](https://github.com/portfolio-author/jia-jian-log/commit/8830b1be23d1e201adf5dfb7bc0c59f582d741e1))
* Restore mother medication ownership ([00fea08](https://github.com/portfolio-author/jia-jian-log/commit/00fea08624312d5e97b901864214dc9a031190f0))
* Restore viewer household membership ([2fb50f3](https://github.com/portfolio-author/jia-jian-log/commit/2fb50f3203eff95ee90af9cb881c4be6a0124cab))
* Restrict OAuth test account access ([7fdb84c](https://github.com/portfolio-author/jia-jian-log/commit/7fdb84c98342b2286c5b59327e5291d26a76f644))
* **review:** address review feedback on alt text localization and smoke test console error filter ([5c5e610](https://github.com/portfolio-author/jia-jian-log/commit/5c5e6108b5380ecd44b8b92cdf99e3cea616d89c))
* sanitize genericName in manual add flow and sync test stats in TECHNICAL.md ([be2b349](https://github.com/portfolio-author/jia-jian-log/commit/be2b3491559ca4447e2df2bd1e61c5c43d1a2a20))
* Scope daily weight measurements to patients ([bef336a](https://github.com/portfolio-author/jia-jian-log/commit/bef336afc0caed9090d5b587cdaf7ffb396025ed))
* Scope medication plans by patient ([19fed2c](https://github.com/portfolio-author/jia-jian-log/commit/19fed2caadcf18fb07ca921f9932c4d3ac7111db))
* seed core profiles for staging demo login ([7b85e26](https://github.com/portfolio-author/jia-jian-log/commit/7b85e26e83e852cd00c5091c9c4a19e3f3d93c34))
* Separate medication-plan authorization ([2ffb436](https://github.com/portfolio-author/jia-jian-log/commit/2ffb436e739c94458a9368b549be12d6e8e5d8cc))
* Shorten mobile tab labels ([0cc555a](https://github.com/portfolio-author/jia-jian-log/commit/0cc555a6326f1e46ae72f1cf5f561f620eaf8db4))
* Show live clock on blood pressure input ([f8d288c](https://github.com/portfolio-author/jia-jian-log/commit/f8d288c7e196db892f6baf7d03074d0f52dae7a0))
* Show live clock on blood pressure input ([86c7769](https://github.com/portfolio-author/jia-jian-log/commit/86c776947973d6b5acb295490b461755dc914448))
* Show one WebView warning language ([#159](https://github.com/portfolio-author/jia-jian-log/issues/159)) ([f242d2d](https://github.com/portfolio-author/jia-jian-log/commit/f242d2d947441cb256c8891de5b171335007afbe))
* Show patient names in care switcher ([221c20a](https://github.com/portfolio-author/jia-jian-log/commit/221c20aba1287c845b449518e40c4d3ddc80de52))
* Show weight history in daily care ([d1f9027](https://github.com/portfolio-author/jia-jian-log/commit/d1f90274e7513f107e9eacc3f90fd101413df04f))
* simplify migration gate shell query ([19e5fce](https://github.com/portfolio-author/jia-jian-log/commit/19e5fceb5830ae9d4743edc28517983920cd61ce))
* Slim orange cat silhouette ([6993954](https://github.com/portfolio-author/jia-jian-log/commit/699395439877e44cadd6b43367d7bf75e3c36c58))
* speed up blood-pressure save feedback ([3ae3eaa](https://github.com/portfolio-author/jia-jian-log/commit/3ae3eaa0b4583ed6bb9b384271d81ead8d2c9846))
* speed up blood-pressure save feedback ([6567142](https://github.com/portfolio-author/jia-jian-log/commit/656714230adcd7e825c684e2a0d3de027cd1d172))
* Stabilize pet setup and timeline refresh ([5fe4490](https://github.com/portfolio-author/jia-jian-log/commit/5fe4490913480a7d05127e68d2971b30c8a03586))
* stabilize PR [#167](https://github.com/portfolio-author/jia-jian-log/issues/167) demo fallback paths ([9a3c884](https://github.com/portfolio-author/jia-jian-log/commit/9a3c884670c735810b6f6d5a1f510629d1af93b3))
* **staging:** authorize core care accounts in staging seed data ([414af83](https://github.com/portfolio-author/jia-jian-log/commit/414af83d1e131bef1e5de9d54057e0ba0581d78a))
* Strengthen daily limit advisory locks ([f2318b9](https://github.com/portfolio-author/jia-jian-log/commit/f2318b9da562dade3f6cfb59bd1dcd8077f1139c))
* **supabase:** replace invalid storage-api tag in tracked temp config ([9e0747d](https://github.com/portfolio-author/jia-jian-log/commit/9e0747df8447016ca3849c05e3a47be48c185a9a))
* tolerate wrapped changelog API content ([72e74a8](https://github.com/portfolio-author/jia-jian-log/commit/72e74a8a9b92ccbb32283f8e5dbdc62d0008f459))
* update contact me link to personal website https://portfolio-author.git… ([7781983](https://github.com/portfolio-author/jia-jian-log/commit/77819839070b9af94fcabedf34a3db7e8a76c4ba))
* update contact me link to personal website https://portfolio-author.github.io/ ([de18ff9](https://github.com/portfolio-author/jia-jian-log/commit/de18ff975a6716a3db42e2c3e0a59bb895db39cb))
* update PM2 process name to jiajianlog ([#166](https://github.com/portfolio-author/jia-jian-log/issues/166)) ([7a6aec2](https://github.com/portfolio-author/jia-jian-log/commit/7a6aec297000e9a9a58830f2ebae9f49eccb5447))
* update vercel redirect error ([4c11b4c](https://github.com/portfolio-author/jia-jian-log/commit/4c11b4cbd5695c5f44c3a60c4e2aa53125931124))
* update vercel redirect error ([3b2243c](https://github.com/portfolio-author/jia-jian-log/commit/3b2243c496f8699dbf1ee5e6134d20ed334e7789))
* use 8k Devstral on 24GB Mac mini ([cfb5609](https://github.com/portfolio-author/jia-jian-log/commit/cfb5609980c0df6ef3c914ec3800fd4c73922aa4))
* use 8k Devstral on 24GB Mac mini ([8090db2](https://github.com/portfolio-author/jia-jian-log/commit/8090db236c0be09bdbd4aa3a356ff4ad04c0411d))
* Use a unique patient invitation migration version ([1339f68](https://github.com/portfolio-author/jia-jian-log/commit/1339f68ca90c0e5bb74065dd3e060aa59d77cdf5))
* use actions token for migration gate ([d7b9788](https://github.com/portfolio-author/jia-jian-log/commit/d7b97883d3680f6e852b120f15e8bce17fe8cead))
* use patient UUID as blood pressure boundary ([44908f5](https://github.com/portfolio-author/jia-jian-log/commit/44908f5bddead6687808128ee8c2c13402142c73))
* Use the actual production Vercel URL\n\nUpdate the release policy, repository guidance, setup documentation, and checklist to identify demo.careapp.local as production. Keep bp.portfolio-author.xyz only where it describes local or legacy tunnel configuration. ([df6bbe4](https://github.com/portfolio-author/jia-jian-log/commit/df6bbe43809c3629fc9c7142dee0ef93fc439ea3))
* Use unique nutrition migration timestamp ([bc4c7c6](https://github.com/portfolio-author/jia-jian-log/commit/bc4c7c6628f14f2c2eee41537d0b60ee5c7975d3))
* Use unique PRN migration version ([7a690fa](https://github.com/portfolio-author/jia-jian-log/commit/7a690fa5098adb50976392617c4493110fc3299b))
* validate the installed 8k Devstral model ([730915b](https://github.com/portfolio-author/jia-jian-log/commit/730915b0b1735b97720eec80f23f8811a8f60b52))
* validate the installed 8k Devstral model ([255c517](https://github.com/portfolio-author/jia-jian-log/commit/255c5171c57433c08c7bb6ea330d4f8a93a75afe))
* **vercel:** support explicit target branch parameter in build filter script ([30f968c](https://github.com/portfolio-author/jia-jian-log/commit/30f968c495608f8bc3bd5b2e99e80daae91e92b2))
* **vercel:** support explicit target branch parameter in build filter… ([ae67f4a](https://github.com/portfolio-author/jia-jian-log/commit/ae67f4ad126069c7664247a266867b3d8043aa7c))
* Wrap species tags and license labels in text() for bilingual compliance ([050cf42](https://github.com/portfolio-author/jia-jian-log/commit/050cf420bdb5b54cd93d47fcb73a4a2e276b0799))
* 修正每日服藥預設展開模式 ([0f6e0a5](https://github.com/portfolio-author/jia-jian-log/commit/0f6e0a5ca9ac7803473d311fbe90ad3bcf1dbdfc))
* 修正每日服藥預設展開模式 ([9d6c878](https://github.com/portfolio-author/jia-jian-log/commit/9d6c878ec21991faaa52a03ce471fab23c3648a3))
* 徹底清理服務條款與隱私權等頁面之雙語 i18n 隔離 ([bc83e5a](https://github.com/portfolio-author/jia-jian-log/commit/bc83e5aec2d015c350ea6822d18375e741e30c86))


### Performance Improvements

* reuse versioned PR-Agent virtualenv ([beaf9a2](https://github.com/portfolio-author/jia-jian-log/commit/beaf9a21ba59c2b5c9dd555649f65385b8f5e1b0))


### Reverts

* require at least 2 characters for TCM search while retaining explicit RPC grants ([5674715](https://github.com/portfolio-author/jia-jian-log/commit/567471503e1aa3a7ac3bfe4429815500875dee86))

## [1.1.2](https://github.com/portfolio-author/jia-jian-log/releases/tag/jia-jian-log-v1.1.2) (2026-08-14)

### Bug Fixes

- Shared care preferences now preserve caregiver write access for the authorized patient. <!-- id: Preferensi perawatan bersama kini mempertahankan akses tulis pengasuh untuk pasien yang berwenang. | zh: 共用照護偏好現在會保留已授權病人的照護者寫入權限。 -->
- Staging promotion is now manually triggered and validates the exact tested snapshot before production promotion. <!-- id: Promosi staging kini dijalankan secara manual dan memvalidasi snapshot yang telah diuji sebelum promosi produksi. | zh: staging promotion 現在改為手動觸發，並會在正式發布前驗證確切測試過的版本快照。 -->
- Removed the unnecessary Release Please timeout configuration after confirming the observed run had completed normally. <!-- id: Konfigurasi batas waktu Release Please yang tidak diperlukan dihapus setelah memastikan proses yang diamati selesai normal. | zh: 確認觀察到的執行其實正常完成後，移除不必要的 Release Please timeout 設定。 -->

## [1.1.1](https://github.com/portfolio-author/jia-jian-log/releases/tag/jia-jian-log-v1.1.1) (2026-08-13)

### Features

- Daily care modules can be customized per patient, so each caregiver sees the tools that matter for the selected person. <!-- id: Modul perawatan harian dapat disesuaikan untuk setiap pasien, sehingga pengasuh melihat alat yang sesuai untuk orang yang dipilih. | zh: 每位病人的每日照護功能都能個別設定，照護者只會看到目前對象需要的工具。 -->
- Track body temperature, weight, medication changes, PRN medication events, and care-event photos in the care timeline. <!-- id: Catat suhu tubuh, berat badan, perubahan obat, kejadian obat PRN, dan foto kejadian perawatan di linimasa. | zh: 照護時間線現在可記錄體溫、體重、藥單變更、需要時用藥事件與照護照片。 -->
- Patient-scoped health records keep readings and care settings separated when switching between people. <!-- id: Data kesehatan dan pengaturan perawatan dipisahkan berdasarkan pasien saat berpindah orang. | zh: 切換照護對象時，健康紀錄與照護設定會依病人分開，避免資料混用。 -->

### Bug Fixes

- Improved medication history and daily-care behavior around care dates, plan changes, and completed doses. <!-- id: Memperbaiki riwayat obat dan perawatan harian berdasarkan tanggal perawatan, perubahan rencana, dan dosis yang sudah diminum. | zh: 修正服藥歷史、照護日、藥單調整與已完成劑量的顯示與紀錄。 -->
- Fixed mobile input, bilingual labels, vital-sign colors, and Google login behavior in embedded browsers. <!-- id: Memperbaiki input seluler, label bilingual, warna tanda vital, dan login Google di browser tertanam. | zh: 改善手機輸入、雙語標籤、生理數值顏色，以及內嵌瀏覽器中的 Google 登入。 -->
- Restored core caregiver access and strengthened patient-level authorization for health data. <!-- id: Memulihkan akses pengasuh inti dan memperkuat otorisasi data kesehatan berdasarkan pasien. | zh: 恢復核心照護帳號權限，並強化健康資料的病人級授權。 -->

### Reliability and Operations

- Production releases now carry build version and date information, with safer PWA updates and more reliable blood-pressure notifications. <!-- id: Rilis produksi kini membawa informasi versi dan tanggal build, pembaruan PWA yang lebih aman, serta notifikasi tekanan darah yang lebih andal. | zh: 正式版本現在會顯示建置版本與日期，PWA 更新更安全，血壓通知也更可靠。 -->
- Release notes are kept in this file so the app can show a readable bilingual history without requiring a login. <!-- id: Catatan rilis disimpan di berkas ini agar aplikasi dapat menampilkan riwayat bilingual tanpa login. | zh: 版本說明集中在這個檔案，App 不需登入也能顯示雙語版本歷史。 -->

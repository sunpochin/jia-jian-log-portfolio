/*
檔案用途：透過 bunfig.toml 的 [test] preload 在任何測試檔案開始 import 之前安裝 react hook mock。
所在層：tests/unit/helpers 測試支援層；只在測試程序內執行，不影響正式程式碼。
為什麼需要這個檔案：bun 的 mock.module('react', ...) 是整個測試程序共用、非逐檔案生效的（見 issue #608）。
先前做法是讓各測試檔自己在頂層呼叫 installReactHookHarness()，於是「mock 何時真正生效」取決於
bun test 挑選到的第一個呼叫它的檔案，順序一變（例如公開版 repo 只跑較小的檔案子集）就可能讓某些
模組在 mock 生效前就先被 import、綁死到未被替換的原生 react 匯出，產生假失敗。preload 保證這支
檔案永遠在所有測試檔的 import 圖被解析之前執行，讓安裝時機不再依賴檔案執行順序。
*/
import { installReactHookHarness } from './reactHookHarness'

installReactHookHarness()

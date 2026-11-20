# 操作截圖說明

以下圖片由 Playwright 在實際瀏覽器中擷取。01 至 05 與 07 來自本機工作台；06 來自公開展示網址。截圖使用 1600 × 900 的瀏覽器視窗，06 另保留完整頁面高度。各次驗收使用獨立的瀏覽器儲存空間。

| 截圖 | 操作與驗證 |
| --- | --- |
| [01　Gemini 執行摘要](evidence/screenshots/01_gemini_execution.png) | 開啟實測紀錄頁，從這次 API 的執行檔讀出模型版本、臺北時間、三筆案例與 HTTP 200。一次批次請求耗時 2.928 秒。 |
| [02　原始需求與模型輸出](evidence/screenshots/02_input_and_output.png) | 左欄列出送測的合成需求，右欄直接讀取 API 回應中的模型文字。完整內容可捲動查看或開啟 JSON。 |
| [03　草稿審閱與缺件提醒](evidence/screenshots/03_draft_review.png) | 選擇管理部並清空負責人欄位。「待補必填欄位」標出負責人，確認按鈕停用。 |
| [04　重新整理後的任務](evidence/screenshots/04_saved_task.png) | 管理部補上測試同仁 A，三案確認後分別設定狀態。重新整理後，負責人與三筆任務的追蹤狀態仍保留。 |
| [05　瀏覽器驗收結果](evidence/screenshots/05_test_results.png) | 在工作台開啟由驗收程式實際寫出的報告。八項檢查逐列顯示結果，包括下載 JSON 比對及原始證據保留。 |
| [06　線上成品](evidence/screenshots/06_published_site.png) | 在新的瀏覽器工作階段實際載入 GitHub Pages，確認三筆草稿及初始統計。網址與發布版本另存於部署紀錄。 |
| [07　交叉篩選與下載](evidence/screenshots/07_filtered_tasks.png) | 同時套用管理部與進行中條件，只顯示案例 A。測試程式另行解析該次下載的單筆 JSON。 |

[公開展示網址](https://zhang01127.github.io/ai-request-workbench-demo/) · [部署紀錄](evidence/deployment.json) · [公開站驗收紀錄](evidence/published-browser.json)

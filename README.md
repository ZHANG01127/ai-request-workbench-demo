# 部門 AI 需求整理工作台

課後延伸實作。三個部門各提出一筆合成需求，Gemini 在本機整理八個欄位。開啟工作台後，可對照原文、補資料、確認任務，並追蹤工作進度。

[開啟工作台](https://zhang01127.github.io/ai-request-workbench-demo/) · [GitHub 儲存庫](https://github.com/ZHANG01127/ai-request-workbench-demo) · [下載完整專案 ZIP](https://github.com/ZHANG01127/ai-request-workbench-demo/archive/refs/heads/main.zip) · [課後實作成果](課後實作成果.md) · [截圖說明](screenshot_captions.md)

## 從管理部案例開始

1. 在「草稿審閱」選擇管理部。原文沒有指定負責人，模型將負責人留白，並把它列入缺少的資訊。
2. 填寫「測試同仁 A」。展開「問題、建議步驟與待確認事項」，核對描述，從缺少的資訊中移除已補的項目。部門、任務名稱、原始問題、預期產出與負責人皆為必填，純空白也無法確認。
3. 按「確認並加入任務」。新任務的追蹤狀態為「待確認」，可改成「進行中」或「已完成」。點任務名稱可再次編輯，按「儲存任務修改」後生效。
4. 在「任務追蹤」使用部門及狀態篩選。「匯出 JSON」下載當下符合條件的任務；每筆包含八個欄位、原始需求、狀態及模型回應識別碼。
5. 「實測紀錄」可核對本次模型、請求本文、原始回應、解析資料及本機瀏覽器的驗收結果。

## 本機啟動

在專案目錄執行以下指令，用瀏覽器開啟終端機顯示的連接埠。前端使用 HTML、CSS 與原生 JavaScript，啟動及操作皆無需金鑰。

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory docs
```

## Gemini 實測

2026 年 11 月 20 日於 Google AI Studio 核對專案為 Free tier，並核對指定模型的標準文字輸入與輸出適用免費層。本機以官方 REST API 呼叫一次 `gemini-3.1-flash-lite`，三筆合成需求同批送出。HTTP 200，耗時 2.928 秒。三案均通過欄位與指派檢查。人工仍須確認問題描述中的推論，可以直接改寫。

- [三筆合成輸入](docs/evidence/gemini/inputs.json) 與 [含提示及結構規格的完整請求](docs/evidence/gemini/attempt-01/request.json)
- [原始 API 回應](docs/evidence/gemini/attempt-01/response.json)、[解析後草稿](docs/evidence/gemini/attempt-01/parsed.json)、[時間、模型及 token 紀錄](docs/evidence/gemini/attempt-01/execution.json)
- [人工修改後的任務匯出樣本](evidence/exported-tasks.json)
- [Google 官方價格](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.1-flash-lite) 與 [計費層級說明](https://ai.google.dev/gemini-api/docs/billing)

生成程式為 `scripts/run_gemini.py`，採 Python 標準函式庫。只接受本機環境變數 `GEMINI_API_KEY` 或忽略檔 `.private/gemini-key`；須先確認該金鑰所屬專案為免費層，再於 `.private/free-tier-confirmed` 留下確認紀錄。每次執行最多送出一次，保留每次嘗試的獨立檔案，整次驗證上限五次。已有成功結果時會直接結束。請保留原始證據。

## 重跑瀏覽器驗收

驗收以隔離的瀏覽器操作公開頁面或本機頁面，會重新產生對應的測試紀錄與截圖。先啟動本機服務，另開終端機執行以下指令。

```sh
python3 -m venv .venv
.venv/bin/python -m pip install playwright==1.60.0
.venv/bin/playwright install chromium
.venv/bin/python tests/browser_acceptance.py http://127.0.0.1:8000
.venv/bin/python tests/browser_acceptance.py https://zhang01127.github.io/ai-request-workbench-demo/ --published
```

亦可用 `BROWSER_BIN` 指向既有 Chromium 相容瀏覽器。測試直接讀取實際下載的 JSON，逐欄比對操作時讀出的欄位與清單可見的順序。本機與發布版各有獨立紀錄。

[本機驗收](docs/evidence/browser.json) · [線上驗收](evidence/published-browser.json) · [部署紀錄](evidence/deployment.json)

## 展示範圍

工作台讀取已完成的模型結果。人工修改留在目前瀏覽器的 localStorage；清除網站資料會清除修改，匯出可保留當下版本。首次開啟可從三筆未審草稿開始操作。展示範圍限於合成案例、單一瀏覽器與靜態發布，多人同步、登入權限、雲端資料庫及正式事件稽核尚未納入。

`main` 保留程式及證據，`gh-pages` 的根目錄為已發布的網站內容，對應 `main` 的 `docs/`。網站只使用相對路徑。

教材採用了先寫專案摘要、客製前端、在本機操作驗證與保留成果畫面的做法。[課程教材](https://storage.googleapis.com/bwg-track3-demo-guide/VM-Manual/index.html#customize-your-frontend)

# 網頁版 V0.3

網址：<https://retaining-wall-analysis.davida02617.chatgpt.site>。

網站預設僅擁有者可使用，需以建立網站的 ChatGPT 帳號登入。GitHub 原始碼倉庫維持原本公開設定。

## 內容與操作

- 依參考截圖的藍灰色介面重建，手機為垂直表單，桌面採輸入與圖面並排。
- R1、R2、R3 示範斷面；可新增擋土牆，修改名稱、尺寸、土壤及地震係數。
- 參數修改後重新計算；無效或不支援輸入清除舊結果。
- 頂部顯示常時／地震摘要，下方列出偏心、接觸壓力及承載力完整判定。
- 成果報告书可在頁內預覽，包含輸入、斷面、重量、力矩、公式、假設及判定。列印時可另存 PDF。
- 「保存專案」使用 localStorage；匯出／匯入 JSON 與 Python 版專案格式相容。不同網站、裝置或瀏覽器的保存資料不自動同步。
- 計算完全在瀏覽器完成，沒有把專案數值傳送到計算 API。

## 原始碼

`browser/index.html`、`style.css`、`app.mjs` 為介面；`engine.mjs` 為瀏覽器計算核心；`model-data.mjs` 固定模型版本、預設及假設。

`retaining_wall/core.py` 仍是 Python 參考核心。既有 Python 程式、API、UI 檔案均保留。

本機驗證可執行 `python -m http.server 8080 --directory browser`，開啟 <http://localhost:8080>。ES Modules 需經 HTTP 提供；請勿直接雙擊 HTML。

## 驗證

- 30 項 unittest 通過。
- 新增 129 組 Python／JavaScript 數值比對：所有輸出欄位及狀態，容差為 1e-10；含 120 組固定種子隨機案例、預設、地震無解、失穩及缺值。
- 28 組拒絕輸入的错误訊息一致。
- Node 語法檢查通過。
- 本執行環境沒有可用的受支援瀏覽器驗證工具，未完成視覺／實際點選／PDF 分頁驗證。

## 模型限制

計算模型與網頁版均為 V0.3。法規差異與修正見 [TAIWAN-REGULATIONS.md](TAIWAN-REGULATIONS.md)。限制與 [CALCULATION.md](CALCULATION.md) 一致：乾燥均質無凝聚土、水平填土、垂直光滑虛擬牆背。不支援水壓、揚壓、多層土、RC、沉陷及整體邊坡穩定。缺少承載力數據或依據顯示待確認，RC 永遠待確認。

如未來調整計算模型，須同步更新 Python／JavaScript 並執行比對；不能只改前端顯示數字。

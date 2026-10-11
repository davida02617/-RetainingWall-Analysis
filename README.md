# 擋土牆分析檢核 · RetainingWall Analysis

Python 3.11+ 計算核心與繁體中文網頁介面，重建參考截圖的斷面切換、尺寸輸入及檢核操作。V0.1 為可執行的工程分析開發版，未完成完整擋土牆設計驗證。

## 直接使用網頁版（V0.2）

開啟 <https://retaining-wall-analysis.davida02617.chatgpt.site>，不需要安裝 Python。
目前網站僅專案擁有者可存取，使用建立網站的 ChatGPT 帳號登入。

網頁版原始碼位於 `browser/`，支援電腦與手機、R1/R2/R3、多斷面新增、計算書預覽與列印、保存／匯入／匯出。計算在瀏覽器執行，專案資料保存在目前瀏覽器，不會跨裝置同步。原有 Python 本機版本保留。

分析模型維持 V0.1 的乾土假設與範圍；17 項測試包含 129 組 Python／JavaScript 數值比對及 21 組無效輸入比對。數值比對不等同獨立工程認證。

詳見 [網頁版說明](docs/WEB.md)。

## 立即啟動（DH91 / Windows）

1. 解壓縮專案，建議放在 `D:\Projects\RetainingWall-Analysis`。
2. 安裝 Python 3.11 以上。此版無第三方執行依賴。
3. 雙擊 `start_windows.bat`，或在專案根目錄執行：

```powershell
python -m retaining_wall.server
```

4. 開啟 <http://127.0.0.1:8788>。關閉終端機即停止服務。

若電腦只有 Python Launcher，使用 `py -3 -m retaining_wall.server`。切勿直接雙擊 HTML：計算需要 Python API。

## 已實作

- R1 / R2 懸臂、R3 重力式示範斷面；新增及切換斷面。
- 牆體採背面垂直、前面可變厚的梯形；依實際幾何積分重心。
- 常時 Rankine；地震限制版 Mononobe–Okabe，包含牆體／踵上土慣性與 ±kv 個別結果。
- 傾覆、滑動、偏心距、全接觸／部分接觸基底壓力。
- 使用者提供 qa 的壓力比較，以及 qult/qmax 的承載安全係數，分別呈現。
- 斷面 SVG、逐項公式、重量重心、力矩及完整 JSON 計算資料。
- 本機瀏覽器保存／重開、JSON 匯入匯出、複製摘要、目前單一斷面的列印／另存 PDF。
- 手機響應式 CSS；GitHub Actions Python 3.11–3.14 測試；Docker 本機部署設定。

預設值是示範，僅 R2 可見的 H=2.8 m、底版=0.5 m、趾=0.5 m、踵=1.7 m 取自截圖。其他尺寸及土壤值為假設，R1/R3 尺寸亦為示範。未取得 Claude 原始碼，不能保證與其數值相同。

## 工程模型與範圍

詳見 [計算模型](docs/CALCULATION.md)。

**只接受乾燥、均質、無凝聚力、水平背填、垂直光滑虛擬牆背、均佈載重。** 有地下水、坡度、凝聚力或牆背摩擦時 API 明確拒絕，不能將零值預設當成現地確認。

承載力需輸入同基底與載重條件之 **gross qa / qult** 及資料來源。兩個值不互相推導，地震不自動提高容許值。`qa/qmax` 不是 `qult/qmax`。缺少數值或資料來源，顯示待確認。

RC、裂縫、錨定、水壓與揚壓、沉陷、整體邊坡穩定、液化、多層土、線載重、最佳化、DXF 尚未實作；RC 永遠顯示待確認，完整設計狀態固定為未完成。法規門檻不等於案件適用性與完整設計合格。

## 操作

1. 選斷面，輸入計畫與斷面名稱。
2. 修改尺寸、土壤、基底摩擦及地震係數。輸入後約 0.3 秒重新計算。
3. 填入地盤承載力與報告頁碼／試驗或計算方法。
4. 閱讀常時及所有地震方向結果，展開明細確認假設。
5. 按「保存專案」保存到目前瀏覽器。清除瀏覽器資料會移除此保存；用「匯出 JSON」另行備份。
6. 「列印／PDF」包含目前斷面的輸入、計算、依據與限制，可在列印視窗選另存 PDF。未提供伺服器 PDF 生成及多斷面合冊。

專案檔包含 `schema_version`、`engine_version`、`project_name`、`walls` 與 `current`。匯入時逐斷面由後端验证；所有斷面成功後才套用。版本 1 最多接受 100 斷面。

## 程式架構

| 路徑 | 功能 |
|---|---|
| `retaining_wall/core.py` | 輸入資料模型、驗證、土壓係數、重心、力矩、接地與檢核 |
| `retaining_wall/server.py` | 標準函式庫 HTTP 服務與 JSON API |
| `retaining_wall/web/` | HTML / CSS / JavaScript 介面，計算全部交由 Python |
| `tests/` | 獨立手算案例與 HTTP API 測試 |
| `docs/` | 模型、驗證結果、開發路線 |
| `.github/workflows/tests.yml` | GitHub 自動驗證 |
| `Dockerfile` / `compose.yaml` | 容器啟動 |

V0.1 採原生 JavaScript 與 Python 標準函式庫，免 Node 建置及 pip 安裝。日後 React / FastAPI 可沿用獨立計算核心與 JSON 契約。

API：`GET /api/health`、`GET /api/presets`、`POST /api/analyze`（傳入單一斷面 JSON）。

```python
from retaining_wall import analyze
result = analyze({"height": 2.8, "kh": 0.15})
print(result["static"]["checks"])
```

## 測試

在專案根目錄：

```bash
python -m unittest discover -s tests -v
node --check retaining_wall/web/app.js
```

原有 Python 測試不需安裝套件。跨語言比對測試需要 Node，未安裝時跳過；GitHub Actions 已安裝 Node 並執行比對。日常操作不需要 Node。

## Docker

```bash
docker compose up --build -d
```

開啟 <http://127.0.0.1:8788>。HTTP 服務未包含帳號或 TLS，預設只綁定本機；欲部署 NAS 多人使用應先加入認證、反向代理與專案資料庫。

## GitHub 倉庫

專案：<https://github.com/davida02617/-RetainingWall-Analysis>，預設分支 `main`。

```bash
git clone https://github.com/davida02617/-RetainingWall-Analysis.git
cd -- -RetainingWall-Analysis
python -m retaining_wall.server
```

Windows PowerShell 若不接受 `cd --`，可使用 `Set-Location .\\-RetainingWall-Analysis`。

原有 `retaining_wall/web/` 依賴 Python API；新增的 `browser/` 為獨立靜態網頁，可部署到 GitHub Pages 等靜態主機。

## 後續版本

1. 經指定工程案例與專業審查校正模型、地震增量作用點及適用規範。
2. 分層土／地下水／揚壓與載重擴充；承載力公式模組與來源版本管理。
3. RC 強度與配筋、詳細計算書、DXF、批次分析；每模組獨立驗證後才啟用合格判定。

未指定開源授權；公開或轉授權前應由專案擁有者決定授權條款。

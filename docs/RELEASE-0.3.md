# V0.3 發布紀錄

2026-10-11。台灣法規檢討版；更新原有 main 歷史，無強制推送或刪檔。

新增法規分流、地震位移模式、net／gross 承載、獨立地震承載值、地表載重組合及控制包絡。網頁與計算書列出來源、門檻及待補工作。原版 UI 檔案保留，新版 UI 與 Python 計算核心同步。

驗證：30 項測試通過（含 129 組跨語言數值比對、28 組拒絕輸入比對）；JavaScript 語法、中繼資料同步及 wheel 打包檢查通過。真實瀏覽器視覺／列印互動未驗證。詳見 [驗證紀錄](VALIDATION.md) 與 [法規檢討](TAIWAN-REGULATIONS.md)。

## 本次新增或更新檔案

- `.github/workflows/tests.yml`
- `.gitignore`
- `README.md`
- `browser/app.mjs`
- `browser/engine.mjs`
- `browser/index.html`
- `browser/model-data.mjs`
- `browser/style.css`
- `docs/CALCULATION.md`
- `docs/RELEASE-0.3.md`
- `docs/TAIWAN-REGULATIONS.md`
- `docs/VALIDATION.md`
- `docs/WEB.md`
- `pyproject.toml`
- `retaining_wall/core.py`
- `retaining_wall/regulations.py`
- `retaining_wall/server.py`
- `retaining_wall/web/professional/app.mjs`
- `retaining_wall/web/professional/engine.mjs`
- `retaining_wall/web/professional/index.html`
- `retaining_wall/web/professional/model-data.mjs`
- `retaining_wall/web/professional/style.css`
- `scripts/sync_browser_model.py`
- `tests/test_browser_parity.py`
- `tests/test_core.py`
- `tests/test_regulations.py`
- `tests/test_server.py`

本次未刪除任何既有檔案。未上傳建置輸出、暫存研究 PDF、專案私有資料或連線憑證；敏感副檔名已納入忽略規則。

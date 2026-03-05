# 英語測驗系統 - 部署指南

## 部署到 Render（免費方案）

### 方法一：使用 GitHub 自動部署（推薦）

1. **將代碼推送到 GitHub**
   ```bash
   cd /Users/reneleong/Desktop/Eng-Test-Maker
   git init
   git add .
   git commit -m "Initial commit"
   # 創建 GitHub 倉庫並推送
   ```

2. **在 Render 創建帳戶**
   - 訪問 https://render.com
   - 使用 GitHub 登入

3. **創建 Web Service**
   - 點擊 "New +" → "Web Service"
   - 連接你的 GitHub 倉庫
   - 選擇 "rest-express" 或你的項目名稱
   - 設置以下配置：
     - **Name**: eng-test-maker
     - **Environment**: Node
     - **Build Command**: `npm install && npm run build`
     - **Start Command**: `npm start`

4. **設置環境變量**（在 Advanced 部分）
   ```
   DATABASE_URL = postgresql://postgres:zrqk8CLbv9zVs83t@db.xhfgkbedefeqhevjksud.supabase.co:5432/postgres
   MINIMAX_API_KEY = api-28QryqDJ_auda3XLJ2_iQcZ9MuucnBWpN2ZWGJ_kYtv_Plg4C6Pkzj9I_vw7x_s40tUPYIbpEvpDoakkqCm03SgfYFJZslFVwlD35JD2l_06lIXv1FS2Vfs
   ADMIN_PASSWORD = 你的密碼
   ```

5. **點擊 "Create Web Service"**

### 方法二：使用 render.yaml 部署

1. 將 `render.yaml` 推送到 GitHub
2. 在 Render 後台點擊 "New +" → "Blueprint"
3. 連接你的 GitHub 倉庫
4. Render 會自動讀取 render.yaml 並部署

---

## 部署後

### 獲得網址
部署完成後，Render 會提供一個網址，例如：
`https://eng-test-maker.onrender.com`

### 防止休眠（可選）

Render 免費層會在 15 分鐘無活動後休眠。有幾種方法可以防止：

1. **定期訪問**：每星期訪問一次網站即可喚醒
2. **使用 Cron Job**（收費功能）
3. **使用外部 Ping 服務**：
   - 使用 https://cron-job.org 或 https://www.keepalive.ai
   - 設置每 10 分鐘 ping 一次你的網址

---

## 常見問題

### Q: 網站顯示 404？
A: 確保 Start Command 是 `npm start`，而不是 `npm run dev`

### Q: 無法連接數據庫？
A: 檢查 DATABASE_URL 環境變量是否正確

### Q: AI 評分不工作？
A: 確保 MINIMAX_API_KEY 環境變量已設置

---

## 技術棧

- **前端**: React + TypeScript + TailwindCSS
- **後端**: Express.js + Node.js
- **數據庫**: Supabase (PostgreSQL)
- **AI 評分**: MiniMax API

---

## 聯繫

如有問題，请联系系统管理员。

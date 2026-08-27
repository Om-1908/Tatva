# ⚛️ TATVA Quantum Computing AI Platform

> AI-Driven Quantum Circuit Synthesis using Reinforcement Learning & MongoDB Atlas.

---

## 📁 Repository Structure

```
tatva-frontend/
├── frontend/             # React 18 + Vite + TailwindCSS Frontend Application
│   ├── src/              # UI components, Quantum Composer workspace & store
│   ├── public/           # Static assets, branding, logos
│   ├── index.html        # HTML entry point with Google GSI SDK
│   ├── vercel.json       # Production SPA routing configuration for Vercel
│   └── package.json      # Dependencies & Vite build scripts
│
├── backend/              # Python Flask + Qiskit + MongoDB Atlas Backend
│   ├── app.py            # Flask API endpoints (Simulation, MongoDB Auth & DB Sync)
│   ├── hardware.py       # Quantum hardware execution engine
│   ├── requirements.txt  # Python package dependencies
│   ├── Procfile          # Production Gunicorn process launcher
│   └── render.yaml       # 1-Click deployment config for Render
│
├── run.bat               # Windows local launcher (starts both backend & frontend)
└── start.bat             # Alternative local launcher
```

---

## 🚀 Local Development Setup

1. **Clone & Launch**:
   Run `run.bat` at the root of the project:
   ```cmd
   run.bat
   ```
   - **Backend**: Runs on `http://localhost:5000`
   - **Frontend**: Runs on `http://localhost:5173`

---

## 🌐 Production Deployment Guide

### 1️⃣ Deploying Backend (Render / Railway / Heroku)

1. Create a new **Web Service** on [Render](https://render.com) or [Railway](https://railway.app).
2. Connect your repository and select the **`backend`** root directory.
3. **Build Command**: `pip install -r requirements.txt`
4. **Start Command**: `gunicorn app:app`
5. **Environment Variables**:
   - `MONGODB_URI`: `mongodb+srv://thisguycaptures5_db_user:tatva123@tatva.tgnd1go.mongodb.net/?appName=TATVA`

---

### 2️⃣ Deploying Frontend (Vercel / Netlify)

1. Import your project into [Vercel](https://vercel.com).
2. Set **Root Directory** to `frontend`.
3. **Framework Preset**: Select `Vite`.
4. **Environment Variables**:
   - `VITE_QYANTRAM_API_URL`: Your deployed backend URL (e.g. `https://tatva-backend.onrender.com`)
   - `VITE_GOOGLE_CLIENT_ID`: `1001085190771-dmur74m24ejm3sgltn1b0fuiihleutk2.apps.googleusercontent.com`
5. Click **Deploy**!

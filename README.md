# HWA — Myanmar AI Video Editor (Stage 1)

Fresh standalone foundation. No dependency on any previous backend.

## Stack
- Frontend: React + Vite + TypeScript
- Backend: FastAPI + SQLite (Stage 1)
- API: `/api/health`, `/api/projects`
- CORS: configurable with `CORS_ORIGINS`

## Run locally (or in a cloud IDE)
### Backend
```bash
cd backend
python -m venv .venv
# activate the environment, then:
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
API docs: `http://localhost:8000/docs`

### Frontend
```bash
cd frontend
npm install
cp .env.example .env
npm run dev -- --host 0.0.0.0
```
Set `VITE_API_BASE_URL` to the backend URL.

## Deploy with a phone
1. Create a new GitHub repository and upload this ZIP's extracted files.
2. Deploy `backend/` as a new Render Web Service:
   - Build command: `pip install -r requirements.txt`
   - Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - Root directory: `backend`
   - Add environment variable `CORS_ORIGINS` with your deployed frontend origin.
3. Deploy `frontend/` as a new Vercel project:
   - Root directory: `frontend`
   - Build command: `npm run build`
   - Output directory: `dist`
   - Add `VITE_API_BASE_URL` = your new backend URL (no trailing slash).
4. Redeploy frontend after setting its environment variable.

## Notes
- SQLite is suitable for Stage 1 testing. For a production multi-instance deployment, Stage 1.5 should migrate to managed PostgreSQL and persistent storage.
- This stage does not yet upload/process video, synthesize voice, generate subtitles, or render exports. Those are later stages.
- Do not put secrets in frontend environment variables.

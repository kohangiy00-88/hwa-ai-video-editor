import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.database import get_connection, init_db
from app.schemas import ProjectCreate

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(
    title="Myanmar AI Video Editor API",
    version="0.1.0",
    description="Fresh Stage 1 API foundation. Video processing arrives in later stages.",
    lifespan=lifespan,
)

origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type"],
)

@app.get("/")
def root():
    return {"service": "myanmar-ai-video-editor-api", "stage": 1, "docs": "/docs"}

@app.get("/api/health")
def health():
    return {"ok": True, "service": "video-editor-api", "stage": 1}

@app.get("/api/projects")
def list_projects():
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, name, status, created_at, updated_at FROM projects ORDER BY id DESC"
        ).fetchall()
    return [dict(row) for row in rows]

@app.post("/api/projects", status_code=201)
def create_project(payload: ProjectCreate):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Project name cannot be blank")
    with get_connection() as conn:
        cursor = conn.execute("INSERT INTO projects (name) VALUES (?)", (name,))
        conn.commit()
        row = conn.execute(
            "SELECT id, name, status, created_at, updated_at FROM projects WHERE id = ?",
            (cursor.lastrowid,),
        ).fetchone()
    return dict(row)

@app.delete("/api/projects/{project_id}", status_code=204)
def delete_project(project_id: int):
    with get_connection() as conn:
        cursor = conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        conn.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Project not found")
    return None

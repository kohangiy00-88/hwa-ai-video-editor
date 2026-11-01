import os
import uuid
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.database import get_connection, init_db
from app.schemas import ProjectCreate

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "/tmp/hwa-uploads"))
MAX_FILE_SIZE = 500 * 1024 * 1024

ALLOWED_EXTENSIONS = {".mp4", ".mov", ".webm", ".m4v"}

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    yield

app = FastAPI(
    title="HWA Myanmar AI Video Editor API",
    version="0.2.0",
    description="HWA Stage 3 - Video Upload and Preview",
    lifespan=lifespan,
)

origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173"
    ).split(",")
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
    return {
        "service": "hwa-video-editor-api",
        "stage": 3,
        "docs": "/docs"
    }

@app.get("/api/health")
def health():
    return {
        "ok": True,
        "service": "hwa-video-editor-api",
        "stage": 3
    }

@app.get("/api/projects")
def list_projects():
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, name, status, created_at, updated_at
            FROM projects ORDER BY id DESC
            """
        ).fetchall()
    return [dict(row) for row in rows]

@app.post("/api/projects", status_code=201)
def create_project(payload: ProjectCreate):
    name = payload.name.strip()
    if not name:
        raise HTTPException(
            status_code=422,
            detail="Project name cannot be blank"
        )

    with get_connection() as conn:
        cursor = conn.execute(
            "INSERT INTO projects (name) VALUES (?)",
            (name,)
        )
        conn.commit()

        row = conn.execute(
            """
            SELECT id, name, status, created_at, updated_at
            FROM projects WHERE id = ?
            """,
            (cursor.lastrowid,)
        ).fetchone()

    return dict(row)

@app.post("/api/projects/{project_id}/videos", status_code=201)
async def upload_video(
    project_id: int,
    file: UploadFile = File(...)
):
    with get_connection() as conn:
        project = conn.execute(
            "SELECT id FROM projects WHERE id = ?",
            (project_id,)
        ).fetchone()

    if project is None:
        raise HTTPException(
            status_code=404,
            detail="Project not found"
        )

    original_name = Path(file.filename or "video").name
    extension = Path(original_name).suffix.lower()

    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Only MP4, MOV, WEBM and M4V videos are allowed"
        )

    content_type = file.content_type or "application/octet-stream"

    if not (
        content_type.startswith("video/")
        or content_type == "application/octet-stream"
    ):
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is not recognized as a video"
        )

    stored_name = f"{uuid.uuid4().hex}{extension}"
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    destination = UPLOAD_DIR / stored_name

    total_size = 0

    try:
        with destination.open("wb") as output:
            while True:
                chunk = await file.read(1024 * 1024)

                if not chunk:
                    break

                total_size += len(chunk)

                if total_size > MAX_FILE_SIZE:
                    raise HTTPException(
                        status_code=413,
                        detail="Video must be 500 MB or smaller"
                    )

                output.write(chunk)

        if total_size == 0:
            raise HTTPException(
                status_code=400,
                detail="The uploaded video is empty"
            )

        with get_connection() as conn:
            cursor = conn.execute(
                """
                INSERT INTO video_files (
                    project_id,
                    original_filename,
                    stored_filename,
                    content_type,
                    size_bytes
                )
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    project_id,
                    original_name,
                    stored_name,
                    content_type,
                    total_size
                )
            )
            conn.commit()
            video_id = cursor.lastrowid

        return {
            "id": video_id,
            "project_id": project_id,
            "filename": original_name,
            "content_type": content_type,
            "size_bytes": total_size,
            "file_url": f"/api/videos/{video_id}/file"
        }

    except Exception:
        if destination.exists():
            destination.unlink()
        raise

    finally:
        await file.close()

@app.get("/api/projects/{project_id}/videos")
def list_project_videos(project_id: int):
    with get_connection() as conn:
        project = conn.execute(
            "SELECT id FROM projects WHERE id = ?",
            (project_id,)
        ).fetchone()

        if project is None:
            raise HTTPException(
                status_code=404,
                detail="Project not found"
            )

        rows = conn.execute(
            """
            SELECT id, project_id, original_filename,
                   content_type, size_bytes, created_at
            FROM video_files
            WHERE project_id = ?
            ORDER BY id DESC
            """,
            (project_id,)
        ).fetchall()

    result = []

    for row in rows:
        item = dict(row)
        item["file_url"] = f"/api/videos/{item['id']}/file"
        result.append(item)

    return result

@app.get("/api/videos/{video_id}/file")
def get_video_file(video_id: int):
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT original_filename, stored_filename, content_type
            FROM video_files WHERE id = ?
            """,
            (video_id,)
        ).fetchone()

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="Video not found"
        )

    path = UPLOAD_DIR / row["stored_filename"]

    if not path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Video file is no longer available"
        )

    return FileResponse(
        path=str(path),
        media_type=row["content_type"] or "application/octet-stream",
        filename=row["original_filename"]
    )

@app.delete("/api/projects/{project_id}", status_code=204)
def delete_project(project_id: int):
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT stored_filename FROM video_files WHERE project_id = ?",
            (project_id,)
        ).fetchall()

        cursor = conn.execute(
            "DELETE FROM projects WHERE id = ?",
            (project_id,)
        )
        conn.commit()

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Project not found"
            )

    for row in rows:
        path = UPLOAD_DIR / row["stored_filename"]
        if path.is_file():
            path.unlink()

    return None

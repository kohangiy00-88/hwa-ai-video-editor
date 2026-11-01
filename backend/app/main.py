import os
import uuid
import json
import time
import urllib.request
import urllib.error

from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from google import genai

from app.database import get_connection, init_db
from app.schemas import ProjectCreate


# ==========================================
# HWA CONFIGURATION
# ==========================================

UPLOAD_DIR = Path(
    os.getenv("UPLOAD_DIR", "/tmp/hwa-uploads")
)

MAX_FILE_SIZE = 500 * 1024 * 1024

ALLOWED_EXTENSIONS = {
    ".mp4",
    ".mov",
    ".webm",
    ".m4v"
}

GEMINI_MODEL = os.getenv(
    "GEMINI_MODEL",
    "gemini-2.5-flash"
)


# ==========================================
# AI RECAP REQUEST MODEL
# ==========================================

class RecapRequest(BaseModel):

    story_text: str = Field(
        min_length=20,
        max_length=30000
    )

    target_minutes: int = Field(
        default=5,
        ge=1,
        le=30
    )

    tone: str = Field(
        default="စိတ်ဝင်စားဖွယ်",
        max_length=100
    )


# ==========================================
# APP LIFESPAN
# ==========================================

@asynccontextmanager
async def lifespan(app: FastAPI):

    init_db()

    UPLOAD_DIR.mkdir(
        parents=True,
        exist_ok=True
    )

    yield


# ==========================================
# FASTAPI APP
# ==========================================

app = FastAPI(
    title="HWA Myanmar AI Video Editor API",
    version="0.5.0",
    description=(
        "HWA - Myanmar AI Video Editor "
        "with Gemini Video Analysis"
    ),
    lifespan=lifespan,
)


# ==========================================
# CORS
# ==========================================

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
    allow_methods=[
        "GET",
        "POST",
        "PATCH",
        "DELETE"
    ],
    allow_headers=["Content-Type"],
)


# ==========================================
# HOME & HEALTH
# ==========================================

@app.get("/")
def root():

    return {
        "service": "hwa-video-editor-api",
        "stage": 5,
        "version": "0.5.0",
        "docs": "/docs"
    }


@app.get("/api/health")
def health():

    return {
        "ok": True,
        "service": "hwa-video-editor-api",
        "stage": 5
    }


# ==========================================
# PROJECT LIST
# ==========================================

@app.get("/api/projects")
def list_projects():

    with get_connection() as conn:

        rows = conn.execute(
            """
            SELECT
                id,
                name,
                status,
                created_at,
                updated_at
            FROM projects
            ORDER BY id DESC
            """
        ).fetchall()

    return [
        dict(row)
        for row in rows
    ]


# ==========================================
# CREATE PROJECT
# ==========================================

@app.post(
    "/api/projects",
    status_code=201
)
def create_project(payload: ProjectCreate):

    name = payload.name.strip()

    if not name:
        raise HTTPException(
            status_code=422,
            detail="Project name cannot be blank"
        )

    with get_connection() as conn:

        cursor = conn.execute(
            """
            INSERT INTO projects (name)
            VALUES (?)
            """,
            (name,)
        )

        conn.commit()

        row = conn.execute(
            """
            SELECT
                id,
                name,
                status,
                created_at,
                updated_at
            FROM projects
            WHERE id = ?
            """,
            (cursor.lastrowid,)
        ).fetchone()

    return dict(row)


# ==========================================
# VIDEO UPLOAD
# ==========================================

@app.post(
    "/api/projects/{project_id}/videos",
    status_code=201
)
async def upload_video(
    project_id: int,
    file: UploadFile = File(...)
):

    with get_connection() as conn:

        project = conn.execute(
            """
            SELECT id
            FROM projects
            WHERE id = ?
            """,
            (project_id,)
        ).fetchone()

    if project is None:
        raise HTTPException(
            status_code=404,
            detail="Project not found"
        )

    original_name = Path(
        file.filename or "video"
    ).name

    extension = Path(
        original_name
    ).suffix.lower()

    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=(
                "Only MP4, MOV, WEBM and M4V "
                "videos are allowed"
            )
        )

    content_type = (
        file.content_type
        or "application/octet-stream"
    )

    if not (
        content_type.startswith("video/")
        or content_type == "application/octet-stream"
    ):
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is not a video"
        )

    stored_name = (
        f"{uuid.uuid4().hex}{extension}"
    )

    UPLOAD_DIR.mkdir(
        parents=True,
        exist_ok=True
    )

    destination = UPLOAD_DIR / stored_name

    total_size = 0

    try:

        with destination.open("wb") as output:

            while True:

                chunk = await file.read(
                    1024 * 1024
                )

                if not chunk:
                    break

                total_size += len(chunk)

                if total_size > MAX_FILE_SIZE:
                    raise HTTPException(
                        status_code=413,
                        detail=(
                            "Video must be "
                            "500 MB or smaller"
                        )
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
            "file_url": (
                f"/api/videos/{video_id}/file"
            )
        }

    except Exception:

        if destination.exists():
            destination.unlink()

        raise

    finally:

        await file.close()


# ==========================================
# LIST PROJECT VIDEOS
# ==========================================

@app.get(
    "/api/projects/{project_id}/videos"
)
def list_project_videos(project_id: int):

    with get_connection() as conn:

        project = conn.execute(
            """
            SELECT id
            FROM projects
            WHERE id = ?
            """,
            (project_id,)
        ).fetchone()

        if project is None:
            raise HTTPException(
                status_code=404,
                detail="Project not found"
            )

        rows = conn.execute(
            """
            SELECT
                id,
                project_id,
                original_filename,
                content_type,
                size_bytes,
                created_at
            FROM video_files
            WHERE project_id = ?
            ORDER BY id DESC
            """,
            (project_id,)
        ).fetchall()

    result = []

    for row in rows:

        item = dict(row)

        item["file_url"] = (
            f"/api/videos/{item['id']}/file"
        )

        result.append(item)

    return result


# ==========================================
# VIDEO PREVIEW
# ==========================================

@app.get(
    "/api/videos/{video_id}/file"
)
def get_video_file(video_id: int):

    with get_connection() as conn:

        row = conn.execute(
            """
            SELECT
                original_filename,
                stored_filename,
                content_type
            FROM video_files
            WHERE id = ?
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
        media_type=(
            row["content_type"]
            or "application/octet-stream"
        ),
        filename=row["original_filename"]
    )


# ==========================================
# GEMINI VIDEO ANALYSIS
# ==========================================

@app.post(
    "/api/videos/{video_id}/analyze"
)
def analyze_video(video_id: int):

    api_key = os.getenv("GEMINI_API_KEY")

    if not api_key:
        raise HTTPException(
            status_code=503,
            detail=(
                "AI service is not configured. "
                "Add GEMINI_API_KEY in Render Environment."
            )
        )

    with get_connection() as conn:

        row = conn.execute(
            """
            SELECT
                id,
                project_id,
                original_filename,
                stored_filename,
                content_type,
                size_bytes
            FROM video_files
            WHERE id = ?
            """,
            (video_id,)
        ).fetchone()

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="Video not found"
        )

    video_path = (
        UPLOAD_DIR / row["stored_filename"]
    )

    if not video_path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Video file is not available"
        )

    client = genai.Client(
        api_key=api_key
    )

    uploaded = None

    prompt = """
You are HWA, a professional Myanmar animation
story analyst and video recap editor.

Analyze the uploaded video.

IMPORTANT TASKS:

1. Understand the story and its chronology.
2. Identify important characters and relationships.
3. Identify important events and scene changes.
4. Describe important visual details.
5. Do not invent events or character information.
6. Preserve the original story meaning.
7. Write an engaging Myanmar-language YouTube recap.
8. Divide the recap into clear sections.
9. Include an interesting opening and ending.
10. Create a practical video editing plan.

EDITING PLAN REQUIREMENTS:

- Identify important scenes.
- Provide timestamps when available.
- Describe each scene.
- Suggest zoom in and zoom out movements.
- Suggest left and right camera movement.
- Suggest smooth transitions.
- Avoid unnecessary cuts.
- Preserve important original footage.
- Suggest suitable subtitle moments.
- Suggest voiceover timing.

OUTPUT FORMAT:

VIDEO SUMMARY

CHARACTERS

STORY RECAP

IMPORTANT SCENES

EDITING PLAN

VOICEOVER PLAN

SUBTITLE PLAN

Write naturally in Myanmar language.
Do not claim that an event happened if it is not supported
by the uploaded video.
"""

    try:

        uploaded = client.files.upload(
            file=str(video_path),
            config={
                "mime_type": (
                    row["content_type"]
                    or "video/mp4"
                )
            }
        )

        started = time.time()

        max_wait_seconds = 1800

        while True:

            state = getattr(
                uploaded.state,
                "name",
                str(uploaded.state)
            )

            state = state.upper()

            if state.endswith("ACTIVE"):
                break

            if state.endswith("FAILED"):
                raise HTTPException(
                    status_code=502,
                    detail=(
                        "Gemini could not process "
                        "the uploaded video."
                    )
                )

            if (
                time.time() - started
                > max_wait_seconds
            ):
                raise HTTPException(
                    status_code=504,
                    detail=(
                        "Video preparation timed out. "
                        "Please retry."
                    )
                )

            time.sleep(5)

            uploaded = client.files.get(
                name=uploaded.name
            )

        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=[
                uploaded,
                prompt
            ]
        )

        analysis = (
            response.text or ""
        ).strip()

        if not analysis:
            raise HTTPException(
                status_code=502,
                detail="AI returned an empty analysis."
            )

        return {
            "ok": True,
            "video_id": video_id,
            "project_id": row["project_id"],
            "filename": row["original_filename"],
            "language": "my",
            "status": "completed",
            "analysis": analysis
        }

    except HTTPException:
        raise

    except Exception as error:

        raise HTTPException(
            status_code=502,
            detail=(
                "Video analysis failed: "
                + str(error)[:500]
            )
        )

    finally:

        if uploaded is not None:

            try:
                client.files.delete(
                    name=uploaded.name
                )
            except Exception:
                pass


# ==========================================
# TEXT-BASED RECAP API
# Keep for backward compatibility
# ==========================================

@app.post(
    "/api/recap/generate"
)
def generate_recap(payload: RecapRequest):

    api_key = os.getenv("GEMINI_API_KEY")

    if not api_key:
        raise HTTPException(
            status_code=503,
            detail=(
                "AI service is not configured. "
                "Add GEMINI_API_KEY in Render Environment."
            )
        )

    prompt = f"""
သင်သည် HWA Myanmar AI Video Editor ၏
မြန်မာဘာသာ Recap ဇာတ်ညွှန်းရေးသားပေးသော AI ဖြစ်သည်။

အောက်ပါဇာတ်လမ်းအကြောင်းအရာကို အခြေခံပြီး
YouTube အတွက် မြန်မာလို Recap ဇာတ်ညွှန်းရေးပေးပါ။

လိုအပ်ချက်များ -

1. စစချင်းမှာ စိတ်ဝင်စားစရာ Hook ထည့်ပါ။
2. ဇာတ်လမ်းကို အစဉ်လိုက် ရေးပါ။
3. ဇာတ်ကောင်အမည်များကို တိကျစွာ ထိန်းသိမ်းပါ။
4. မူရင်းတွင်မပါသော ဖြစ်ရပ်များ မဖန်တီးပါနှင့်။
5. သဘာဝကျသော မြန်မာစကားသုံးပါ။
6. အရေးကြီးသော အကြောင်းအရာများ မချန်ထားပါနှင့်။
7. အပိုင်းလိုက် ခေါင်းစဉ်ခွဲပါ။
8. စိတ်ဝင်စားစရာ Ending ထည့်ပါ။
9. YouTube Voiceover ဖတ်ရန် သင့်တော်ပါစေ။

အသံနေအသံထား:
{payload.tone}

ခန့်မှန်းဗီဒီယိုကြာချိန်:
{payload.target_minutes} မိနစ်

ဇာတ်လမ်းအကြောင်းအရာ:
{payload.story_text}
"""

    url = (
        "https://generativelanguage.googleapis.com/v1beta/"
        f"models/{GEMINI_MODEL}:generateContent"
        f"?key={api_key}"
    )

    body = {
        "contents": [
            {
                "parts": [
                    {
                        "text": prompt
                    }
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 8192
        }
    }

    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json"
        },
        method="POST"
    )

    try:

        with urllib.request.urlopen(
            request,
            timeout=120
        ) as response:

            result = json.loads(
                response.read().decode("utf-8")
            )

        candidates = result.get(
            "candidates",
            []
        )

        if not candidates:
            raise HTTPException(
                status_code=502,
                detail="AI did not return a recap script."
            )

        parts = (
            candidates[0]
            .get("content", {})
            .get("parts", [])
        )

        script = "\n".join(
            part.get("text", "")
            for part in parts
            if part.get("text")
        ).strip()

        if not script:
            raise HTTPException(
                status_code=502,
                detail="AI returned an empty script."
            )

        return {
            "ok": True,
            "script": script,
            "language": "my",
            "target_minutes": payload.target_minutes,
            "tone": payload.tone
        }

    except urllib.error.HTTPError as error:

        error_message = error.read().decode(
            "utf-8",
            errors="replace"
        )[:1000]

        raise HTTPException(
            status_code=502,
            detail=(
                "Gemini API error: "
                + error_message
            )
        )

    except urllib.error.URLError:

        raise HTTPException(
            status_code=502,
            detail="Could not connect to the AI service."
        )

    except TimeoutError:

        raise HTTPException(
            status_code=504,
            detail="AI request timed out. Please try again."
        )


# ==========================================
# DELETE PROJECT
# ==========================================

@app.delete(
    "/api/projects/{project_id}",
    status_code=204
)
def delete_project(project_id: int):

    with get_connection() as conn:

        rows = conn.execute(
            """
            SELECT stored_filename
            FROM video_files
            WHERE project_id = ?
            """,
            (project_id,)
        ).fetchall()

        cursor = conn.execute(
            """
            DELETE FROM projects
            WHERE id = ?
            """,
            (project_id,)
        )

        conn.commit()

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Project not found"
            )

    for row in rows:

        path = (
            UPLOAD_DIR / row["stored_filename"]
        )

        if path.is_file():
            path.unlink()

    return None

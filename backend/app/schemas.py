from pydantic import BaseModel, Field
from typing import Literal

class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)

class ProjectOut(BaseModel):
    id: int
    name: str
    status: Literal["draft", "processing", "completed", "failed"]
    created_at: str
    updated_at: str

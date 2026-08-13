from pathlib import Path
import os
from pydantic_settings import BaseSettings

# Root directory of backend service
BASE_DIR = Path(__file__).resolve().parent.parent.parent

class Settings(BaseSettings):
    PROJECT_NAME: str = "Aegis-AI"
    API_V1_STR: str = "/api/v1"
    BACKEND_PORT: int = 8000
    FRONTEND_PORT: int = 5173
    
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
    ]
    
    DATABASE_URL: str = "postgresql://aegis:aegis_pass@db:5432/aegis_db"
    OLLAMA_BASE_URL: str = "http://host.docker.internal:11434"
    OLLAMA_MODEL: str = "gemma2:2b"
    GEMINI_API_KEY: str = ""


    # RAG & Storage Configuration
    UPLOAD_DIR: Path = BASE_DIR / "uploads"
    CHROMA_DATA_DIR: Path = BASE_DIR / "chroma_data"
    DOCUMENTS_DIR: Path = (
        Path("/app/documents")
        if Path("/app/documents").exists()
        else (
            BASE_DIR.parent / "documents"
            if (BASE_DIR.parent / "documents").exists()
            else BASE_DIR / "documents"
        )
    )
    EMBEDDING_MODEL_NAME: str = "all-MiniLM-L6-v2"

    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()

# Ensure required storage folders exist
settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
settings.CHROMA_DATA_DIR.mkdir(parents=True, exist_ok=True)
settings.DOCUMENTS_DIR.mkdir(parents=True, exist_ok=True)

# Set Hugging Face cache directory so models are cached locally / in container volume
if "HF_HOME" not in os.environ:
    os.environ["HF_HOME"] = str(BASE_DIR / ".cache" / "huggingface")



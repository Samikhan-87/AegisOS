from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.routes import agent_rag, chat, documents

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# CORS Setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {
        "message": "Welcome to Aegis-AI API",
        "health": "/health",
        "docs": "/docs",
        "api_v1": settings.API_V1_STR
    }

@app.get("/health")
def health_check():
    return {"status": "ok"}

# API Routers
app.include_router(chat.router, prefix=settings.API_V1_STR, tags=["chat"])
app.include_router(documents.router, prefix=settings.API_V1_STR)
app.include_router(agent_rag.router, prefix=settings.API_V1_STR)



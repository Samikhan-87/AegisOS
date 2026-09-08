"""
API Routes for LangGraph RAG Agent and Security Auditor.
"""

from fastapi import APIRouter, HTTPException, status
from app.agents.rag_agent import run_rag_agent
from app.agents.security_auditor import check_input
from app.models.agents import (
    RAGAskRequest,
    RAGAskResponse,
    SecurityCheckRequest,
    SecurityCheckResult,
)

router = APIRouter(prefix="/agents", tags=["agents"])


@router.post(
    "/rag/ask",
    response_model=RAGAskResponse,
    summary="Ask RAG Agent (Pre-Retrieval Security Audit + LangGraph Retrieval + Ollama LLM)",
    description=(
        "Executes a multi-node LangGraph workflow: "
        "1) Rule-based Pre-Retrieval Security Audit (blocks prompt injection/jailbreak attempts), "
        "2) Hybrid BM25/Vector Search over ChromaDB, "
        "3) Grounded answer generation using local Ollama LLM. "
        "Returns grounded answer, document citations, retrieved chunks, and security check audit result."
    ),
)
async def ask_rag_agent(request: RAGAskRequest) -> RAGAskResponse:
    try:
        result = run_rag_agent(
            query=request.query,
            department_filter=request.department_filter
        )
        return RAGAskResponse(
            query=result["query"],
            department_filter=result.get("department_filter"),
            answer=result["answer"],
            citations=result.get("citations", []),
            retrieved_chunks=result.get("retrieved_chunks", []),
            security_check=result.get("security_check", {
                "is_safe": True,
                "risk_level": "none",
                "flagged_patterns": [],
                "reason": "Default safety pass."
            }),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to execute RAG Agent workflow: {str(e)}",
        ) from e


@router.post(
    "/security/check",
    response_model=SecurityCheckResult,
    summary="Direct Security Audit Pre-Retrieval Check",
    description=(
        "Directly evaluates a query string against prompt injection, jailbreak, "
        "system prompt extraction, and injection signatures without invoking retrieval or the LLM."
    ),
)
async def check_query_security(request: SecurityCheckRequest) -> SecurityCheckResult:
    try:
        result = check_input(request.query)
        return SecurityCheckResult(
            is_safe=result["is_safe"],
            risk_level=result["risk_level"],
            flagged_patterns=result.get("flagged_patterns", []),
            reason=result.get("reason", "")
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to perform security audit: {str(e)}",
        ) from e

"""
API Route for LangGraph RAG Agent.
"""

from fastapi import APIRouter, HTTPException, status
from app.agents.rag_agent import run_rag_agent
from app.models.agents import RAGAskRequest, RAGAskResponse

router = APIRouter(prefix="/agents/rag", tags=["agents"])


@router.post(
    "/ask",
    response_model=RAGAskResponse,
    summary="Ask RAG Agent (LangGraph Retrieval + Grounded Ollama LLM Answer)",
    description=(
        "Executes a 2-node LangGraph workflow (retrieval via Hybrid BM25/Vector Search + "
        "grounded answer generation using a local Ollama LLM). "
        "Returns answer, document citations, and raw retrieved chunks."
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
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to execute RAG Agent workflow: {str(e)}",
        ) from e

"""
API Routes for LangGraph RAG Agent and Security Auditor.
"""

from fastapi import APIRouter, HTTPException, status
from app.agents.rag_agent import run_rag_agent
from app.agents.security_auditor import check_input, check_output
from app.models.agents import (
    RAGAskRequest,
    RAGAskResponse,
    SecurityCheckOutputRequest,
    SecurityCheckRequest,
    SecurityCheckResult,
)

router = APIRouter(prefix="/agents", tags=["agents"])


@router.post(
    "/rag/ask",
    response_model=RAGAskResponse,
    summary="Ask RAG Agent (Pre-Retrieval Security Audit + LangGraph Retrieval + Ollama LLM + Output Guardrail)",
    description=(
        "Executes a multi-node LangGraph workflow: "
        "1) Rule-based Pre-Retrieval Security Audit (blocks prompt injection/jailbreak attempts), "
        "2) Hybrid BM25/Vector Search over ChromaDB, "
        "3) Grounded answer generation using local Ollama LLM, "
        "4) Post-Generation Output Guardrail (checks for confidential text leaks, hallucinations, and ungrounded PII). "
        "Returns grounded answer, document citations, retrieved chunks, security check, and output validation result."
    ),
)
async def ask_rag_agent(request: RAGAskRequest) -> RAGAskResponse:
    try:
        result = run_rag_agent(
            query=request.query,
            department_filter=request.department_filter
        )

        sec_check_data = result.get("security_check")
        if not isinstance(sec_check_data, dict) or "is_safe" not in sec_check_data:
            sec_check_data = {
                "is_safe": True,
                "risk_level": "none",
                "flagged_patterns": [],
                "reason": "Default safety pass."
            }

        output_check_data = result.get("output_check")
        if not isinstance(output_check_data, dict) or "is_safe" not in output_check_data:
            output_check_data = {
                "is_safe": True,
                "risk_level": "none",
                "flagged_patterns": [],
                "reason": (
                    "Output validation skipped: query blocked at input security boundary."
                    if not sec_check_data.get("is_safe", True)
                    else "Default safety pass."
                )
            }

        return RAGAskResponse(
            query=result["query"],
            department_filter=result.get("department_filter"),
            answer=result["answer"],
            citations=result.get("citations", []),
            retrieved_chunks=result.get("retrieved_chunks", []),
            security_check=sec_check_data,
            output_check=output_check_data,
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


@router.post(
    "/security/check-output",
    response_model=SecurityCheckResult,
    summary="Direct Post-Generation Security Output Validation Check",
    description=(
        "Directly evaluates an LLM-generated answer against retrieved context chunks "
        "to detect confidential document exposure, hallucinated entity/number claims, and ungrounded PII."
    ),
)
async def check_generated_output(request: SecurityCheckOutputRequest) -> SecurityCheckResult:
    try:
        result = check_output(
            answer=request.answer,
            retrieved_chunks=request.retrieved_chunks,
            classification_levels=request.classification_levels,
        )
        return SecurityCheckResult(
            is_safe=result["is_safe"],
            risk_level=result["risk_level"],
            flagged_patterns=result.get("flagged_patterns", []),
            reason=result.get("reason", "")
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to perform output validation: {str(e)}",
        ) from e

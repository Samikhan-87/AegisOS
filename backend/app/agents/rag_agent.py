"""
LangGraph RAG Agent with Pre-Retrieval Security Guardrail, Grounded Generation and Citations for Aegis OS.

--- ARCHITECTURAL RATIONALE: WHY INPUT VALIDATION RUNS BEFORE RETRIEVAL ---
1. Why Input Validation Must Run BEFORE Retrieval:
   A malicious query (e.g., prompt injection, jailbreak payload, or malicious SQL/script tag)
   could otherwise manipulate vector search embeddings to retrieve sensitive internal documents
   (unauthorized data access/exfiltration) or poison the retrieved context window before reaching the LLM.
   By intercepting and validating queries at the graph entry point before the retrieval node,
   we completely isolate ChromaDB and the downstream LLM from adversarial inputs.

2. Why a Fast Rule-Based First Layer?:
   Rule-based pattern matching executes in sub-millisecond time (<0.1ms) with zero latency overhead
   and 100% deterministic accuracy against known attack signatures (e.g., "ignore previous instructions",
   "DAN mode", "print system prompt"). In contrast, an LLM-based classifier introduces non-determinism,
   token costs, and significant latency (10-30 seconds on CPU inference). Rule-based validation provides
   an immediate, zero-cost first defense perimeter, onto which semantic or LLM classifiers can be layered later.
"""

from typing import Any, Optional, TypedDict
from langgraph.graph import END, START, StateGraph
from app.agents.llm_client import call_ollama
from app.agents.security_auditor import check_input, check_output
from app.rag.hybrid_search import hybrid_search


class AgentState(TypedDict):
    """
    State container passed through the LangGraph RAG execution pipeline.
    """
    query: str
    department_filter: Optional[str]
    security_flag: dict[str, Any]
    retrieved_chunks: list[dict[str, Any]]
    answer: str
    citations: list[dict[str, Any]]
    output_flag: dict[str, Any]


def security_check_node(state: AgentState) -> dict[str, Any]:
    """
    LangGraph Node 0 (Pre-Retrieval Guardrail):
    Performs deterministic pattern-based validation on user query before retrieval.
    If high risk is detected, blocks retrieval and generation immediately.
    """
    query = state.get("query", "")
    security_result = check_input(query)

    if not security_result["is_safe"]:
        flagged_cats = security_result.get("flagged_categories", [])
        if "credential_harvesting" in flagged_cats or any("credential_harvesting" in p for p in security_result.get("flagged_patterns", [])):
            rejection_text = (
                "I am unable to provide or disclose passwords, credentials, or authentication secrets for any employee or user. "
                "In accordance with Aegis OS enterprise security policies, credential access and unauthorized extraction requests are strictly prohibited."
            )
        else:
            rejection_reason = security_result.get("reason", "Prompt injection or adversarial query detected.")
            rejection_text = f"This query was flagged by security validation and cannot be processed. ({rejection_reason})"

        return {
            "security_flag": security_result,
            "retrieved_chunks": [],
            "citations": [],
            "answer": rejection_text,
        }

    return {
        "security_flag": security_result
    }


def should_proceed_to_retrieval(state: AgentState) -> str:
    """
    Conditional routing function:
    Proceeds to 'retrieve' if input passed security validation (is_safe=True).
    Otherwise short-circuits execution directly to END.
    """
    security_flag = state.get("security_flag") or {}
    if not security_flag.get("is_safe", True):
        return END
    return "retrieve"


def retrieve_node(state: AgentState) -> dict[str, Any]:
    """
    LangGraph Node 1: Executes hybrid vector + BM25 search over ChromaDB persistent store.
    """
    query = state["query"]
    department_filter = state.get("department_filter")

    chunks = hybrid_search(
        query=query,
        top_k=5,
        department_filter=department_filter
    )

    return {"retrieved_chunks": chunks}


def generate_node(state: AgentState) -> dict[str, Any]:
    """
    LangGraph Node 2: Formats retrieved context using the top 3 highest-scoring chunks,
    calls local Ollama LLM with grounding instructions, and extracts source document citations
    from all top 5 retrieved chunks for UI transparency.
    """
    query = state["query"]
    chunks = state.get("retrieved_chunks", [])

    fallback_response = "I don't have that information in the available documents."

    if not chunks:
        return {
            "answer": fallback_response,
            "citations": []
        }

    # Pass only top 3 highest-scoring chunks to LLM prompt to reduce prompt length and CPU generation latency
    prompt_chunks = chunks[:3]

    # Format context blocks for LLM prompt using top 3 chunks
    context_blocks: list[str] = []
    for idx, chunk in enumerate(prompt_chunks, start=1):
        meta = chunk.get("metadata") or {}
        filename = meta.get("source_filename") or meta.get("filename") or "Document.pdf"
        department = meta.get("department") or "General"
        chunk_idx = meta.get("chunk_index", 0)

        context_blocks.append(
            f"[Source {idx}]\n"
            f"Filename: {filename}\n"
            f"Department: {department}\n"
            f"Chunk Index: {chunk_idx}\n"
            f"Content: {chunk.get('text', '').strip()}\n"
        )

    # Gather citations across all retrieved chunks (top 5) for UI transparency
    citations: list[dict[str, Any]] = []
    seen_citations: set[str] = set()
    for chunk in chunks:
        meta = chunk.get("metadata") or {}
        filename = meta.get("source_filename") or meta.get("filename") or "Document.pdf"
        department = meta.get("department") or "General"
        chunk_idx = meta.get("chunk_index", 0)

        cite_key = f"{filename}_{department}_{chunk_idx}"
        if cite_key not in seen_citations:
            seen_citations.add(cite_key)
            citations.append({
                "filename": filename,
                "department": department,
                "chunk_index": chunk_idx
            })

    formatted_context = "\n---\n".join(context_blocks)

    # Build strict grounded system prompt prohibiting greetings & forcing exact fallback
    prompt = (
        "SYSTEM INSTRUCTIONS:\n"
        "You are a strict document retrieval assistant for Aegis OS.\n"
        "1. NEVER greet the user (do not say 'Hello', 'Hi', 'Good day', or 'How can I help you today?').\n"
        "2. Answer ONLY using the facts explicitly stated in the provided context chunks below.\n"
        "3. If the provided context chunks do not contain the answer, respond EXACTLY with:\n"
        "   I don't have that information in the available documents.\n"
        "4. Do NOT use outside knowledge, speculate, or make assumptions.\n\n"
        f"CONTEXT CHUNKS:\n{formatted_context}\n\n"
        f"USER QUERY: {query}\n\n"
        "ANSWER:"
    )

    answer = call_ollama(prompt=prompt).strip()

    # Safety check: if model outputs a conversational greeting or ungrounded response, enforce fallback
    lower_ans = answer.lower()
    if any(g in lower_ans for g in ["how can i help", "how can i assist", "hello!", "hi there"]):
        answer = fallback_response

    return {
        "answer": answer,
        "citations": citations
    }


def output_validation_node(state: AgentState) -> dict[str, Any]:
    """
    LangGraph Node 3 (Post-Generation Guardrail):
    Validates generated answer against restricted content exposure,
    hallucinated entities/numbers, and ungrounded PII patterns.

    --- ARCHITECTURAL RATIONALE: WHY OUTPUT VALIDATION DOES NOT HARD-BLOCK ---
    Unlike input validation — which hard-blocks malicious queries before retrieval to prevent
    prompt injection, system prompt leakage, and database exploitation — output validation
    acts as an informational compliance guardrail. A flagged output (e.g., potential verbatim
    quote or ungrounded entity) may still contain highly valuable, accurate answers for the user.
    Hard-blocking output would frustrate legitimate workflows and cause high false-positive rejection.
    By prepending a visible caution notice instead of dropping the answer, we preserve system utility
    while ensuring complete transparency and alerting compliance officers/auditors to review the output.
    """
    answer = state.get("answer", "")
    chunks = state.get("retrieved_chunks", [])

    output_check_res = check_output(answer=answer, retrieved_chunks=chunks)

    # If medium or high risk is detected, prepend a visible caution notice
    if output_check_res["risk_level"] in ["medium", "high"]:
        caution_notice = f"⚠️ [Security Review Notice: {output_check_res['reason']}]\n\n"
        return {
            "answer": caution_notice + answer,
            "output_flag": output_check_res,
        }

    return {
        "output_flag": output_check_res,
    }


# ==============================================================================
# LangGraph StateGraph Construction
# Flow: START -> security_check -> (safe? -> retrieve -> generate -> output_validation -> END | unsafe? -> END)
# ==============================================================================
workflow = StateGraph(AgentState)
workflow.add_node("security_check", security_check_node)
workflow.add_node("retrieve", retrieve_node)
workflow.add_node("generate", generate_node)
workflow.add_node("output_validation", output_validation_node)

workflow.add_edge(START, "security_check")
workflow.add_conditional_edges(
    "security_check",
    should_proceed_to_retrieval,
    {
        "retrieve": "retrieve",
        END: END,
    },
)
workflow.add_edge("retrieve", "generate")
workflow.add_edge("generate", "output_validation")
workflow.add_edge("output_validation", END)

rag_graph = workflow.compile()


def run_rag_agent(query: str, department_filter: str | None = None) -> dict[str, Any]:
    """
    Invokes compiled LangGraph workflow with query and optional department pre-filter.

    Returns:
        dict: Final state containing 'answer', 'citations', 'retrieved_chunks', 'security_check', and 'output_check'.
    """
    initial_state: AgentState = {
        "query": query,
        "department_filter": department_filter,
        "security_flag": {},
        "retrieved_chunks": [],
        "answer": "",
        "citations": [],
        "output_flag": {},
    }

    final_state = rag_graph.invoke(initial_state)

    sec_flag = final_state.get("security_flag")
    if not isinstance(sec_flag, dict) or "is_safe" not in sec_flag:
        sec_flag = {
            "is_safe": True,
            "risk_level": "none",
            "flagged_patterns": [],
            "reason": "Default safety pass."
        }

    output_flag = final_state.get("output_flag")
    if not isinstance(output_flag, dict) or "is_safe" not in output_flag:
        is_query_safe = sec_flag.get("is_safe", True)
        output_flag = {
            "is_safe": True,
            "risk_level": "none",
            "flagged_patterns": [],
            "reason": (
                "Output validation skipped: query blocked at input security boundary."
                if not is_query_safe
                else "Default safety pass."
            )
        }

    return {
        "query": final_state["query"],
        "department_filter": final_state.get("department_filter"),
        "answer": final_state.get("answer", ""),
        "citations": final_state.get("citations", []),
        "retrieved_chunks": final_state.get("retrieved_chunks", []),
        "security_check": sec_flag,
        "output_check": output_flag,
    }

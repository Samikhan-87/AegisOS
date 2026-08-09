"""
LangGraph RAG Agent with Grounded Generation and Citations for Aegis OS.

--- WHY THIS STEP MATTERS ---
1. Why Grounding & Strict Context Restriction Matters:
   Large Language Models (LLMs) are prone to "hallucinations" — generating plausible-sounding but unverified
   or inaccurate facts when drawing from open pre-trained parameters.
   By explicitly instructing the LLM: "Answer ONLY using the provided context. If the answer is not in the context,
   say you don't have that information. Do not use outside knowledge", we constrain the model's output exclusively
   to verified corporate documents stored in ChromaDB, eliminating ungrounded speculation.

2. Why Enterprise Citations Matter:
   In enterprise AI systems, answers without source attribution lack accountability. Returning exact document
   citations ({filename, department, chunk_index}) alongside the generated answer allows compliance officers,
   auditors, and business users to instantly verify, trace, and audit the AI's response back to the underlying
   source document and page/chunk.
"""

from typing import Any, Optional, TypedDict
from langgraph.graph import END, START, StateGraph
from app.agents.llm_client import call_ollama
from app.rag.hybrid_search import hybrid_search


class AgentState(TypedDict):
    """
    State container passed through the LangGraph RAG execution pipeline.
    """
    query: str
    department_filter: Optional[str]
    retrieved_chunks: list[dict[str, Any]]
    answer: str
    citations: list[dict[str, Any]]


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
    LangGraph Node 2: Formats retrieved context, calls local Ollama LLM with grounding instructions,
    and extracts source document citations.
    """
    query = state["query"]
    chunks = state.get("retrieved_chunks", [])

    fallback_response = "I don't have that information in the available documents."

    if not chunks:
        return {
            "answer": fallback_response,
            "citations": []
        }

    # Format context blocks and gather citations
    context_blocks: list[str] = []
    citations: list[dict[str, Any]] = []
    seen_citations: set[str] = set()

    for idx, chunk in enumerate(chunks, start=1):
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


# Construct two-node LangGraph StateGraph
workflow = StateGraph(AgentState)
workflow.add_node("retrieve", retrieve_node)
workflow.add_node("generate", generate_node)

workflow.add_edge(START, "retrieve")
workflow.add_edge("retrieve", "generate")
workflow.add_edge("generate", END)

rag_graph = workflow.compile()


def run_rag_agent(query: str, department_filter: str | None = None) -> dict[str, Any]:
    """
    Invokes compiled LangGraph workflow with query and optional department pre-filter.

    Returns:
        dict: Final state containing 'answer', 'citations', and 'retrieved_chunks'.
    """
    initial_state: AgentState = {
        "query": query,
        "department_filter": department_filter,
        "retrieved_chunks": [],
        "answer": "",
        "citations": []
    }

    final_state = rag_graph.invoke(initial_state)

    return {
        "query": final_state["query"],
        "department_filter": final_state.get("department_filter"),
        "answer": final_state.get("answer", ""),
        "citations": final_state.get("citations", []),
        "retrieved_chunks": final_state.get("retrieved_chunks", [])
    }

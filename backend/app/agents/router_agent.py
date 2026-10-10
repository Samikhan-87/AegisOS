"""
Router/Orchestrator Agent for Aegis OS.

==============================================================================
ARCHITECTURAL PURPOSE & DESIGN RATIONALE
==============================================================================
1. Central Orchestration & Decoupling:
   This router serves as the single, unified entry point (/api/v1/agents/ask)
   for user inquiries across the Aegis OS platform. Rather than requiring the
   client/frontend to possess knowledge of which specialized agent can service
   a given task, incoming queries flow into this Router Agent. The router
   evaluates intent and dynamically dispatches work to the correct specialized
   downstream graph (e.g., RAG Retriever, Coding Agent, Calendar Agent, etc.).
   This architecture keeps user-facing interfaces and downstream agents completely
   decoupled from internal dispatching mechanics.

2. Intent Classification Strategy:
   - Current State (Rule-Based): With 'RAG Retriever' currently functioning as
     the primary capability, intent classification is intentionally rule-based
     and lightweight (~0.1ms latency, zero token overhead).
   - Future Evolution: As additional specialized sub-graphs are introduced (e.g.,
     Code Generator, Meeting Assistant, SQL Analyst), this classifier is designed
     to seamlessly scale into either a more comprehensive semantic rule engine
     or an LLM-powered zero-shot intent classifier.

3. Nested Graph Composition (Sub-Graphs):
   The existing LangGraph workflow compiled in `rag_agent.py` (which includes
   Node 0 Security Auditor, Hybrid Retrieval, Grounded LLM Generation, and
   Post-Generation Output Guardrails) is invoked as a nested sub-graph without
   duplication or reimplementation.
==============================================================================
"""

import logging
import re
from typing import Any, Dict, List, Optional, Pattern, TypedDict

from langgraph.graph import END, START, StateGraph

from app.agents.rag_agent import rag_graph

logger = logging.getLogger(__name__)


# ==============================================================================
# ROUTER STATE DEFINITION
# ==============================================================================
class RouterState(TypedDict):
    """
    State container passed through the top-level Router/Orchestrator graph.
    """
    query: str
    department_filter: Optional[str]
    routed_to: str
    security_flag: dict[str, Any]
    retrieved_chunks: list[dict[str, Any]]
    answer: str
    citations: list[dict[str, Any]]
    output_flag: dict[str, Any]


# ==============================================================================
# UNSUPPORTED CAPABILITY PATTERNS
# ==============================================================================
# Patterns clearly denoting requests that cannot currently be fulfilled by
# the document knowledge base agent (e.g., code generation, calendar, email actions).
UNSUPPORTED_INTENT_PATTERNS: Dict[str, List[str]] = {
    "coding": [
        r"\b(write|generate|create|build|debug|refactor|fix)\s+(some\s+)?(code|script|program|app|function|class|algorithm)\b",
        r"\bcode\s+(for\s+me|this|a\s+solution)\b",
        r"\bwrite\s+(a\s+)?(python|javascript|typescript|java|c\+\+|rust|html|css|sql|bash)\s+(script|function|program|code)\b",
        r"\bwrite\s+code\b",
    ],
    "calendar": [
        r"\b(check|show|view|open)\s+(my\s+)?calendar\b",
        r"\b(schedule|book|set\s+up|create)\s+(a\s+)?(meeting|appointment|call|event|reminder)\b",
        r"\bwhat('s|\s+is)\s+on\s+my\s+(calendar|schedule)\b",
        r"\b(reschedule|cancel)\s+(the|my)?\s*(meeting|appointment)\b",
    ],
    "email": [
        r"\b(send|draft|compose|write)\s+(an?\s+)?email\b",
        r"\bemail\s+to\s+\w+\b",
        r"\b(check|read)\s+(my\s+)?(inbox|emails?)\b",
        r"\bsend\s+(a\s+)?(message|slack|dm)\s+to\b",
    ],
}

COMPILED_UNSUPPORTED_PATTERNS: Dict[str, List[Pattern[str]]] = {
    category: [re.compile(pattern, re.IGNORECASE) for pattern in patterns]
    for category, patterns in UNSUPPORTED_INTENT_PATTERNS.items()
}


# ==============================================================================
# INTENT CLASSIFICATION FUNCTION
# ==============================================================================
def classify_intent(query: str) -> str:
    """
    Evaluates incoming query string and assigns target agent destination.

    NOTE ON IMPLEMENTATION:
    This function is intentionally rule-based and lightweight for now because
    RAG Retriever is currently the sole functional specialized agent. When more
    specialized agents exist (coding, calendar, task automation), this function
    should evolve into either an expanded rule/regex hierarchy or a low-latency
    LLM/embedding-based intent classifier.

    Returns:
        str: "rag_retriever" | "not_supported"
    """
    if not query or not query.strip():
        return "rag_retriever"

    normalized_query = query.strip()

    # Match against known unsupported domains (e.g. code generation, calendar scheduling, emailing)
    for category, patterns in COMPILED_UNSUPPORTED_PATTERNS.items():
        for pattern in patterns:
            if pattern.search(normalized_query):
                logger.info(
                    "Router intent classification: query matched unsupported domain '%s'.",
                    category,
                )
                return "not_supported"

    # Default route: General enterprise document knowledge base query
    return "rag_retriever"


# ==============================================================================
# LANGGRAPH ROUTER NODES
# ==============================================================================
def route_node(state: RouterState) -> dict[str, Any]:
    """
    LangGraph Node: Examines incoming query and assigns 'routed_to'.
    """
    query = state.get("query", "")
    target_agent = classify_intent(query)
    return {"routed_to": target_agent}


def route_decision(state: RouterState) -> str:
    """
    Conditional routing edge evaluator based on 'routed_to'.
    """
    return state.get("routed_to", "rag_retriever")


def rag_retriever_node(state: RouterState) -> dict[str, Any]:
    """
    LangGraph Node: Reuses and invokes the existing compiled RAG agent sub-graph.
    Carries out the full Security Auditor -> Hybrid Retrieval -> Ollama Generation -> Output Guardrail workflow.
    """
    rag_input = {
        "query": state["query"],
        "department_filter": state.get("department_filter"),
        "security_flag": state.get("security_flag") or {},
        "retrieved_chunks": state.get("retrieved_chunks") or [],
        "answer": state.get("answer", ""),
        "citations": state.get("citations") or [],
        "output_flag": state.get("output_flag") or {},
    }

    rag_output = rag_graph.invoke(rag_input)

    return {
        "answer": rag_output.get("answer", ""),
        "citations": rag_output.get("citations", []),
        "retrieved_chunks": rag_output.get("retrieved_chunks", []),
        "security_flag": rag_output.get("security_flag", {}),
        "output_flag": rag_output.get("output_flag", {}),
    }


def not_supported_node(state: RouterState) -> dict[str, Any]:
    """
    LangGraph Node: Fallback handler for intents currently unsupported by any agent.
    """
    return {
        "answer": (
            "I don't have an agent that can help with that yet. "
            "Currently I can answer questions from our document knowledge base."
        ),
        "citations": [],
        "retrieved_chunks": [],
        "security_flag": {
            "is_safe": True,
            "risk_level": "none",
            "flagged_patterns": [],
            "reason": "Request routed to unsupported capability handler.",
        },
        "output_flag": {
            "is_safe": True,
            "risk_level": "none",
            "flagged_patterns": [],
            "reason": "Default safety pass for unsupported intent response.",
        },
    }


# ==============================================================================
# TOP-LEVEL ROUTER GRAPH CONSTRUCTION
# START -> route_node -> (conditional edge: rag_retriever | not_supported) -> END
# ==============================================================================
router_workflow = StateGraph(RouterState)
router_workflow.add_node("route", route_node)
router_workflow.add_node("rag_retriever", rag_retriever_node)
router_workflow.add_node("not_supported", not_supported_node)

router_workflow.add_edge(START, "route")
router_workflow.add_conditional_edges(
    "route",
    route_decision,
    {
        "rag_retriever": "rag_retriever",
        "not_supported": "not_supported",
    },
)
router_workflow.add_edge("rag_retriever", END)
router_workflow.add_edge("not_supported", END)

router_graph = router_workflow.compile()


# ==============================================================================
# PUBLIC EXECUTION ENTRY POINT
# ==============================================================================
def run_router_agent(query: str, department_filter: str | None = None) -> dict[str, Any]:
    """
    Invokes the Router/Orchestrator workflow.

    Args:
        query: Incoming user prompt or question.
        department_filter: Optional ChromaDB/BM25 department pre-filter.

    Returns:
        dict: Standardized payload containing 'routed_to', 'answer', 'citations',
              'retrieved_chunks', 'security_check', and 'output_check'.
    """
    initial_state: RouterState = {
        "query": query,
        "department_filter": department_filter,
        "routed_to": "rag_retriever",
        "security_flag": {},
        "retrieved_chunks": [],
        "answer": "",
        "citations": [],
        "output_flag": {},
    }

    final_state = router_graph.invoke(initial_state)

    sec_flag = final_state.get("security_flag")
    if not isinstance(sec_flag, dict) or "is_safe" not in sec_flag:
        sec_flag = {
            "is_safe": True,
            "risk_level": "none",
            "flagged_patterns": [],
            "reason": "Default safety pass.",
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
            ),
        }

    return {
        "query": final_state["query"],
        "department_filter": final_state.get("department_filter"),
        "routed_to": final_state.get("routed_to", "rag_retriever"),
        "answer": final_state.get("answer", ""),
        "citations": final_state.get("citations", []),
        "retrieved_chunks": final_state.get("retrieved_chunks", []),
        "security_check": sec_flag,
        "output_check": output_flag,
    }

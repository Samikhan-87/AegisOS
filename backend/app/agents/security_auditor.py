"""
Security Auditor - Rule-Based Input Validation & Prompt Injection Defense for Aegis OS.

--- ARCHITECTURAL RATIONALE: WHY INPUT VALIDATION MUST RUN BEFORE RETRIEVAL ---
1. Why Pre-Retrieval Validation is Critical:
   Running security checks BEFORE vector/BM25 retrieval protects both the retrieval engine
   and the downstream generator. If a malicious or adversarial query is permitted into the
   retrieval stage, it can:
     a) Manipulate vector similarity search to surface sensitive corporate documents (data exfiltration).
     b) Poison the retrieved context window with adversarial keywords, confusing the LLM ranker.
     c) Exploit prompt injection vulnerabilities to override the system instructions and leak
        system prompts or execute jailbreaks.
   By halting malicious queries at the boundary, we prevent wasted compute, protect vector database
   integrity, and ensure zero attack surface exposure for downstream LLM generation.

2. Why a Deterministic Rule-Based First Layer?:
   - Zero Added Latency (~0.1ms execution time vs 5-15 seconds for an LLM call on CPU).
   - 100% Deterministic: Known attack signatures (DAN mode, "ignore previous instructions", SQL drops)
     are stopped reliably without risk of LLM non-determinism or temperature variance.
   - Foundation for Defense-in-Depth: An LLM-based semantic guardrail or embedding-based classifier
     can be layered on top later for subtle nuances, but a fast rule-based filter is the essential
     first line of defense in enterprise security architecture.
"""

import re
from typing import Any, Dict, List, Pattern


# ==============================================================================
# EXTENSIBLE PATTERN DEFINITIONS
# Structured by threat category with assigned severity levels
# ==============================================================================

SECURITY_PATTERNS: Dict[str, Dict[str, Any]] = {
    "prompt_injection": {
        "severity": "high",
        "description": "Attempt to override or hijack system instructions",
        "patterns": [
            r"ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|rules?|prompts?|guidelines?)",
            r"disregard\s+(all\s+)?(the\s+)?(previous|prior|above)",
            r"new\s+instructions?\s*:",
            r"you\s+are\s+now\s+(a|an|in)?",
            r"act\s+as\s+if\s+you",
            r"forget\s+(all\s+)?(previous\s+instructions|everything)",
            r"override\s+(all\s+)?(system\s+)?(instructions?|rules?)",
            r"system\s+prompt\s*:",
            r"system\s+override",
            r"start\s+acting\s+as",
            r"from\s+now\s+on\s+you\s+are",
        ],
    },
    "jailbreak": {
        "severity": "high",
        "description": "Attempt to bypass safety guardrails or enter unrestricted mode",
        "patterns": [
            r"\bdan\s+mode\b",
            r"\bdeveloper\s+mode\b",
            r"no\s+restrictions?",
            r"pretend\s+you\s+have\s+no\s+(guidelines|rules|filters)",
            r"hypothetically,\s*without\s+any\s+rules",
            r"bypass\s+(all\s+)?(safety|content)\s+filters?",
            r"\bjailbreak\b",
            r"unfiltered\s+mode",
            r"unrestricted\s+ai",
        ],
    },
    "system_extraction": {
        "severity": "high",
        "description": "Attempt to extract confidential system prompt or internal configuration",
        "patterns": [
            r"repeat\s+(all\s+)?(your\s+)?instructions?",
            r"what\s+is\s+your\s+system\s+prompt",
            r"print\s+(your\s+)?(system\s+)?prompt",
            r"reveal\s+(your\s+)?(internal\s+)?configuration",
            r"show\s+(your\s+)?(initial\s+)?(system\s+)?prompt",
            r"dump\s+(your\s+)?(system\s+)?prompt",
            r"output\s+initial\s+prompt",
            r"verbatim\s+system\s+prompt",
        ],
    },
    "basic_injection": {
        "severity": "high",
        "description": "Suspicious code, script tags, or SQL injection payloads",
        "patterns": [
            r"<\s*script[^>]*>",
            r"javascript\s*:",
            r"['\"];\s*drop\s+table",
            r"\bunion\s+select\b",
            r"\bexec(\s+|\()",
            r"'\s*or\s+'?1'?\s*=\s*'?1",
            r"--\s*$",
        ],
    },
}

# Pre-compile regular expressions at module import for maximum execution speed
COMPILED_PATTERNS: Dict[str, List[Pattern[str]]] = {
    category: [re.compile(p, re.IGNORECASE) for p in data["patterns"]]
    for category, data in SECURITY_PATTERNS.items()
}


def check_input(query: str) -> Dict[str, Any]:
    """
    Validates incoming user query against prompt injection, jailbreak,
    system prompt extraction, and code injection attack patterns.

    Args:
        query: Raw user prompt string.

    Returns:
        dict: {
            "is_safe": bool,
            "risk_level": "none" | "low" | "medium" | "high",
            "flagged_patterns": list[str],
            "reason": str
        }
    """
    if not query or not query.strip():
        return {
            "is_safe": True,
            "risk_level": "none",
            "flagged_patterns": [],
            "reason": "Empty query passed validation."
        }

    normalized_query = query.strip()
    flagged_categories: List[str] = []
    matched_descriptions: List[str] = []

    for category, patterns in COMPILED_PATTERNS.items():
        cat_info = SECURITY_PATTERNS[category]
        for pattern in patterns:
            if pattern.search(normalized_query):
                flagged_categories.append(category)
                matched_descriptions.append(f"{category}: {cat_info['description']}")
                break  # Record category once per match

    # Determine risk level and safety verdict
    if not flagged_categories:
        return {
            "is_safe": True,
            "risk_level": "none",
            "flagged_patterns": [],
            "reason": "Input passed all rule-based security validation checks."
        }

    # Evaluate severity based on matched categories
    has_high_severity = any(
        SECURITY_PATTERNS[cat]["severity"] == "high" for cat in flagged_categories
    )

    if has_high_severity:
        risk_level = "high"
        is_safe = False
        reason = (
            f"High-risk pattern detected ({', '.join(flagged_categories)}). "
            "Potential prompt injection or adversarial attempt."
        )
    elif len(flagged_categories) > 1:
        risk_level = "medium"
        is_safe = False
        reason = f"Multiple suspicious patterns detected ({', '.join(flagged_categories)})."
    else:
        risk_level = "low"
        is_safe = True
        reason = f"Low-risk pattern detected ({', '.join(flagged_categories)})."

    return {
        "is_safe": is_safe,
        "risk_level": risk_level,
        "flagged_patterns": matched_descriptions,
        "reason": reason,
    }

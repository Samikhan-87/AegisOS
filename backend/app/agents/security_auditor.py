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
    "credential_harvesting": {
        "severity": "high",
        "description": "Attempt to extract passwords, credentials, secrets, or authentication tokens",
        "patterns": [
            r"^\s*(passwords?|passcodes?|creds?|credentials?|secret\s+keys?|api\s+keys?)\s*[\?\.\!]?\s*$",
            r"\b(tell|give|share|reveal|show|find|get|lookup|look\s*up|print|dump|extract|provide|fetch|list|display|what('s|\s+is))\b.*?\b(passwords?|passcodes?|creds?|credentials?|secret\s+keys?|api\s+keys?|private\s+keys?|auth\s+tokens?|access\s+tokens?)\b",
            r"\b(passwords?|passcodes?|credentials?|logins?)\s+(for|of|to|in)\b",
            r"\b\w+('s)?\s+(passwords?|credentials?|passcodes?)\b",
            r"\b(employee|user|admin|root|staff|account|personnel)\s+(passwords?|credentials?|secrets?|logins?)\b",
            r"\b(password|credential|secret)\s+of\s+(the\s+)?(user|employee|admin|personnel|staff)\b",
            r"\b(wifi|wi-fi|database|db|ssh|ftp|vpn|server|router|email|aws|azure|cloud|ldap|active\s+directory)\s+(passwords?|credentials?|secrets?|keys?)\b",
            r"\b(details?|info|information)\s+(about|of|on|for)\s+.*?\b(passwords?|credentials?|secrets?)\b",
            r"\b(passwords?|credentials?)\s+.*?\b(details?|info|information)\b",
            r"\bprivate\s+keys?\b",
            r"\bsecret\s+tokens?\b",
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
    system prompt extraction, code injection, and credential harvesting patterns.

    Args:
        query: Raw user prompt string.

    Returns:
        dict: {
            "is_safe": bool,
            "risk_level": "none" | "low" | "medium" | "high",
            "flagged_categories": list[str],
            "flagged_patterns": list[str],
            "reason": str
        }
    """
    if not query or not query.strip():
        return {
            "is_safe": True,
            "risk_level": "none",
            "flagged_categories": [],
            "flagged_patterns": [],
            "reason": "Empty query passed validation."
        }

    normalized_query = query.strip()
    flagged_categories: List[str] = []
    matched_descriptions: List[str] = []

    # Check for benign policy inquiries (e.g. "What is the password policy?", "How do I reset my password?")
    is_policy_inquiry = bool(re.search(
        r"\b(policy|policies|guidelines?|rules?|requirements?|procedure|how\s+(do\s+i|can\s+i|to)\s+(reset|change|update|recover)|forgot(\s+my)?|reset\s+(my\s+)?password|change\s+(my\s+)?password|expire|expiration)\b",
        normalized_query,
        re.IGNORECASE,
    ))

    for category, patterns in COMPILED_PATTERNS.items():
        cat_info = SECURITY_PATTERNS[category]
        for pattern in patterns:
            if pattern.search(normalized_query):
                # If asking about benign company policies or reset procedures, do not flag as credential harvesting
                if category == "credential_harvesting" and is_policy_inquiry:
                    continue
                flagged_categories.append(category)
                matched_descriptions.append(f"{category}: {cat_info['description']}")
                break  # Record category once per match

    # Determine risk level and safety verdict
    if not flagged_categories:
        return {
            "is_safe": True,
            "risk_level": "none",
            "flagged_categories": [],
            "flagged_patterns": [],
            "reason": "Input passed all rule-based security validation checks."
        }

    # Evaluate severity based on matched categories
    has_high_severity = any(
        SECURITY_PATTERNS[cat]["severity"] == "high" for cat in flagged_categories
    )

    if "credential_harvesting" in flagged_categories:
        risk_level = "high"
        is_safe = False
        reason = (
            "Credential harvesting detected: In accordance with Aegis OS enterprise security policies, "
            "employee passwords, credentials, and authentication secrets cannot be retrieved or disclosed."
        )
    elif has_high_severity:
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
        "flagged_categories": flagged_categories,
        "flagged_patterns": matched_descriptions,
        "reason": reason,
    }


# ==============================================================================
# POST-GENERATION OUTPUT AUDITING GUARDRAIL
# ==============================================================================
# --- ARCHITECTURAL RATIONALE: WHY OUTPUT VALIDATION DOES NOT HARD-BLOCK ---
# Unlike input validation — which hard-blocks malicious queries before retrieval to prevent
# prompt injection, system prompt leakage, and database exploitation — output validation
# acts as an informational compliance guardrail. A flagged output (e.g., potential verbatim
# quote or ungrounded entity) may still contain highly valuable, accurate answers for the user.
# Hard-blocking output would frustrate legitimate workflows and cause high false-positive rejection.
# By prepending a visible caution notice instead of dropping the answer, we preserve system utility
# while ensuring complete transparency and alerting compliance officers/auditors to review the output.
# Consistent with check_input(), this output layer remains 100% rule-based, deterministic,
# and lightning fast (<1ms execution time) with zero added LLM latency.

PII_PATTERNS: Dict[str, Pattern[str]] = {
    "email": re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b", re.IGNORECASE),
    "phone": re.compile(r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"),
    "ssn": re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
    "credit_card": re.compile(r"\b(?:\d{4}[-\s]?){3}\d{4}\b"),
}


def _find_verbatim_sequence(text_a: str, text_b: str, min_words: int = 15) -> bool:
    """
    Checks if text_a contains any contiguous sequence of `min_words` or more
    that appears verbatim in text_b.
    """
    words_a = re.findall(r"\b\w+\b", text_a.lower())
    words_b = re.findall(r"\b\w+\b", text_b.lower())

    if len(words_a) < min_words or len(words_b) < min_words:
        return False

    # Build lookup set of consecutive n-grams from text_b
    target_ngrams = set(
        tuple(words_b[i : i + min_words])
        for i in range(len(words_b) - min_words + 1)
    )

    for i in range(len(words_a) - min_words + 1):
        if tuple(words_a[i : i + min_words]) in target_ngrams:
            return True

    return False


def _is_chunk_classified(
    chunk: Dict[str, Any], classification_levels: List[str] | None = None
) -> bool:
    """
    Determines if a retrieved chunk is marked as confidential or restricted.
    """
    meta = chunk.get("metadata") or {}
    text = chunk.get("text", "")

    # Check metadata classification / sensitivity tags
    classification = str(meta.get("classification", "")).lower()
    sensitivity = str(meta.get("sensitivity", "")).lower()

    if classification_levels:
        for level in classification_levels:
            lvl_lower = level.lower()
            if lvl_lower in classification or lvl_lower in sensitivity:
                return True

    if any(c in classification for c in ["restricted", "confidential", "secret", "internal only"]):
        return True
    if any(s in sensitivity for s in ["high", "restricted", "confidential"]):
        return True

    # Check raw text markers
    lower_text = text.lower()
    classified_markers = [
        "classification restricted",
        "classification: restricted",
        "classification confidential",
        "classification: confidential",
        "strictly confidential",
        "confidential and proprietary",
    ]
    return any(marker in lower_text for marker in classified_markers)


def _check_hallucinated_entities(answer: str, chunks_text: str) -> List[str]:
    """
    Heuristic check for specific claims (document IDs, numbers, monetary amounts,
    or percentages) in the answer that do not appear anywhere in retrieved chunks.
    """
    # Fallback response is never a hallucination
    if "i don't have that information" in answer.lower():
        return []

    lower_chunks = chunks_text.lower()
    unverified: List[str] = []

    # 1. Document ID patterns (e.g. AB-CS-004, AB-AI-001)
    doc_ids = re.findall(r"\bAB-[A-Z]{2,4}-\d{3,4}\b", answer, flags=re.IGNORECASE)
    for doc_id in doc_ids:
        if doc_id.lower() not in lower_chunks:
            unverified.append(f"document ID '{doc_id}'")

    # 2. Specific Currency Amounts (e.g. $10,000, $500, $25.50)
    amounts = re.findall(r"\$\d[\d,]*(?:\.\d+)?", answer)
    for amt in amounts:
        raw_num = amt.replace("$", "").replace(",", "")
        if amt.lower() not in lower_chunks and raw_num not in lower_chunks:
            unverified.append(f"monetary amount '{amt}'")

    # 3. Specific Percentages (e.g. 25%, 99.9%)
    percentages = re.findall(r"\b\d+(?:\.\d+)?%", answer)
    for pct in percentages:
        if pct.lower() not in lower_chunks:
            unverified.append(f"percentage '{pct}'")

    # 4. Multi-digit numbers (>= 3 digits) or specific year numbers
    numbers = re.findall(r"\b(?:19|20)\d{2}\b|\b\d{3,}\b", answer)
    for num in numbers:
        if num not in lower_chunks:
            unverified.append(f"number/year '{num}'")

    return unverified


def _check_unverified_pii(answer: str, chunks_text: str) -> List[str]:
    """
    Detects phone numbers, emails, or SSN/card ID numbers in the answer
    that were NOT present in retrieved chunks (meaning the LLM invented them).
    """
    lower_chunks = chunks_text.lower()
    unverified: List[str] = []

    for pii_type, pattern in PII_PATTERNS.items():
        matches = pattern.findall(answer)
        for match in matches:
            if match.lower() not in lower_chunks:
                unverified.append(f"{pii_type} '{match}'")

    return unverified


def check_output(
    answer: str,
    retrieved_chunks: List[Dict[str, Any]],
    classification_levels: List[str] | None = None,
) -> Dict[str, Any]:
    """
    Validates LLM-generated answer BEFORE returning to user:
    1. Check 1 - Restricted content exposure (large verbatim quotes from classified chunks).
    2. Check 2 - Basic hallucination heuristic (unverified numbers/dates/entities).
    3. Check 3 - Basic PII pattern check (invented phone, email, SSN/card numbers).

    Args:
        answer: Text generated by the LLM.
        retrieved_chunks: Raw chunks fetched during retrieval.
        classification_levels: Optional list of classification strings to treat as confidential.

    Returns:
        dict: {
            "is_safe": bool,
            "risk_level": "none" | "low" | "medium" | "high",
            "flagged_patterns": list[str],
            "reason": str
        }
    """
    if not answer or not answer.strip():
        return {
            "is_safe": True,
            "risk_level": "none",
            "flagged_patterns": [],
            "reason": "Empty answer passed validation.",
        }

    flagged_patterns: List[str] = []
    reasons: List[str] = []
    risk_levels: List[str] = []

    # Combined chunks text for grounding checks
    combined_chunks_text = " ".join([c.get("text", "") for c in retrieved_chunks or []])

    # --------------------------------------------------------------------------
    # Check 1: Restricted / Confidential Content Exposure
    # --------------------------------------------------------------------------
    for chunk in retrieved_chunks or []:
        if _is_chunk_classified(chunk, classification_levels):
            chunk_text = chunk.get("text", "")
            if _find_verbatim_sequence(answer, chunk_text, min_words=15):
                flagged_patterns.append(
                    "restricted_content_exposure: Verbatim text quoted from classified document"
                )
                reasons.append("Response may expose restricted/confidential document content verbatim")
                risk_levels.append("medium")
                break

    # --------------------------------------------------------------------------
    # Check 3: Basic PII Pattern Check (Synthetic or Leaked PII)
    # --------------------------------------------------------------------------
    unverified_pii = _check_unverified_pii(answer, combined_chunks_text)
    if unverified_pii:
        flagged_patterns.append(
            f"ungrounded_pii_pattern: {', '.join(unverified_pii[:3])}"
        )
        reasons.append(
            "Response contains ungrounded PII patterns (phone, email, or identification number) not present in source documents"
        )
        risk_levels.append("medium")

    # --------------------------------------------------------------------------
    # Check 2: Basic Hallucination Heuristic (Unverified Numbers, Dates, IDs)
    # --------------------------------------------------------------------------
    unverified_entities = _check_hallucinated_entities(answer, combined_chunks_text)
    if unverified_entities:
        flagged_patterns.append(
            f"unverified_entity_claim: {', '.join(unverified_entities[:3])}"
        )
        reasons.append("Response may contain details not found in retrieved context")
        risk_levels.append("low")

    # --------------------------------------------------------------------------
    # Risk Aggregation
    # --------------------------------------------------------------------------
    if not risk_levels:
        return {
            "is_safe": True,
            "risk_level": "none",
            "flagged_patterns": [],
            "reason": "Output passed all rule-based security and grounding checks.",
        }

    if "high" in risk_levels or risk_levels.count("medium") > 1:
        risk_level = "high"
        is_safe = False
    elif "medium" in risk_levels:
        risk_level = "medium"
        is_safe = False
    else:
        risk_level = "low"
        is_safe = True

    # Deduplicate reason strings
    deduped_reasons = list(dict.fromkeys(reasons))
    final_reason = "; ".join(deduped_reasons)

    return {
        "is_safe": is_safe,
        "risk_level": risk_level,
        "flagged_patterns": flagged_patterns,
        "reason": final_reason,
    }


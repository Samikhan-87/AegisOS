"""
Hybrid Search with Reciprocal Rank Fusion (RRF) for Aegis OS RAG Pipeline.

--- WHY THIS STEP MATTERS ---
1. Why Hybrid Search?:
   Dense vector search excels at conceptual and semantic similarity ("what are privacy rules"),
   while BM25 excels at exact keyword and identifier matching ("GDPR Article 17").
   Combining both ensures maximum recall and precision across all query types.

2. Why Reciprocal Rank Fusion (RRF) over Raw Score Averaging?:
   Raw cosine similarity scores fall in [0.0, 1.0], whereas raw BM25 scores fall in [0.0, +infinity)
   and vary depending on document length and term frequency.
   Directly adding or averaging raw scores would cause BM25 to dominate or skew vector scores.
   RRF (Reciprocal Rank Fusion) replaces raw scores with their relative ordinal ranks:

   RRF_Score(doc) = 1 / (60 + rank_vector) + 1 / (60 + rank_bm25)

   where k=60 is a standard empirical constant. This rank-based fusion is scale-invariant,
   robust to score distribution differences, and ensures balanced hybrid ranking.

3. Why Deterministic Exact-ID Match Override Layer Matters:
   RRF and weighted fusion are probabilistic ranking approaches. They calculate composite
   ranks across vector and keyword spaces, which may not always surface highly specific,
   low-ambiguity queries (like exact document IDs: AB-CS-004, AB-AI-004) with 100% reliability
   into the top_k cut. This deterministic pattern-match layer acts as a safety net for
   high-precision document ID lookups.
"""

import logging
import re
from typing import Any
from app.rag.bm25_index import bm25_search
from app.rag.embedder import generate_embeddings
from app.rag.vectorstore import query_store

logger = logging.getLogger(__name__)
RRF_K = 60

# Regex matching Aegis Bank document IDs (e.g. AB-CS-004, AB-AI-004, AB-HR-001)
DOC_ID_REGEX = re.compile(r"\bAB-[A-Z]{2,4}-\d{3}\b", re.IGNORECASE)


def detect_document_id(query: str) -> str | None:
    """
    Detects if the query contains a specific document ID pattern (e.g. AB-CS-004, AB-AI-004).

    Args:
        query (str): Natural language query string.

    Returns:
        str | None: Uppercase document ID string if matched, else None.
    """
    match = DOC_ID_REGEX.search(query)
    return match.group(0).upper() if match else None


def hybrid_search(
    query: str,
    top_k: int = 5,
    department_filter: str | None = None,
    alpha: float = 0.5,
    candidate_k: int = 50,
) -> list[dict[str, Any]]:
    """
    Executes hybrid search combining dense vector search and BM25 keyword search using RRF.
    Applies deterministic exact-ID match override layer when document IDs are present in the query.

    Args:
        query (str): Natural language search query.
        top_k (int): Number of top matches to return (default: 5).
        department_filter (str | None): Optional department pre-filter.
        alpha (float): Fusion weighting factor (default: 0.5).
        candidate_k (int): Number of candidates to retrieve from each retriever before fusion (default: 50).

    Returns:
        list[dict]: Ranked list containing text, metadata, vector_score, bm25_score, fused_rrf_score, and exact_id_match.
    """
    # Detect if query references an exact document ID (e.g. AB-CS-004)
    detected_doc_id = detect_document_id(query)

    # 1. Dense Vector Search
    query_chunk = [{"text": query, "metadata": {}}]
    embedded_query = generate_embeddings(query_chunk)
    query_vector = embedded_query[0]["embedding"] if embedded_query else []

    vector_results = (
        query_store(query_vector, top_k=candidate_k, department_filter=department_filter)
        if query_vector
        else []
    )

    # 2. BM25 Keyword Search (with department pre-filter)
    bm25_results = bm25_search(query, top_k=candidate_k, department_filter=department_filter)

    # DEBUG LOG: Print raw candidates BEFORE fusion
    logger.info(
        f"[HYBRID SEARCH DEBUG] Query: '{query}' | Detected Doc ID: {detected_doc_id} | Candidate Pool Depth: {candidate_k}\n"
        f"  Raw Vector Candidates ({len(vector_results)}): "
        f"{[{'file': r['metadata'].get('source_filename'), 'chunk': r['metadata'].get('chunk_index'), 'score': r.get('similarity_score')} for r in vector_results[:5]]}\n"
        f"  Raw BM25 Candidates ({len(bm25_results)}): "
        f"{[{'file': r['metadata'].get('source_filename'), 'chunk': r['metadata'].get('chunk_index'), 'score': r.get('bm25_score')} for r in bm25_results[:5]]}"
    )

    # 3. Reciprocal Rank Fusion (RRF) with keyword confidence signal weighting
    fused_scores: dict[str, float] = {}
    record_map: dict[str, dict[str, Any]] = {}
    vector_score_map: dict[str, float] = {}
    bm25_score_map: dict[str, float] = {}

    # Process Vector Ranks (1-indexed)
    for rank, item in enumerate(vector_results, start=1):
        key = _get_chunk_key(item)
        record_map[key] = item
        vector_score_map[key] = item.get("similarity_score", 0.0)
        fused_scores[key] = fused_scores.get(key, 0.0) + (1.0 / (RRF_K + rank))

    # Process BM25 Ranks (1-indexed) with keyword match strength scaling
    for rank, item in enumerate(bm25_results, start=1):
        key = _get_chunk_key(item)
        if key not in record_map:
            record_map[key] = item
        bm25_score = item.get("bm25_score", 0.0)
        bm25_score_map[key] = bm25_score

        # Exact keyword match strength multiplier (boosts high-confidence identifier matches)
        bm25_weight = 1.0 + min(bm25_score / 10.0, 1.5)
        fused_scores[key] = fused_scores.get(key, 0.0) + (1.0 / (RRF_K + rank)) * bm25_weight

    # Combine into candidate records
    combined_results: list[dict[str, Any]] = []
    for key, rrf_score in fused_scores.items():
        rec = record_map[key]
        text_content = rec["text"]
        meta = rec["metadata"] or {}
        filename = meta.get("source_filename") or meta.get("filename") or ""

        # Check if candidate chunk contains the exact detected document ID
        is_exact_id_match = False
        if detected_doc_id:
            if detected_doc_id in text_content.upper() or detected_doc_id in filename.upper():
                is_exact_id_match = True

        combined_results.append({
            "text": text_content,
            "metadata": meta,
            "vector_score": vector_score_map.get(key, 0.0),
            "bm25_score": bm25_score_map.get(key, 0.0),
            "fused_rrf_score": round(rrf_score, 6),
            "exact_id_match": is_exact_id_match,
        })

    # Sort descending by fused RRF score
    combined_results.sort(key=lambda x: x["fused_rrf_score"], reverse=True)

    # --- DETERMINISTIC EXACT-ID MATCH OVERRIDE LAYER ---
    # Why this step matters:
    # RRF and weighted fusion are probabilistic ranking approaches. They calculate composite
    # ranks across vector and keyword spaces, which may not always surface highly specific,
    # low-ambiguity queries (like exact document IDs: AB-CS-004, AB-AI-004) with 100% reliability
    # into the top_k cut. This deterministic pattern-match layer acts as a safety net for
    # high-precision document ID lookups.
    if detected_doc_id:
        exact_id_matches = [r for r in combined_results if r["exact_id_match"]]
        other_matches = [r for r in combined_results if not r["exact_id_match"]]

        if exact_id_matches:
            logger.info(
                f"[HYBRID SEARCH OVERRIDE] Deterministic exact ID match '{detected_doc_id}' "
                f"triggered! Surfacing {len(exact_id_matches)} exact match chunk(s) to top results."
            )
            # Place exact ID matches first, then fill remaining slots with top RRF ranked items
            final_list = exact_id_matches + other_matches
            top_results = final_list[:top_k]
        else:
            top_results = combined_results[:top_k]
    else:
        top_results = combined_results[:top_k]

    # DEBUG LOG: Print fused top results
    logger.info(
        f"[HYBRID SEARCH DEBUG] Top {top_k} Fused Results (ID Match Active: {bool(detected_doc_id)}):\n"
        f"{[{'file': r['metadata'].get('source_filename'), 'rrf_score': r['fused_rrf_score'], 'exact_id_match': r['exact_id_match'], 'bm25': r['bm25_score']} for r in top_results]}"
    )

    return top_results


def _get_chunk_key(item: dict[str, Any]) -> str:
    """Helper to generate a unique key for a chunk across vector and BM25 result sets."""
    meta = item.get("metadata") or {}
    source = meta.get("source_filename") or meta.get("filename") or "doc"
    chunk_idx = meta.get("chunk_index", 0)
    dept = meta.get("department", "general")
    return f"{dept}_{source}_{chunk_idx}"

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
"""

from typing import Any
from app.rag.bm25_index import bm25_search
from app.rag.embedder import generate_embeddings
from app.rag.vectorstore import query_store

RRF_K = 60


def hybrid_search(
    query: str,
    top_k: int = 5,
    department_filter: str | None = None,
    alpha: float = 0.5,
    candidate_k: int = 20,
) -> list[dict[str, Any]]:
    """
    Executes hybrid search combining dense vector search and BM25 keyword search using RRF.

    Args:
        query (str): Natural language search query.
        top_k (int): Number of top matches to return (default: 5).
        department_filter (str | None): Optional department pre-filter.
        alpha (float): Fusion weighting factor (default: 0.5).
        candidate_k (int): Number of candidates to retrieve from each retriever before fusion.

    Returns:
        list[dict]: Ranked list containing text, metadata, vector_score, bm25_score, and fused_rrf_score.
    """
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

    # 3. Reciprocal Rank Fusion (RRF)
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

    # Process BM25 Ranks (1-indexed)
    for rank, item in enumerate(bm25_results, start=1):
        key = _get_chunk_key(item)
        if key not in record_map:
            record_map[key] = item
        bm25_score_map[key] = item.get("bm25_score", 0.0)
        fused_scores[key] = fused_scores.get(key, 0.0) + (1.0 / (RRF_K + rank))

    # Combine into sorted results
    combined_results: list[dict[str, Any]] = []
    for key, rrf_score in fused_scores.items():
        rec = record_map[key]
        combined_results.append({
            "text": rec["text"],
            "metadata": rec["metadata"],
            "vector_score": vector_score_map.get(key, 0.0),
            "bm25_score": bm25_score_map.get(key, 0.0),
            "fused_rrf_score": round(rrf_score, 6),
        })

    combined_results.sort(key=lambda x: x["fused_rrf_score"], reverse=True)
    return combined_results[:top_k]


def _get_chunk_key(item: dict[str, Any]) -> str:
    """Helper to generate a unique key for a chunk across vector and BM25 result sets."""
    meta = item.get("metadata") or {}
    source = meta.get("source_filename") or meta.get("filename") or "doc"
    chunk_idx = meta.get("chunk_index", 0)
    dept = meta.get("department", "general")
    return f"{dept}_{source}_{chunk_idx}_{item['text'][:40]}"

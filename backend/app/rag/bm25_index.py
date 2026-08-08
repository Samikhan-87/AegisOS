"""
In-Memory BM25 Keyword Search Index for Aegis OS RAG Pipeline.

--- WHY THIS STEP MATTERS ---
Dense vector search maps semantic meaning into high-dimensional vector spaces.
However, vector search can struggle with exact keyword matches, arbitrary IDs,
policy numbers, acronyms, or specific code identifiers (e.g. "BCP-2026", "SOP-104", "GDPR-7").
BM25 (Best Matching 25) relies on exact term frequency (TF) and inverse document frequency (IDF)
to retrieve exact word and token matches that vector embeddings may smooth over.
"""

import re
from typing import Any
from rank_bm25 import BM25Okapi
from app.rag.vectorstore import get_vector_collection

_bm25_instance: BM25Okapi | None = None
_bm25_corpus_records: list[dict[str, Any]] = []


def tokenize_text(text: str) -> list[str]:
    """Tokenize text into lowercase alphanumeric words."""
    if not text:
        return []
    return re.findall(r"\w+", text.lower())


def build_bm25_index() -> int:
    """
    Fetches all documents and metadata from ChromaDB and constructs the BM25 index in memory.

    Returns:
        int: Number of chunks indexed.
    """
    global _bm25_instance, _bm25_corpus_records

    collection = get_vector_collection()
    data = collection.get(include=["documents", "metadatas"])

    documents = data.get("documents") or []
    metadatas = data.get("metadatas") or []
    ids = data.get("ids") or []

    if not documents:
        _bm25_instance = None
        _bm25_corpus_records = []
        return 0

    tokenized_corpus: list[list[str]] = []
    records: list[dict[str, Any]] = []

    for doc_id, doc_text, meta in zip(ids, documents, metadatas):
        tokens = tokenize_text(doc_text)
        tokenized_corpus.append(tokens)
        records.append({
            "id": doc_id,
            "text": doc_text,
            "metadata": meta or {},
        })

    _bm25_instance = BM25Okapi(tokenized_corpus)
    _bm25_corpus_records = records
    return len(records)


def bm25_search(
    query: str,
    top_k: int = 10,
    department_filter: str | None = None
) -> list[dict[str, Any]]:
    """
    Performs BM25 keyword search over indexed chunks.

    Args:
        query (str): Search query string.
        top_k (int): Number of top matches to return.
        department_filter (str | None): Optional department name for pre-filtering BM25 results.

    Returns:
        list[dict]: Ranked list of matched chunks containing text, metadata, id, and bm25_score.
    """
    global _bm25_instance, _bm25_corpus_records

    if _bm25_instance is None or not _bm25_corpus_records:
        count = build_bm25_index()
        if count == 0 or _bm25_instance is None:
            return []

    query_tokens = tokenize_text(query)
    if not query_tokens:
        return []

    scores = _bm25_instance.get_scores(query_tokens)

    # Filter candidates by department BEFORE top_k ranking
    candidates: list[dict[str, Any]] = []
    for score, record in zip(scores, _bm25_corpus_records):
        meta = record["metadata"] or {}
        if department_filter and department_filter.strip():
            dept = meta.get("department")
            if dept != department_filter.strip():
                continue

        candidates.append({
            "id": record["id"],
            "text": record["text"],
            "metadata": meta,
            "bm25_score": round(float(score), 4),
        })

    # Sort by raw BM25 score descending
    candidates.sort(key=lambda x: x["bm25_score"], reverse=True)
    return candidates[:top_k]

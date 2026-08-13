"""
In-Memory BM25 Keyword Search Index with Morphological Stemming for Aegis OS RAG Pipeline.

--- WHY THIS STEP MATTERS ---
1. Why BM25 Keyword Search?:
   Dense vector search maps semantic meaning into high-dimensional vector spaces.
   However, vector search can struggle with exact keyword matches, arbitrary IDs,
   policy numbers, acronyms, or specific code identifiers (e.g. "BCP-2026", "SOP-104", "GDPR-7").
   BM25 (Best Matching 25) relies on exact term frequency (TF) and inverse document frequency (IDF)
   to retrieve exact word and token matches that vector embeddings may smooth over.

2. Why Morphological Stemming Matters in BM25 Tokenization?:
   Natural language queries frequently use different word forms (plurals vs singulars,
   past/present verb tenses, participle endings like "leaves" vs "leave", "employees" vs "employee")
   than the raw text stored in corporate document chunks.
   Without stemming, BM25's exact-token matching algorithm treats "leaves" and "leave" as completely
   disjoint tokens, causing queries like "How many leaves do employees get?" to miss "Leave Policy.pdf"
   and return irrelevant matches.
   Applying consistent morphological stemming during both index construction and query tokenization
   normalizes word variations to a shared root stem, guaranteeing accurate BM25 recall across grammatical forms.
"""

import re
from typing import Any
from rank_bm25 import BM25Okapi
from app.rag.vectorstore import get_vector_collection

_bm25_instance: BM25Okapi | None = None
_bm25_corpus_records: list[dict[str, Any]] = []


def stem_word(word: str) -> str:
    """
    Lightweight suffix-stripping stemmer for BM25 keyword normalization.
    Strips common English morphological suffixes (plurals, verb tenses, participle endings)
    so different word forms (e.g., 'leaves' vs 'leave', 'employees' vs 'employee')
    normalize to identical root stems.
    """
    w = word.lower()
    if len(w) <= 3:
        return w

    # Irregular & domain-specific morphological mappings
    if w in ("leaves", "leave", "leaving"):
        return "leav"
    if w in ("employees", "employee"):
        return "employe"
    if w in ("policies", "policy"):
        return "polici"
    if w in ("approved", "approval", "approves", "approve"):
        return "approv"
    if w in ("guidelines", "guideline"):
        return "guidelin"
    if w in ("requirements", "requirement", "requires", "required"):
        return "requir"

    # Plural and suffix stripping rules
    if w.endswith("ies") and len(w) > 4:
        return w[:-3] + "i"
    elif w.endswith("es") and len(w) > 4:
        if w.endswith("ves"):
            return w[:-3] + "v"
        return w[:-2]
    elif w.endswith("s") and not w.endswith("ss") and len(w) > 3:
        return w[:-1]

    if w.endswith("ing") and len(w) > 4:
        stem = w[:-3]
        if len(stem) > 3 and stem[-1] == stem[-2]:
            return stem[:-1]
        if stem.endswith("e"):
            return stem[:-1]
        return stem

    if w.endswith("ed") and len(w) > 4:
        stem = w[:-2]
        if len(stem) > 3 and stem[-1] == stem[-2]:
            return stem[:-1]
        return stem

    if w.endswith("ly") and len(w) > 4:
        return w[:-2]

    if w.endswith("ment") and len(w) > 5:
        return w[:-4]

    if w.endswith("tion") and len(w) > 5:
        return w[:-3]

    return w


def tokenize_text(text: str) -> list[str]:
    """
    Tokenizes and stems text into lowercase alphanumeric stemmed tokens.
    Applied consistently to both indexed document text and incoming search queries.
    """
    if not text:
        return []
    words = re.findall(r"\w+", text.lower())
    return [stem_word(w) for w in words]


def build_bm25_index() -> int:
    """
    Fetches all documents and metadata from ChromaDB and constructs the BM25 index in memory using stemmed tokens.

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
    Performs BM25 keyword search over indexed chunks using stemmed query tokens.

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

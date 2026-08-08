"""
ChromaDB Vector Store Integration for Aegis OS RAG Pipeline.

--- WHY THIS STEP MATTERS ---
1. Why Persistent Vector Storage Matters:
   In-memory stores lose all indexed vectors upon container/server restarts, requiring expensive
   re-extraction and re-embedding of the entire corpus. Using ChromaDB's PersistentClient ensures
   vectors and metadata persist to disk (`/app/chroma_data`), making index access instant.

2. Why Folder-Based Department Metadata Derivation Matters:
   Relying on manual tagging is prone to human error, while LLM classification adds runtime latency,
   API token costs, and non-deterministic misclassifications. Deriving department metadata directly
   from filesystem folder structures (`documents/HR/` -> "HR") is 100% deterministic, instant,
   computationally free, and leverages existing organizational structure.

3. Why Pre-Filtering via ChromaDB's 'where' Parameter Matters:
   Pre-filtering applies metadata constraints inside ChromaDB's vector index BEFORE similarity ranking happens.
   If post-filtering were used (retrieving top-K vectors globally, then discarding non-matching departments in Python),
   highly relevant documents for a specific department would be lost if they didn't make the initial global top-K cutoff.
"""

from typing import Any
import uuid
import chromadb
from app.core.config import settings

# Initialize persistent ChromaDB client
_chroma_client: Any = None
_collection: Any = None



def get_vector_collection() -> Any:
    """
    Lazy-loads and returns the ChromaDB persistent collection 'aegis_documents'.
    Configured with cosine similarity metric ('hnsw:space': 'cosine').
    """
    global _chroma_client, _collection
    if _collection is None:
        _chroma_client = chromadb.PersistentClient(path=str(settings.CHROMA_DATA_DIR))
        _collection = _chroma_client.get_or_create_collection(
            name="aegis_documents",
            metadata={"hnsw:space": "cosine"}
        )
    return _collection


def add_chunks_to_store(
    chunks: list[dict[str, Any]],
    embeddings: list[list[float]],
    metadata_list: list[dict[str, Any]]
) -> int:
    """
    Inserts or updates chunks, vector embeddings, and metadata in ChromaDB.

    Args:
        chunks (list[dict]): List of chunk objects containing 'text'.
        embeddings (list[list[float]]): Corresponding 384-d vector embeddings.
        metadata_list (list[dict]): Rich metadata dicts (filename, department, chunk_index, etc.).

    Returns:
        int: Number of records added/upserted.
    """
    if not chunks:
        return 0

    collection = get_vector_collection()

    ids: list[str] = []
    documents: list[str] = []

    for idx, (chunk, meta) in enumerate(zip(chunks, metadata_list)):
        dept = meta.get("department", "general")
        filename = meta.get("source_filename", meta.get("filename", "doc"))
        chunk_idx = meta.get("chunk_index", idx)

        # Generate deterministic & unique chunk ID
        chunk_id = f"{dept}_{filename}_{chunk_idx}_{uuid.uuid4().hex[:6]}"
        ids.append(chunk_id)
        documents.append(chunk["text"])

    # Upsert vectors and metadata into ChromaDB
    collection.upsert(
        ids=ids,
        documents=documents,
        embeddings=embeddings,
        metadatas=metadata_list
    )

    return len(ids)


def query_store(
    query_embedding: list[float],
    top_k: int = 5,
    department_filter: str | None = None
) -> list[dict[str, Any]]:
    """
    Performs semantic vector search against ChromaDB with optional pre-filtering.

    PRE-FILTERING NOTE:
    We pass `where={"department": department_filter}` directly to ChromaDB query engine.
    This filters candidates BEFORE calculating vector similarities, guaranteeing that top_k
    results are drawn exclusively from the target department without losing relevant candidates.

    Args:
        query_embedding (list[float]): 384-d dense embedding of search query.
        top_k (int): Number of top matching chunks to return (default: 5).
        department_filter (str | None): Optional department name for pre-filtering.

    Returns:
        list[dict]: Ranked list of matched chunks containing:
            - "text": str
            - "metadata": dict
            - "distance": float
            - "similarity_score": float
    """
    collection = get_vector_collection()

    # Formulate native ChromaDB pre-filter
    where_clause = None
    if department_filter and department_filter.strip():
        where_clause = {"department": department_filter.strip()}

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=top_k,
        where=where_clause
    )

    formatted_results: list[dict[str, Any]] = []

    if not results or not results.get("documents") or not results["documents"][0]:
        return formatted_results

    docs = results["documents"][0]
    metas = results["metadatas"][0] if results.get("metadatas") else [{}] * len(docs)
    distances = results["distances"][0] if results.get("distances") else [0.0] * len(docs)

    for doc_text, meta, dist in zip(docs, metas, distances):
        # Convert HNSW cosine distance (1 - similarity) to similarity score [0, 1]
        similarity_score = max(0.0, min(1.0, 1.0 - float(dist)))
        formatted_results.append({
            "text": doc_text,
            "metadata": meta,
            "distance": round(float(dist), 4),
            "similarity_score": round(similarity_score, 4)
        })

    return formatted_results

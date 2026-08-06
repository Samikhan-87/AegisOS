"""
Text Embedding Generator for RAG Pipeline.

--- WHY THIS STEP MATTERS ---
1. Semantic Vector Representation: Traditional keyword matching fails when users use synonyms
   or phrasing different from the source document (e.g. "laptop battery life" vs "device runtime").
   Embedding models transform text into dense numerical vector spaces where semantically similar texts
   are mathematically close to each other.
2. Why 'all-MiniLM-L6-v2'?:
   - Local & Free Execution: Runs entirely offline on local hardware with zero external API key requirements.
   - High Performance & Low Latency: Produces 384-dimensional dense embeddings with an ultra-lightweight
     memory footprint (~90MB model file), ideal for laptop development and containerized deployments.
"""

from typing import Any
from sentence_transformers import SentenceTransformer
from app.core.config import settings

_embedding_model: SentenceTransformer | None = None


def get_embedding_model() -> SentenceTransformer:
    """
    Lazy-loads and returns the SentenceTransformer embedding model singleton instance.
    """
    global _embedding_model
    if _embedding_model is None:
        _embedding_model = SentenceTransformer(settings.EMBEDDING_MODEL_NAME)
    return _embedding_model


def generate_embeddings(chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Generates vector embeddings for a list of text chunks.

    Args:
        chunks (list[dict]): List of chunk dicts containing 'text' and 'metadata'.

    Returns:
        list[dict]: List of output objects containing:
            - "text": str
            - "metadata": dict
            - "embedding": list[float] (384-dimensional vector)
            - "embedding_dim": int (e.g. 384)
    """
    if not chunks:
        return []

    texts = [chunk["text"] for chunk in chunks]
    model = get_embedding_model()

    # Generate dense vector representations
    embeddings_matrix = model.encode(texts, show_progress_bar=False, convert_to_numpy=True)

    results: list[dict[str, Any]] = []
    for chunk, vector in zip(chunks, embeddings_matrix):
        vector_list = [float(v) for v in vector]
        results.append({
            "text": chunk["text"],
            "metadata": chunk["metadata"],
            "embedding": vector_list,
            "embedding_dim": len(vector_list),
        })

    return results

from app.rag.bm25_index import bm25_search
from app.rag.vectorstore import query_store
from app.rag.embedder import generate_embeddings

RRF_K = 60
query = "Who is the document owner for AB-CS-004?"

bm25_results = bm25_search(query, top_k=20)
query_chunk = [{"text": query, "metadata": {}}]
query_vector = generate_embeddings(query_chunk)[0]["embedding"]
vector_results = query_store(query_vector, top_k=20)

fused_scores = {}
record_map = {}
vector_score_map = {}
bm25_score_map = {}

def get_key(item):
    meta = item.get("metadata") or {}
    source = meta.get("source_filename") or meta.get("filename") or "doc"
    chunk_idx = meta.get("chunk_index", 0)
    dept = meta.get("department", "general")
    return f"{dept}_{source}_{chunk_idx}"

# 1. Vector Ranks
for rank, item in enumerate(vector_results, start=1):
    key = get_key(item)
    record_map[key] = item
    vector_score_map[key] = item.get("similarity_score", 0.0)
    fused_scores[key] = fused_scores.get(key, 0.0) + (1.0 / (RRF_K + rank))

# 2. BM25 Ranks with term-frequency signal scaling
for rank, item in enumerate(bm25_results, start=1):
    key = get_key(item)
    if key not in record_map:
        record_map[key] = item
    bm25_score = item.get("bm25_score", 0.0)
    bm25_score_map[key] = bm25_score
    # BM25 signal multiplier based on keyword match confidence
    bm25_weight = 1.0 + min(bm25_score / 10.0, 1.5)
    fused_scores[key] = fused_scores.get(key, 0.0) + (1.0 / (RRF_K + rank)) * bm25_weight

combined_results = []
for key, rrf_score in fused_scores.items():
    rec = record_map[key]
    combined_results.append({
        "filename": rec["metadata"].get("source_filename"),
        "chunk_index": rec["metadata"].get("chunk_index"),
        "vector_score": vector_score_map.get(key, 0.0),
        "bm25_score": bm25_score_map.get(key, 0.0),
        "fused_rrf_score": round(rrf_score, 6),
    })

combined_results.sort(key=lambda x: x["fused_rrf_score"], reverse=True)

print("=== WEIGHTED HYBRID RRF RESULTS ===")
for idx, r in enumerate(combined_results[:10], 1):
    print(f"#{idx} {r['filename']} (chunk {r['chunk_index']}): rrf={r['fused_rrf_score']}, bm25={r['bm25_score']}, vector={r['vector_score']}")

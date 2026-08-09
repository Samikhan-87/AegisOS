from app.rag.bm25_index import bm25_search
from app.rag.vectorstore import query_store
from app.rag.embedder import generate_embeddings
from app.rag.hybrid_search import hybrid_search

query = "Who is the document owner for AB-CS-004?"
print(f"=== TESTING QUERY: '{query}' ===")

# 1. Standalone BM25
bm25_res = bm25_search(query, top_k=10)
print("\n--- STANDALONE BM25 TOP 5 ---")
for r in bm25_res[:5]:
    print(f"  {r['metadata'].get('source_filename')} (chunk {r['metadata'].get('chunk_index')}): score = {r['bm25_score']}")

# 2. Standalone Vector
query_chunk = [{"text": query, "metadata": {}}]
embedded_query = generate_embeddings(query_chunk)
query_vector = embedded_query[0]["embedding"]
vec_res = query_store(query_vector, top_k=10)
print("\n--- STANDALONE VECTOR TOP 5 ---")
for r in vec_res[:5]:
    print(f"  {r['metadata'].get('source_filename')} (chunk {r['metadata'].get('chunk_index')}): score = {r['similarity_score']}")

# 3. Standard Hybrid RRF
hybrid_res = hybrid_search(query, top_k=10)
print("\n--- CURRENT HYBRID RRF TOP 10 ---")
for idx, r in enumerate(hybrid_res, 1):
    filename = r['metadata'].get('source_filename')
    print(f"  #{idx} {filename} (chunk {r['metadata'].get('chunk_index')}): rrf={r['fused_rrf_score']}, bm25={r['bm25_score']}, vector={r['vector_score']}")

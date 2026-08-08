"""
Pydantic Schemas for Document Upload and RAG Processing Pipeline.
"""

from typing import Any, Optional
from pydantic import BaseModel, Field


class DocumentUploadResponse(BaseModel):
    filename: str = Field(..., description="Sanitized name of the uploaded file")
    size_bytes: int = Field(..., description="File size in bytes")
    message: str = Field(..., description="Status description")


class DocumentProcessRequest(BaseModel):
    filename: str = Field(..., description="Name of the file previously uploaded to uploads/")
    chunk_size: int = Field(default=500, ge=50, le=4000, description="Max characters per chunk")
    chunk_overlap: int = Field(default=50, ge=0, le=1000, description="Overlap characters between chunks")


class ChunkMetadata(BaseModel):
    source_filename: str
    chunk_index: int
    start_char: int
    end_char: int


class ChunkPreview(BaseModel):
    text: str
    metadata: ChunkMetadata
    embedding_dim: int


class DocumentProcessResponse(BaseModel):
    filename: str
    total_chunks: int
    preview: list[ChunkPreview]


# --- Batch Ingestion Schemas ---

class FailedFileError(BaseModel):
    filename: str
    department: str
    error: str


class IngestAllResponse(BaseModel):
    total_documents_processed: int = Field(..., description="Total documents successfully processed")
    total_chunks_stored: int = Field(..., description="Total chunks inserted into ChromaDB")
    department_breakdown: dict[str, int] = Field(..., description="Chunk count per department")
    failed_files: list[FailedFileError] = Field(default_factory=list, description="Files that encountered errors")


from typing import Any, Literal, Optional
from pydantic import BaseModel, Field

# --- Search Schemas ---

class DocumentSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Natural language search query")
    top_k: int = Field(default=5, ge=1, le=50, description="Number of top matches to retrieve")
    department: Optional[str] = Field(default=None, description="Optional department name for pre-filtering")
    mode: Literal["vector", "bm25", "hybrid"] = Field(
        default="hybrid",
        description="Search mode: 'vector' (dense embeddings), 'bm25' (keyword matching), or 'hybrid' (RRF fusion)"
    )


class SearchResultItem(BaseModel):
    text: str
    metadata: dict[str, Any]
    similarity_score: Optional[float] = Field(default=None, description="Vector similarity score [0, 1]")
    distance: Optional[float] = Field(default=None, description="Vector HNSW cosine distance")
    vector_score: Optional[float] = Field(default=None, description="Vector similarity score")
    bm25_score: Optional[float] = Field(default=None, description="Raw BM25 score")
    fused_rrf_score: Optional[float] = Field(default=None, description="Reciprocal Rank Fusion score")


class DocumentSearchResponse(BaseModel):
    query: str
    mode: str = Field(default="hybrid", description="Selected search mode: vector, bm25, or hybrid")
    department_filter: Optional[str] = None
    total_results: int
    results: list[SearchResultItem]


class BuildBM25Response(BaseModel):
    total_documents_indexed: int = Field(..., description="Total document chunks indexed into BM25")
    message: str = Field(..., description="Status description")



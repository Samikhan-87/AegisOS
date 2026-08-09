"""
Document Ingestion & RAG Pipeline API Routes.
"""

from datetime import datetime, timezone
from pathlib import Path
import shutil
from fastapi import APIRouter, File, HTTPException, UploadFile, status

from app.core.config import settings
from app.models.documents import (
    BuildBM25Response,
    ChunkPreview,
    DocumentProcessRequest,
    DocumentProcessResponse,
    DocumentSearchRequest,
    DocumentSearchResponse,
    DocumentUploadResponse,
    FailedFileError,
    IngestAllResponse,
    SearchResultItem,
)

from app.rag.bm25_index import bm25_search, build_bm25_index
from app.rag.chunker import create_chunks
from app.rag.embedder import generate_embeddings
from app.rag.extractor import extract_text
from app.rag.hybrid_search import hybrid_search
from app.rag.vectorstore import add_chunks_to_store, query_store


router = APIRouter(prefix="/documents", tags=["documents"])

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt"}


@router.post(
    "/upload",
    response_model=DocumentUploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload document for RAG ingestion",
    description="Uploads a PDF, DOCX, or TXT document to local uploads/ directory.",
)
async def upload_document(file: UploadFile = File(...)) -> DocumentUploadResponse:
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No filename provided in upload request.",
        )

    filename = Path(file.filename).name
    ext = Path(filename).suffix.lower()

    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format '{ext}'. Allowed formats: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    target_path = settings.UPLOAD_DIR / filename

    try:
        with open(target_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save uploaded file: {str(e)}",
        ) from e

    file_size = target_path.stat().st_size

    return DocumentUploadResponse(
        filename=filename,
        size_bytes=file_size,
        message="File uploaded successfully.",
    )


@router.post(
    "/process",
    response_model=DocumentProcessResponse,
    summary="Execute extraction, chunking, and embedding pipeline",
    description="Runs an uploaded document through text extraction, recursive chunking, and vector embedding generation.",
)
async def process_document(request: DocumentProcessRequest) -> DocumentProcessResponse:
    filename = Path(request.filename).name
    file_path = settings.UPLOAD_DIR / filename

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"File '{filename}' not found in uploads folder. Please upload it first via /api/v1/documents/upload.",
        )

    # Step 1: Text Extraction
    try:
        raw_text = extract_text(file_path)
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve),
        ) from ve
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error extracting text from file: {str(e)}",
        ) from e

    # Step 2: Text Chunking
    try:
        chunks = create_chunks(
            text=raw_text,
            source_filename=filename,
            chunk_size=request.chunk_size,
            chunk_overlap=request.chunk_overlap,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error chunking document: {str(e)}",
        ) from e

    # Step 3: Embedding Generation
    try:
        embedded_chunks = generate_embeddings(chunks)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating vector embeddings: {str(e)}",
        ) from e

    # Build first 2 chunks preview (without full embedding vector)
    preview_items = [
        ChunkPreview(
            text=item["text"],
            metadata=item["metadata"],
            embedding_dim=item["embedding_dim"],
        )
        for item in embedded_chunks[:2]
    ]

    return DocumentProcessResponse(
        filename=filename,
        total_chunks=len(embedded_chunks),
        preview=preview_items,
    )


@router.post(
    "/build-bm25-index",
    response_model=BuildBM25Response,
    summary="Construct/Refresh in-memory BM25 index from ChromaDB corpus",
    description="Loads all document chunks from ChromaDB, tokenizes text, and constructs the BM25 index in memory.",
)
async def build_bm25_index_endpoint() -> BuildBM25Response:
    try:
        indexed_count = build_bm25_index()
        return BuildBM25Response(
            total_documents_indexed=indexed_count,
            message=f"BM25 index built successfully with {indexed_count} document chunks.",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to build BM25 index: {str(e)}",
        ) from e


@router.post(
    "/ingest-all",
    response_model=IngestAllResponse,
    summary="Batch ingest department documents into ChromaDB & BM25",
    description=(
        "Walks through the documents/ directory subfolders (e.g. HR, Finance), "
        "extracts text, chunks, embeds, automatically tags 'department' metadata, "
        "inserts vectors into ChromaDB, and refreshes the BM25 keyword index."
    ),
)
async def ingest_all_documents() -> IngestAllResponse:
    docs_root = settings.DOCUMENTS_DIR

    if not docs_root.exists() or not docs_root.is_dir():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Documents directory '{docs_root}' does not exist.",
        )

    total_docs_processed = 0
    total_chunks_stored = 0
    department_breakdown: dict[str, int] = {}
    failed_files: list[FailedFileError] = []

    # Gather files to ingest (either inside department subfolders or directly in root)
    files_to_process: list[tuple[Path, str]] = []

    # Check for department subfolders first
    subdirs = [d for d in docs_root.iterdir() if d.is_dir()]

    if subdirs:
        for dept_dir in subdirs:
            dept_name = dept_dir.name
            for file_path in dept_dir.glob("*"):
                if file_path.is_file() and file_path.suffix.lower() in ALLOWED_EXTENSIONS:
                    files_to_process.append((file_path, dept_name))
    else:
        # Fallback: process files directly under documents/ as General
        for file_path in docs_root.glob("*"):
            if file_path.is_file() and file_path.suffix.lower() in ALLOWED_EXTENSIONS:
                files_to_process.append((file_path, "General"))

    now_iso = datetime.now(timezone.utc).isoformat()

    for file_path, dept_name in files_to_process:
        try:
            # 1. Extract plain text
            raw_text = extract_text(file_path)

            # 2. Chunk text
            chunks = create_chunks(text=raw_text, source_filename=file_path.name)

            if not chunks:
                continue

            # 3. Build rich metadata list including department tag derived from folder
            metadata_list = []
            for chunk in chunks:
                meta = dict(chunk["metadata"])
                meta["department"] = dept_name
                meta["ingested_at"] = now_iso
                metadata_list.append(meta)

            # 4. Generate dense embeddings
            embedded_chunks = generate_embeddings(chunks)
            embeddings = [item["embedding"] for item in embedded_chunks]

            # 5. Insert into persistent ChromaDB store
            stored_count = add_chunks_to_store(chunks, embeddings, metadata_list)

            total_docs_processed += 1
            total_chunks_stored += stored_count
            department_breakdown[dept_name] = department_breakdown.get(dept_name, 0) + stored_count

        except Exception as e:
            failed_files.append(
                FailedFileError(
                    filename=file_path.name,
                    department=dept_name,
                    error=str(e),
                )
            )

    # Automatically refresh BM25 index after batch ingestion
    try:
        build_bm25_index()
    except Exception:
        pass

    return IngestAllResponse(
        total_documents_processed=total_docs_processed,
        total_chunks_stored=total_chunks_stored,
        department_breakdown=department_breakdown,
        failed_files=failed_files,
    )


@router.post(
    "/search",
    response_model=DocumentSearchResponse,
    summary="Multi-mode search (vector, bm25, or hybrid RRF)",
    description=(
        "Executes search using dense vector embeddings, BM25 keyword matching, "
        "or Reciprocal Rank Fusion (RRF) hybrid retrieval with optional department pre-filtering."
    ),
)
async def search_documents(request: DocumentSearchRequest) -> DocumentSearchResponse:
    mode = request.mode.lower()
    results: list[SearchResultItem] = []

    if mode == "vector":
        query_chunks = [{"text": request.query, "metadata": {}}]
        embedded_query = generate_embeddings(query_chunks)
        if not embedded_query:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to generate query embedding.",
            )
        query_vector = embedded_query[0]["embedding"]
        raw_results = query_store(
            query_embedding=query_vector,
            top_k=request.top_k,
            department_filter=request.department,
        )
        results = [
            SearchResultItem(
                text=res["text"],
                metadata=res["metadata"],
                similarity_score=res["similarity_score"],
                vector_score=res["similarity_score"],
                distance=res["distance"],
            )
            for res in raw_results
        ]

    elif mode == "bm25":
        raw_results = bm25_search(
            query=request.query,
            top_k=request.top_k,
            department_filter=request.department,
        )
        results = [
            SearchResultItem(
                text=res["text"],
                metadata=res["metadata"],
                bm25_score=res["bm25_score"],
            )
            for res in raw_results
        ]

    elif mode == "hybrid":
        raw_results = hybrid_search(
            query=request.query,
            top_k=request.top_k,
            department_filter=request.department,
        )
        results = [
            SearchResultItem(
                text=res["text"],
                metadata=res["metadata"],
                vector_score=res["vector_score"],
                bm25_score=res["bm25_score"],
                fused_rrf_score=res["fused_rrf_score"],
                exact_id_match=res.get("exact_id_match", False),
            )
            for res in raw_results
        ]

    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid search mode '{mode}'. Supported modes: vector, bm25, hybrid",
        )

    return DocumentSearchResponse(
        query=request.query,
        mode=mode,
        department_filter=request.department,
        total_results=len(results),
        results=results,
    )

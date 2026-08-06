"""
Document Text Extractor for RAG Pipeline.

--- WHY THIS STEP MATTERS ---
RAG (Retrieval-Augmented Generation) systems rely on feeding relevant source documents
into LLM context windows. Raw document formats (PDFs, DOCX files, plain text) contain
binary stream structures, XML markups, or proprietary formatting that LLMs cannot consume directly.
Text extraction converts these heterogeneous formats into clean, standardized plain text strings,
preserving structural continuity so that subsequent chunking and embedding operations operate
on clean semantic content.
"""

from pathlib import Path
import pypdf
import docx

def extract_text(file_path: str | Path) -> str:
    """
    Extracts raw text from PDF, DOCX, or TXT documents.

    Args:
        file_path (str | Path): Path to the target document file.

    Returns:
        str: Extracted plain text content.

    Raises:
        FileNotFoundError: If the specified file does not exist.
        ValueError: If the file format is unsupported or if parsing fails/produces empty text.
    """
    path = Path(file_path)
    if not path.is_file():
        raise FileNotFoundError(f"File not found: {path}")

    ext = path.suffix.lower()

    try:
        if ext == ".pdf":
            return _extract_from_pdf(path)
        elif ext == ".docx":
            return _extract_from_docx(path)
        elif ext == ".txt":
            return _extract_from_txt(path)
        else:
            raise ValueError(
                f"Unsupported file format '{ext}'. Supported formats: .pdf, .docx, .txt"
            )
    except ValueError:
        raise
    except Exception as e:
        raise ValueError(f"Failed to extract text from '{path.name}': {str(e)}") from e


def _extract_from_pdf(file_path: Path) -> str:
    """Extract text page-by-page using pypdf."""
    try:
        reader = pypdf.PdfReader(str(file_path))
    except Exception as e:
        raise ValueError(f"Corrupted or invalid PDF file: {str(e)}") from e

    if len(reader.pages) == 0:
        raise ValueError("PDF file contains no pages.")
    
    extracted_pages = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            extracted_pages.append(text)
    
    full_text = "\n\n".join(extracted_pages).strip()
    if not full_text:
        raise ValueError("Could not extract readable text from PDF (file may be scanned/image-only or encrypted).")
    
    return full_text


def _extract_from_docx(file_path: Path) -> str:
    """Extract paragraph text using python-docx."""
    try:
        doc = docx.Document(str(file_path))
    except Exception as e:
        raise ValueError(f"Corrupted or invalid DOCX file: {str(e)}") from e

    paragraphs = [p.text.strip() for p in doc.paragraphs if p.text and p.text.strip()]
    full_text = "\n\n".join(paragraphs).strip()
    
    if not full_text:
        raise ValueError("DOCX file contains no readable text content.")
    
    return full_text


def _extract_from_txt(file_path: Path) -> str:
    """Extract text from plain text file with fallback encoding handling."""
    encodings = ["utf-8", "latin-1", "cp1252"]
    for enc in encodings:
        try:
            content = file_path.read_text(encoding=enc).strip()
            if content:
                return content
        except (UnicodeDecodeError, Exception):
            continue

    raise ValueError("Could not decode plain text file with standard encodings (utf-8, latin-1, cp1252).")

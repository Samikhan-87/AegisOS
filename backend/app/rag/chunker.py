"""
Text Chunker for RAG Pipeline.

--- WHY THIS STEP MATTERS ---
1. LLM Context Window Limits & Relevance: Large documents cannot be passed whole into an LLM context.
   Chunking breaks text into small, semantically focused pieces so vector search can retrieve
   only the most relevant snippets for a query.
2. Why Overlap Matters: Hard text boundaries can cut a key sentence or thought in half. Overlapping
   adjacent chunks (e.g. by 50 characters) ensures that context spanning a boundary is preserved
   in at least one chunk.
3. Why Recursive Splitting Matters: Splitting blindly by raw character count cuts words and sentences in half.
   Recursive splitting attempts to split along natural text boundaries—first paragraphs (\\n\\n),
   then lines (\\n), sentences (. ), spaces ( ), and raw characters as a last resort.
"""

from typing import Any


def create_chunks(
    text: str,
    source_filename: str,
    chunk_size: int = 500,
    chunk_overlap: int = 50,
    separators: list[str] | None = None,
) -> list[dict[str, Any]]:
    """
    Recursively splits text into overlapping chunks with rich metadata.

    Args:
        text (str): Extracted raw text content.
        source_filename (str): Name of the source file for metadata tracking.
        chunk_size (int): Max character length per chunk (default: 500).
        chunk_overlap (int): Character overlap between adjacent chunks (default: 50).
        separators (list[str] | None): Hierarchical separators to split text by.

    Returns:
        list[dict]: List of chunk objects containing:
            - "text": Chunk text string
            - "metadata": {
                "source_filename": str,
                "chunk_index": int,
                "start_char": int,
                "end_char": int
              }
    """
    if not text or not text.strip():
        return []

    if chunk_overlap >= chunk_size:
        raise ValueError("chunk_overlap must be strictly smaller than chunk_size")

    if separators is None:
        separators = ["\n\n", "\n", ". ", " ", ""]

    splits = _split_text_recursively(text, separators, chunk_size)

    # Group splits into chunks respecting chunk_size and chunk_overlap
    chunks: list[str] = []
    current_doc: list[str] = []
    current_len = 0

    for split in splits:
        split_len = len(split)

        if current_len + split_len > chunk_size and current_doc:
            doc_text = "".join(current_doc)
            chunks.append(doc_text)

            # Carry over overlapping portion from current_doc
            overlap_doc: list[str] = []
            overlap_len = 0
            for item in reversed(current_doc):
                if overlap_len + len(item) <= chunk_overlap:
                    overlap_doc.insert(0, item)
                    overlap_len += len(item)
                else:
                    break
            current_doc = overlap_doc
            current_len = overlap_len

        current_doc.append(split)
        current_len += split_len

    if current_doc:
        doc_text = "".join(current_doc)
        if not chunks or chunks[-1] != doc_text:
            chunks.append(doc_text)

    # Compute exact character positions in the original text
    results: list[dict[str, Any]] = []
    search_offset = 0

    for index, chunk_str in enumerate(chunks):
        start_char = text.find(chunk_str, search_offset)
        if start_char == -1:
            start_char = text.find(chunk_str)
            if start_char == -1:
                start_char = search_offset

        end_char = start_char + len(chunk_str)
        search_offset = max(start_char + 1, end_char - chunk_overlap)

        results.append({
            "text": chunk_str,
            "metadata": {
                "source_filename": source_filename,
                "chunk_index": index,
                "start_char": start_char,
                "end_char": end_char,
            }
        })

    return results


def _split_text_recursively(text: str, separators: list[str], max_size: int) -> list[str]:
    """Internal helper to recursively break down text according to separator hierarchy."""
    final_splits: list[str] = []
    separator = separators[-1]
    new_separators: list[str] = []

    for i, sep in enumerate(separators):
        if sep == "":
            separator = ""
            break
        if sep in text:
            separator = sep
            new_separators = separators[i + 1:]
            break

    splits = text.split(separator) if separator != "" else list(text)

    for s in splits:
        part = s + separator if separator != "" else s
        if not part:
            continue
        if len(part) <= max_size:
            final_splits.append(part)
        else:
            if new_separators:
                final_splits.extend(_split_text_recursively(part, new_separators, max_size))
            else:
                for j in range(0, len(part), max_size):
                    final_splits.append(part[j : j + max_size])

    return final_splits

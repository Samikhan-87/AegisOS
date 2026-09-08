/**
 * API Service Layer for Aegis OS Backend & LangGraph RAG Agent.
 */

export interface RAGAskPayload {
  query: string;
  department_filter?: string | null;
}

export interface Citation {
  filename: string;
  department: string;
  chunk_index: number;
}

export interface RetrievedChunk {
  text: string;
  metadata: {
    source_filename?: string;
    filename?: string;
    department?: string;
    chunk_index?: number;
    [key: string]: any;
  };
  vector_score?: number;
  bm25_score?: number;
  fused_rrf_score?: number;
}

export interface SecurityCheckInfo {
  is_safe: boolean;
  risk_level: 'none' | 'low' | 'medium' | 'high';
  flagged_patterns: string[];
  reason: string;
}

export interface RAGAskResponseData {
  query: string;
  department_filter?: string | null;
  answer: string;
  citations: Citation[];
  retrieved_chunks: RetrievedChunk[];
  security_check?: SecurityCheckInfo;
}

// Compute API base URL safely for client-side browser execution.
// If VITE_API_URL points to internal Docker DNS ('http://backend:8000'), fallback to relative path
// so Vite's dev server proxy routes it cleanly without host DNS resolution errors.
const rawApiUrl = import.meta.env.VITE_API_URL || '';
const API_BASE_URL = rawApiUrl.includes('backend:') ? '' : rawApiUrl;

/**
 * Sends a query to the LangGraph RAG Agent endpoint (/api/v1/agents/rag/ask).
 */
export async function askRAGAgent(payload: RAGAskPayload): Promise<RAGAskResponseData> {
  const url = `${API_BASE_URL}/api/v1/agents/rag/ask`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: payload.query,
        department_filter: payload.department_filter || null,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const detail = errorData.detail || `Server returned HTTP status ${response.status}`;
      throw new Error(detail);
    }

    return await response.json();
  } catch (err: any) {
    if (err.name === 'TypeError' || err.message?.includes('fetch')) {
      throw new Error(
        'Unable to connect to RAG agent — verify backend and Ollama are running.'
      );
    }
    throw err;
  }
}

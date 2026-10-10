"""
Ollama Local LLM HTTP Client Integration for Aegis OS.
"""

import logging
import os
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)


def call_ollama(prompt: str, model: str | None = None, timeout_seconds: float = 120.0) -> str:
    """
    Sends a generation prompt to a local Ollama instance via REST API.

    Args:
        prompt (str): Grounded prompt text.
        model (str | None): Optional model override. Defaults to OLLAMA_MODEL env var or 'gemma2:2b'.
        timeout_seconds (float): Connection and generation timeout in seconds (default: 120.0s).

    Returns:
        str: Generated response text or clear error message if Ollama is unreachable.
    """

    base_url = os.getenv("OLLAMA_BASE_URL", settings.OLLAMA_BASE_URL).rstrip("/")
    target_model = model or os.getenv("OLLAMA_MODEL", settings.OLLAMA_MODEL)
    effective_timeout = float(os.getenv("OLLAMA_TIMEOUT_SECONDS", str(timeout_seconds)))
    max_tokens = int(os.getenv("OLLAMA_MAX_TOKENS", "160"))
    context_size = int(os.getenv("OLLAMA_NUM_CTX", "1536"))

    endpoint = f"{base_url}/api/generate"
    payload = {
        "model": target_model,
        "prompt": prompt,
        "stream": False,
        "options": {
            "num_predict": max_tokens,     # Caps generation length for fast CPU response
            "num_ctx": context_size,        # Restricts context window size for fast prompt processing
            "temperature": 0.1,             # Low temperature for deterministic grounded answers
            "top_k": 20,
            "top_p": 0.9,
        }
    }

    try:
        # Explicit timeout configuration ensuring full read timeout is granted to Ollama
        client_timeout = httpx.Timeout(
            effective_timeout,
            connect=60.0,
            read=effective_timeout,
            write=60.0,
            pool=effective_timeout,
        )
        with httpx.Client(timeout=client_timeout) as client:
            response = client.post(endpoint, json=payload)
            response.raise_for_status()
            data = response.json()
            return data.get("response", "").strip()

    except httpx.ConnectError as ce:
        error_msg = (
            f"Error: Unable to connect to local Ollama instance at '{base_url}'. "
            f"Please verify Ollama is running and accessible. Details: {str(ce)}"
        )
        logger.error(error_msg)
        return error_msg

    except httpx.TimeoutException as te:
        timeout_name = type(te).__name__
        error_msg = (
            f"Error: Ollama generation timed out ({timeout_name}) after {effective_timeout} seconds using model '{target_model}'. "
            "Local CPU inference can be slow — consider using a faster model (e.g. 'qwen2.5:3b' or 'llama3.2:1b') "
            "or increasing OLLAMA_TIMEOUT_SECONDS."
        )
        logger.error(f"{error_msg} Details: {repr(te)}")
        return error_msg

    except httpx.HTTPStatusError as hse:
        error_msg = (
            f"Error: Ollama returned HTTP status {hse.response.status_code}. "
            f"Please confirm model '{target_model}' has been pulled locally (`ollama pull {target_model}`)."
        )
        logger.error(error_msg)
        return error_msg

    except Exception as e:
        error_msg = f"Error: Unexpected error during Ollama invocation: {str(e)}"
        logger.error(error_msg)
        return error_msg

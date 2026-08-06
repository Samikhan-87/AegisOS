from app.models.chat import ChatRequest, ChatResponse

class ChatService:
    @staticmethod
    async def process_chat(request: ChatRequest) -> ChatResponse:
        """
        Service layer for processing chat requests.
        Future LangGraph agents and execution graphs will be integrated here.
        """
        reply_message = f"Echo response: '{request.message}'"
        return ChatResponse(
            reply=reply_message,
            agent_id=request.agent_id or "1",
            status="success"
        )

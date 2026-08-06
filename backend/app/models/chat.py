from pydantic import BaseModel, Field
from typing import Optional

class ChatRequest(BaseModel):
    message: str = Field(..., description="The user query or prompt for the agent")
    agent_id: Optional[str] = Field("1", description="ID of the target agent")

class ChatResponse(BaseModel):
    reply: str = Field(..., description="Agent response message")
    agent_id: str = Field(..., description="ID of the responding agent")
    status: str = Field("success", description="Response status")

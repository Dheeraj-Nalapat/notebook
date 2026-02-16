# Model Selector with Capability-Based Models - Updated Plan

## Overview

Implement a model selector that allows frontend to specify model IDs for each capability of an agent. Conversational model can only be changed once before chat begins. Store agent configuration in chat_metadata and chat_message metadata.

**IMPORTANT FINDING**: Changing models requires agent recreation, but the system prompt/instruction remains the same. ADK sessions can handle agent recreation while maintaining message history.

## System Prompt and Agent Recreation Analysis

### Current Architecture

1. **Agent Creation**: Agents are created once in `AssistantRunner.__init__()` via `AgentProcessor.load_agent()`
   - The agent instance (`self.__agent`) is stored and reused for all messages in the session
   - The instruction/system prompt is set at agent creation time from `spanner_assistant.instruction`
   - The instruction is baked into the agent object and used to generate XML system instructions

2. **ADK Behavior**: 
   - ADK does **NOT** support changing system prompts dynamically mid-session
   - The agent object contains the system prompt/instruction set at initialization
   - The same agent instance is used throughout the session

3. **Model Changes Impact**:
   - When models change (especially conversational model), we **MUST** recreate the agent
   - The new agent will use the **same instruction** from the assistant configuration
   - The session will continue with the new agent instance
   - **This is acceptable because:**
     - Instructions are typically model-agnostic (they describe the agent's role/tasks)
     - The instruction comes from the assistant config, not model-specific
     - ADK sessions can continue with a new agent instance - message history persists

### Implementation Strategy

**For Conversational Model Changes (before chat starts):**
- Recreate the agent with the new model
- Use the same instruction from assistant config
- This happens naturally since we're creating a new `AssistantRunner` instance

**For Agentic Capability Model Changes (any time):**
- These models are used by capabilities, not the main conversational agent
- Capabilities are initialized with their models in `TaskAgent.__init__()`
- Changing capability models mid-session would require:
  - Option A: Recreate the entire agent (simpler, but loses some state)
  - Option B: Allow capability models to be changed without recreating the main agent (more complex)
  - **Recommendation**: For now, only allow capability model changes if we recreate the agent
  - Future enhancement: Support dynamic capability model updates

**Key Points:**
- The instruction/system prompt **remains the same** when models change
- This is acceptable because instructions describe agent behavior, not model-specific details
- ADK sessions can handle agent recreation - the session state (messages, context) persists
- We need to ensure the agent is recreated when models change, not just the model objects

### Code Changes Required

1. **Agent Recreation Logic**:
   - In `agent_runner_app_v2()`, detect if models have changed from stored config
   - If conversational model changed (and allowed), recreate `AssistantRunner` with new model
   - If capability models changed, recreate agent to update capability instances
   - Store the new configuration in chat metadata

2. **Session Continuity**:
   - ADK sessions maintain message history independently of agent instances
   - When we recreate the agent, the session continues with existing message history
   - This is the expected behavior and should work seamlessly

3. **Instruction Compatibility**:
   - Instructions are model-agnostic by design
   - No changes needed to instructions when models change
   - If future models require different instruction formats, we'd need to handle that separately

## Implementation Plan

### 1. API Request Models

**File:** `src/server.py`

- Add `model_overrides` field to request models:
  - `AgentRunRequestBaseV2` and `AgentRunRequestActualV2` 
  - Structure: `Optional[Dict[str, int]]` where key is `capability_id` and value is `model_id`
  - Special key `"conversational"` for conversational model
  - Example: `{"conversational": 123, "IMAGE_GENERATION": 456, "VIDEO_GENERATION": 789}`

### 2. Model Override Processing

**File:** `src/common/capability_utils.py`

- Modify `resolve_assistant_capabilities()` to accept `model_overrides: Optional[Dict[str, int]]`
- Apply overrides:
  - For conversational capability: use override if provided and allowed
  - For agentic capabilities: use override if provided for that capability_id
- Validate overrides against:
  - Client enabled models (`get_client_enabled_models()`)
  - Capability-based ranked models (`get_capability_based_ranked_models()`)
  - Conversational supported models (for conversational only)

### 3. Chat State Validation

**File:** `src/runtime/runners/agent_runner.py` or new utility

- Create helper function `has_chat_messages(chat_id: str, client_id: int) -> bool`
- Check if chat has any messages by querying `ChatMessage` table
- Use this to validate conversational model changes

### 4. API Endpoint Updates

**Files:** `src/runtime/runner_app.py`, `src/server.py`

- Update `agent_runner_app_v2()` to:
  - Extract `model_overrides` from request
  - Check chat state before allowing conversational model change
  - **Detect if models have changed from stored config**
  - **Recreate AssistantRunner if models changed** (this recreates the agent)
  - Pass `model_overrides` to capability resolution
  - Store resolved configuration in chat metadata

### 5. Chat Metadata Storage

**File:** `src/common/chat_assistant/spanner_chat_assistant.py`

- In `create_or_update_chat()` or new method:
  - Store `agent_configuration` in `chat.metadata` with structure:
    ```python
    {
      "agent_configuration": {
        "conversational_model_id": int,
        "capability_models": {
          "capability_id": model_id,
          ...
        },
        "resolved_at": timestamp,
        "assistant_id": str
      }
    }
    ```

### 6. Chat Message Metadata Storage

**File:** `src/common/chat_history/spanner_message_history.py`

- In `convert_and_store_chat_message()`:
  - Get current agent configuration from chat metadata
  - Add to message metadata:
    ```python
    metadata = {
      ...existing_metadata...,
      "agent_configuration": chat.metadata.get("agent_configuration")
    }
    ```

### 7. Frontend Support Endpoint

**File:** `src/server.py`

- Add endpoint `GET /agent/get_available_models`:
  - Input: `assistant_id` (optional), `client_id` (from JWT)
  - Returns available models per capability:
    ```python
    {
      "conversational": [model_id, ...],
      "capabilities": {
        "capability_id": [model_id, ...],
        ...
      }
    }
    ```
  - Uses `get_capability_based_ranked_models()` for each capability
  - Filters by client enabled models

### 8. Configuration Retrieval

**File:** `src/common/chat_assistant/spanner_chat_assistant.py`

- Add method `get_agent_configuration()` to retrieve stored configuration from chat metadata
- Use this when resuming chats to show current model selection

## Key Considerations

1. **Conversational Model Restriction:**
   - Check `ChatMessage.find()` for any messages with the chat_id
   - If messages exist, reject conversational model changes
   - Allow all other capability model changes

2. **Backward Compatibility:**
   - `model_overrides` is optional - if not provided, use existing resolution logic
   - V1 APIs can continue to work as-is (they already accept model params)

3. **Validation:**
   - Validate all model IDs against client enabled models
   - Validate capability models against capability-specific ranked models
   - Raise clear errors if validation fails

4. **Metadata Structure:**
   - Store full resolved configuration, not just overrides
   - Include timestamp for debugging
   - Include assistant_id for reference

5. **Error Handling:**
   - Clear error messages for:
     - Conversational model change after chat started
     - Invalid model IDs
     - Models not available for capability
     - Client model restrictions

6. **Agent Recreation:**
   - Must recreate agent when models change
   - Session history will persist (ADK handles this)
   - Instructions remain the same (model-agnostic)

## Testing Considerations

- Test conversational model change before first message
- Test conversational model change rejection after messages exist
- Test agentic capability model changes at any time
- Test invalid model IDs
- Test missing capabilities
- Test chat metadata persistence
- Test chat_message metadata inclusion
- **Test agent recreation with model changes** - verify session continuity
- **Test that instructions remain the same** when models change
- **Test that message history persists** after agent recreation
- **Test that system prompts are not affected** by model changes

## Files to Modify

1. `src/server.py` - Add model_overrides to request models, add get_available_models endpoint
2. `src/common/capability_utils.py` - Modify resolve_assistant_capabilities() to accept overrides
3. `src/runtime/runners/agent_runner.py` - Add has_chat_messages helper, validation logic
4. `src/runtime/runner_app.py` - Update agent_runner_app_v2() to handle model_overrides and agent recreation
5. `src/common/chat_assistant/spanner_chat_assistant.py` - Store/retrieve agent configuration in chat metadata
6. `src/common/chat_history/spanner_message_history.py` - Store agent configuration in chat_message metadata

## Conclusion

**The system prompt/instruction will remain unchanged when models are changed.** This is acceptable because:
- Instructions are model-agnostic
- ADK supports agent recreation while maintaining session state
- The same instruction works across different models

**Agent recreation is required** when models change, but this is handled naturally by creating a new `AssistantRunner` instance. The ADK session will continue seamlessly with the new agent instance.
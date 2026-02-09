# Workspace-Specific Assistant Deletion Implementation Plan

## Problem Statement

Currently, deleting an assistant affects all workspaces if it's a system/subscription-level assistant. We need workspace-specific deletion where:

- **System/Subscription-level assistants**: Hide from the requesting workspace (blacklist) without affecting other workspaces
- **Workspace-level assistants**: Actually delete (current behavior is fine)
- **Restore capability**: Allow workspace admins to restore/unhide blacklisted assistants

## Solution Architecture

The solution leverages the existing `client_blacklisted_assistant` table to hide assistants from specific workspaces while keeping them available to others.

### Current State

- `client_blacklisted_assistant` table exists with `(client_id, assistant_id)` primary key
- Blacklisting is already used in filtering via `getBlacklistedAssistantIds()`
- No API endpoints exist to manage blacklisting (only done via migrations)
- Current `delete()` method soft-deletes assistants across all scopes

### Proposed Changes

#### 1. Modify `delete()` Method in `AssistantService`

**File**: `src/services/assistant.service.ts`

**Current behavior** (lines 2078-2093):
- Finds assistant across all scopes
- Soft-deletes regardless of scope

**New behavior**:
- Determine assistant scope (system/subscription vs workspace-level)
- **If system/subscription-level**: Add to `client_blacklisted_assistant` table instead of deleting
- **If workspace-level**: Actually delete (current behavior)
- Handle edge cases (already blacklisted, permission checks)

**Key logic**:

```typescript
// Check if assistant is system/subscription level
const isSystemLevel = existingAssistant.clientId === SYSTEM_ASSISTANTS_CLIENT_ID && 
                       existingAssistant.subscriptionId === 0;
const isSubscriptionLevel = existingAssistant.subscriptionId != null && 
                            existingAssistant.subscriptionId !== 0;

if (isSystemLevel || isSubscriptionLevel) {
  // Add to blacklist instead of deleting
  await this.blacklistAssistant(clientId, assistantId);
} else {
  // Workspace-level: actually delete
  await this.assistantRepository.deleteByPk({...});
}
```

#### 2. Add `blacklistAssistant()` Method

**File**: `src/services/assistant.service.ts`

**Purpose**: Add assistant to workspace blacklist
- Check if already blacklisted (idempotent)
- Insert into `client_blacklisted_assistant` table
- Handle errors gracefully

#### 3. Add `restoreAssistant()` Method

**File**: `src/services/assistant.service.ts`

**Purpose**: Remove assistant from workspace blacklist (unhide)
- Verify assistant exists and is blacklisted for the workspace
- Remove from `client_blacklisted_assistant` table
- Return success/error appropriately

#### 4. Add Restore Route Endpoint

**File**: `src/routes/v1/assistant.route.ts`

**New endpoint**: `POST /assistants/:assistant_id/restore`
- Permission: `Permission.AGENT_DELETE` (same as delete, since it's the inverse)
- Calls `assistantService.restoreAssistant(clientId, assistantId)`
- Returns 200 on success, 404 if not blacklisted

#### 5. Update Types and Schemas

**File**: `src/types/assistant.ts`
- No changes needed (blacklist is internal implementation detail)

**File**: `src/schemas/assistant.ts`
- Add `RestoreAssistantSchema` for the new restore endpoint

#### 6. Update Response Messages

**Consideration**: The delete endpoint should return appropriate messages:
- For system/subscription: "Assistant hidden from workspace" 
- For workspace-level: "Assistant deleted"

However, since current API returns 204 (no content), we may keep that for backward compatibility.

## Implementation Details

### Scope Detection Logic

```typescript
private isSystemOrSubscriptionLevel(assistant: Assistant): boolean {
  const isSystemLevel = assistant.clientId === SYSTEM_ASSISTANTS_CLIENT_ID && 
                       assistant.subscriptionId === 0;
  const isSubscriptionLevel = assistant.subscriptionId != null && 
                              assistant.subscriptionId !== 0;
  return isSystemLevel || isSubscriptionLevel;
}
```

### Blacklist Management

- Use existing `clientBlacklistedAssistantRepository` (already injected in constructor)
- Handle duplicate key errors gracefully (already blacklisted)
- Ensure idempotent operations

### Error Handling

- `AssistantNotFoundException`: If assistant doesn't exist
- Handle case where assistant is already blacklisted (idempotent - return success)
- Handle case where trying to restore non-blacklisted assistant (return 404 or specific error)

### Permission Considerations

- Current delete requires `Permission.AGENT_DELETE`
- Restore should use same permission (inverse operation)
- System/subscription admins can still actually delete at their level if needed (future consideration)

## Edge Cases to Handle

1. **Already blacklisted**: Delete operation should be idempotent (check first, insert if not exists)
2. **Restore non-blacklisted**: Return appropriate error (404 or specific message)
3. **Workspace-level assistant**: Continue actual deletion (no change)
4. **Deleted workspace-level assistant**: Restore should fail (can't restore what was actually deleted)
5. **Concurrent operations**: Database constraints handle race conditions

## Testing Considerations

1. Test deleting system-level assistant (should blacklist, not delete)
2. Test deleting subscription-level assistant (should blacklist, not delete)
3. Test deleting workspace-level assistant (should actually delete)
4. Test restoring blacklisted assistant (should remove from blacklist)
5. Test restoring non-blacklisted assistant (should return error)
6. Test idempotency (delete twice, restore twice)
7. Test that other workspaces still see system/subscription assistants after one workspace "deletes" them

## Migration Considerations

- No database migration needed (table already exists)
- Existing blacklisted assistants will continue to work
- No data migration needed

## Implementation Todos

1. **modify_delete_method**: Modify delete() method in AssistantService to check scope and blacklist system/subscription assistants instead of deleting
2. **add_blacklist_method**: Add blacklistAssistant() private method to handle adding assistants to workspace blacklist
3. **add_restore_method**: Add restoreAssistant() public method to remove assistants from workspace blacklist
4. **add_restore_route**: Add POST /assistants/:assistant_id/restore endpoint in assistant.route.ts (depends on: add_restore_method)
5. **add_restore_schema**: Add RestoreAssistantSchema in schemas/assistant.ts for the restore endpoint
6. **update_error_handling**: Update error handling and edge cases (already blacklisted, restore non-blacklisted, etc.) (depends on: add_blacklist_method, add_restore_method)

## Future Enhancements (Out of Scope)

- Admin UI to see blacklisted assistants per workspace
- Bulk restore operations
- Audit logging for blacklist operations
- System/subscription admin ability to actually delete (override blacklist)
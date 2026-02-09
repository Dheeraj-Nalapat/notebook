# Agent Builder Beta Migration - Comprehensive Analysis Report

## Table of Contents
1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [System Reaction Analysis](#system-reaction-analysis)
4. [Scale and Multi-Worker Behavior](#scale-and-multi-worker-behavior)
5. [Database Load Analysis](#database-load-analysis)
6. [Edge Cases and Error Handling](#edge-cases-and-error-handling)
7. [Recommendations](#recommendations)

---

## Overview

This document provides a comprehensive analysis of the `agent-builder-beta-migration.ts` script, which migrates clients from Assistant Framework V1 to V2. The script runs in a worker that processes messages from a RabbitMQ queue.

**Key Script Details:**
- **Entry Point**: `handleAgentBuilderBetaEnable(clientId, updateClientBetaFeatureTable)`
- **Worker**: `MigrationScriptRunner` consuming from `MIGRATION_SCRIPT_RUNNER_QUEUE`
- **Batch Sizes**: 
  - Assistant updates: 20 per batch
  - Chat inserts: 500 per batch

---

## System Architecture

### Message Flow

```
RabbitMQ Queue → MigrationScriptRunner.run() → handleAgentBuilderBetaEnable()
```

**Message Format:**
```json
{
  "type": "ENABLE_AGENT_BUILDER_BETA",
  "client_id": 123,
  "update_client_beta_feature_table": false
}
```

### Processing Steps

1. **Get Assistants to Migrate**: Query for V1 assistants (excluding PREVIEW status)
2. **Build Migration Context**: Fetch capabilities, tools, and models
3. **Migrate Assistants**: Update assistants to V2 framework with capability configs
4. **Create Default Chats**: Create default chats for conversation works
5. **Update Feature Flag**: Add client to Optimizely or update beta feature table

### RabbitMQ Configuration

- **Prefetch**: 1 message per worker (fair dispatch)
- **Acknowledgment**: Manual (noAck: false)
- **Error Handling**: NACK without requeue (prevents infinite loops)

---

## System Reaction Analysis

### Scenario 1: Successful Migration

**Flow:**
- Message parsed successfully
- Assistants found and migrated
- Default chats created
- Feature flag updated

**System Reaction:**
- ✅ Message is ACKed (acknowledged) in RabbitMQ
- ✅ Message removed from queue
- ✅ Success logs recorded

**Outcome**: Clean success, no rollback needed

---

### Scenario 2: Invalid/Malformed Message

**Cases:**
- Invalid JSON
- Missing `client_id`
- Missing or invalid `type`
- Wrong message type

**System Reaction:**
- ❌ `JSON.parse()` throws → caught in `handleMessage()`
- ❌ Error logged
- ❌ Message NACKed (not acknowledged) with `requeue: false`
- ❌ Message is **lost** (not requeued to prevent infinite loops)

**Code Reference:**
```typescript
// src/helpers/amqp.ts
async handleError(err: Error, ch: Channel, msg: any, queue: string) {
  logger.error(`Nacking message ${queue} ${err.stack}`);
  ch.nack(msg!, false, false); // Don't requeue msg or it will enter an infinite loop
}
```

**Note**: If `type` doesn't match any case, it logs an error but doesn't throw, so the message is still ACKed.

---

### Scenario 3: Migration Script Error (with Rollback)

**Cases:**
- Database connection failure
- Missing SYSTEM_USER_ID
- No default assistant found
- Assistant migration failures
- Chat creation failures

**System Reaction:**
- ❌ Error caught in `handleAgentBuilderBetaEnable()`
- 🔄 Rollback triggered: `rollbackAgentBuilderMigration()`
- 🔄 Rollback attempts:
  - Revert assistants to V1
  - Delete script-generated chats
- ❌ Error logged
- ❌ Exception propagates to worker → message NACKed

**Rollback Process:**
1. Revert all assistants with `frameworkVersion = V2` back to V1
2. Delete all chats with `metadata.migration_script = 'agent_builder_beta'`

---

### Scenario 4: Partial Migration Success

#### 4a. Assistant Migration Failures

**System Reaction:**
- Batch processing with `Promise.allSettled()`
- Failed assistants logged
- If **any** fail, throws error → triggers **full rollback**
- All assistants reverted to V1

**Code Reference:**
```typescript
// If any assistant fails, entire migration fails
if (failedAssistants.length > 0) {
  throw new Error(
    `Failed to migrate ${failedAssistants.length} assistants: ${failedAssistants.join(', ')}`,
  );
}
```

#### 4b. Chat Creation Failure

**System Reaction:**
- ❌ Error thrown → triggers rollback
- 🔄 All assistants reverted
- 🔄 Script-generated chats deleted

#### 4c. Optimizely/Policy Service Failure

**System Reaction:**
- If Optimizely credentials missing: ⚠️ Warning logged, continues
- If `enableBetaFeature()` fails: ❌ Error thrown → rollback triggered

---

### Scenario 5: Edge Cases

#### 5a. No Assistants to Migrate
- ✅ Skips assistant migration
- ✅ Still creates default chats
- ✅ Still updates feature flag
- ✅ No rollback needed

#### 5b. No Conversation Works
- ✅ Skips chat creation
- ✅ Continues with feature flag update
- ✅ No error

#### 5c. Missing SYSTEM_USER_ID
- ⚠️ Throws error in model fetching functions
- ⚠️ Caught and logged as warning, returns empty array
- ⚠️ Migration continues but may fail later if models are required

#### 5d. Invalid Model IDs in Assistants
- ⚠️ Invalid models filtered out with warning
- ✅ Migration continues with valid models
- ⚠️ If no valid models, uses modelId 0

#### 5e. Missing Default Assistant
- ❌ Throws error
- 🔄 Triggers rollback
- ❌ Message NACKed

---

### Scenario 6: Rollback Failures

**Cases:**
- Rollback itself fails (database issues, etc.)

**System Reaction:**
- ❌ Rollback errors are logged and re-thrown
- ❌ Original error + rollback error both logged
- ❌ Message still NACKed
- ⚠️ System left in **inconsistent state** (manual intervention needed)

---

### Summary Table: System Reactions

| Scenario | Message Status | Rollback | System State |
|----------|---------------|----------|--------------|
| Success | ACKed | No | Migrated |
| Invalid message | NACKed (no requeue) | No | Unchanged |
| Migration error | NACKed | Yes | Rolled back |
| Partial assistant failure | NACKed | Yes | Rolled back |
| Chat creation failure | NACKed | Yes | Rolled back |
| Optimizely failure | ACKed (if non-fatal) | No | Partially migrated |
| No assistants/works | ACKed | No | Feature flag updated |
| Missing SYSTEM_USER_ID | ACKed (may fail later) | Possible | Depends |
| Rollback failure | NACKed | Partial | Inconsistent |

---

## Scale and Multi-Worker Behavior

### Current Scale Limits

**Batch Processing Configuration:**
- Assistant updates: **20 per batch**
- Chat bulk inserts: **500 per batch**

**Query Limits:**
- ❌ **No pagination**: Queries fetch ALL assistants/works for a client in one query
- ⚠️ **Memory impact**: Large clients load all data into memory
- ⚠️ **Theoretical limits**: Unlimited (batched), but practical limit is memory and database query timeouts

### Scale Scenarios

| Client Size | Assistants | Conversation Works | Memory Impact | Processing Time (est.) |
|------------|------------|-------------------|---------------|----------------------|
| Small | 10 | 100 | Low | ~30 seconds |
| Medium | 500 | 5,000 | Medium | ~5-10 minutes |
| Large | 5,000 | 50,000 | High | ~30-60 minutes |
| Very Large | 50,000 | 500,000 | Very High | Hours (risk of timeout) |

### Multi-Worker Configuration

**RabbitMQ Consumer Settings:**
- `prefetch(1)`: Each worker processes **one unacknowledged message** at a time
- `noAck: false`: Messages require explicit ACK/NACK
- **Round-robin distribution**: RabbitMQ distributes messages to available workers

### Behavior with Multiple Workers

#### Scenario 1: Different Clients (Ideal Case)
```
Worker 1: Processing client 100
Worker 2: Processing client 200
Worker 3: Processing client 300
```
- ✅ No conflicts
- ✅ Parallel processing
- ✅ Throughput scales linearly with worker count

#### Scenario 2: Same Client, Different Messages (Race Condition)
```
Time T0: Message for client 100 arrives
Time T1: Message for client 100 arrives (duplicate/retry)
         ↓
Worker 1: Starts processing client 100
Worker 2: Starts processing client 100 (simultaneously)
```

**What Happens:**

1. **Assistant Migration** (Mostly Safe):
   - Both workers query for `frameworkVersion = V1` assistants
   - If Worker 1 migrates first, Worker 2 finds 0 assistants (idempotent)
   - If both run concurrently, both may migrate the same assistants
   - ⚠️ **Risk**: Duplicate migrations of same assistant (overwrites, but not ideal)

2. **Chat Creation** (Duplicate Risk):
   - ❌ No unique constraint on `(work_id, work_version_id, assistant_id)`
   - ❌ Both workers create chats for the same works
   - ❌ **Result**: Duplicate default chats per work

3. **Feature Flag Update** (Last Write Wins):
   - Both workers call Optimizely/Policy service
   - Last write wins (usually safe, but wasteful)

**Note**: User mentioned that same client issue is handled at message publishing level, so this scenario may not occur in practice.

### Impact of Increasing Worker Count

**Benefits:**
- ✅ Higher throughput for different clients
- ✅ Better resource utilization
- ✅ Faster queue processing

**Risks:**
- ⚠️ Higher chance of concurrent processing of same client (if not handled at publish)
- ⚠️ Duplicate chat creation (if race condition occurs)
- ⚠️ Wasted work (duplicate migrations)
- ⚠️ Database contention

**Example with 10 Workers:**
```
Queue: [Client 100, Client 100, Client 200, Client 300, ...]
       ↓
Worker 1-10: Each picks one message
Result: 2 workers processing Client 100 simultaneously
        → Duplicate chats created (if not prevented at publish)
        → Wasted database operations
```

### Current Protection Mechanisms

**What Exists:**
1. ✅ Prefetch = 1: Limits in-flight messages per worker
2. ✅ Framework version filter: Reduces duplicate assistant migrations
3. ✅ Rollback on error: Attempts cleanup on failure

**What's Missing:**
1. ❌ No distributed locking: No mechanism to prevent concurrent processing of same client
2. ❌ No idempotency check: Doesn't check if migration already completed
3. ❌ No unique constraint: Chats can be duplicated
4. ❌ No transaction boundaries: Partial migrations possible

---

## Database Load Analysis

### Database Operations Per Client Migration

#### Read Operations (SELECT queries):
1. `getAssistantsToMigrate()`: **1 SELECT**
2. `buildMigrationContext()`:
   - Capabilities: **1 SELECT** (shared data, but each worker queries)
   - Tools: **1 SELECT** (shared data, but each worker queries)
3. `getConversationWorks()`: **1 SELECT**
4. `getDefaultAssistantId()`: **1 SELECT** (shared data, but each worker queries)

#### Write Operations:
5. `migrateAssistantsToV2()`: 
   - `UPDATE` queries = `ceil(assistants_count / 20)` (batched in 20s)
   - Each batch processes 20 assistants in parallel via `Promise.allSettled()`
6. `createDefaultChatsForConversationWorks()`:
   - `INSERT` queries = `ceil(conversation_works_count / 500)` (batched in 500s)

#### External API Calls (not DB, but adds latency):
- 2 calls to `policyService.listModels()` (can be slow)

### Load Calculation with 40 Workers

**Assumptions:**
- 40 workers processing different clients simultaneously
- Each client has varying sizes (small, medium, large)
- Spanner connection pooling (shared across workers)

#### Scenario 1: Small Clients (10 assistants, 100 conversation works each)

| Operation | Per Client | 40 Workers (Parallel) |
|-----------|------------|------------------------|
| SELECT queries | 5 | **200 SELECT queries** |
| UPDATE queries | 1 (10/20 = 1 batch) | **40 UPDATE queries** |
| INSERT queries | 1 (100/500 = 1 batch) | **40 INSERT queries** |
| **Total DB ops** | **7** | **280 operations** |

#### Scenario 2: Medium Clients (500 assistants, 5,000 conversation works each)

| Operation | Per Client | 40 Workers (Parallel) |
|-----------|------------|------------------------|
| SELECT queries | 5 | **200 SELECT queries** |
| UPDATE queries | 25 (500/20 = 25 batches) | **1,000 UPDATE queries** |
| INSERT queries | 10 (5,000/500 = 10 batches) | **400 INSERT queries** |
| **Total DB ops** | **40** | **1,600 operations** |

#### Scenario 3: Large Clients (5,000 assistants, 50,000 conversation works each)

| Operation | Per Client | 40 Workers (Parallel) |
|-----------|------------|------------------------|
| SELECT queries | 5 | **200 SELECT queries** |
| UPDATE queries | 250 (5,000/20 = 250 batches) | **10,000 UPDATE queries** |
| INSERT queries | 100 (50,000/500 = 100 batches) | **4,000 INSERT queries** |
| **Total DB ops** | **355** | **14,200 operations** |

### Database Load Breakdown

#### 1. Read Load (SELECT queries)

**Shared Data Queries (Redundant Across Workers):**
- Capabilities query: Same result for all workers
- Tools query: Same result for all workers  
- Default assistant query: Same result for all workers

**Impact**: With 40 workers, these 3 queries execute **40 times each** = **120 redundant queries**. Consider caching.

**Client-Specific Queries:**
- Assistants query: Different per client
- Conversation works query: Different per client

#### 2. Write Load (UPDATE/INSERT)

**Assistant Updates:**
- Each UPDATE modifies 3 fields: `frameworkVersion`, `capabilityConfig`, `status`
- Batched in groups of 20

**Chat Inserts:**
- Bulk insert of 500 chats per batch
- Each INSERT creates 500 rows

#### 3. Spanner-Specific Considerations

**Mutation Limits:**
- Spanner has limits on mutations per transaction
- Current batch sizes (20 assistants, 500 chats) should be within limits
- With 40 workers, total mutations can be very high

**Connection Pooling:**
- Spanner uses connection pooling (managed by `@btg-pencil-ai/pencil-commonlib`)
- 40 workers share the pool
- ⚠️ **Risk**: Connection pool exhaustion if pool size < 40

**Transaction Contention:**
- Each `updateByPk` is a separate transaction
- Each `bulkInsert` is a separate transaction
- ✅ Low contention risk (different clients = different rows)

### Peak Load Scenarios

**Worst Case: 40 Large Clients Simultaneously**

```
Read Operations:
- 200 SELECT queries (5 per client × 40)
- All executing simultaneously

Write Operations:
- 10,000 UPDATE queries (250 per client × 40)
- 4,000 INSERT queries (100 per client × 40)
- Total: 14,000 write operations

Timeline:
- T0: All 40 workers start
- T0-T5s: 200 SELECT queries execute (parallel)
- T5s-T60s: 10,000 UPDATE queries execute (batched, but many concurrent)
- T60s-T120s: 4,000 INSERT queries execute (batched, but many concurrent)
```

**Database Load Metrics:**

| Metric | Value | Impact |
|--------|-------|--------|
| Concurrent SELECT queries | 200 | Medium (read-heavy) |
| Concurrent UPDATE queries | Up to 40 batches (800 assistants) | High (write-heavy) |
| Concurrent INSERT queries | Up to 40 batches (20,000 chats) | Very High (bulk inserts) |
| Total mutations/second | ~100-200 mutations/sec | High |
| Connection pool usage | 40+ connections | Risk if pool < 40 |

### Potential Bottlenecks

#### 1. Connection Pool Exhaustion
- ⚠️ **Risk**: If Spanner connection pool < 40, workers may wait for connections
- ⚠️ **Impact**: Queued operations, increased latency
- ✅ **Mitigation**: Ensure pool size ≥ 40 + buffer

#### 2. Shared Data Query Redundancy
- ⚠️ **Problem**: 40 workers querying same capabilities/tools/default assistant
- ⚠️ **Impact**: Wasted DB resources, slower startup
- ✅ **Mitigation**: Cache shared data (Redis or in-memory)

#### 3. Bulk Insert Contention
- ⚠️ **Problem**: 40 workers doing bulk inserts simultaneously
- ⚠️ **Impact**: Spanner write throughput limits
- ✅ **Mitigation**: Current batching (500) helps, but monitor Spanner metrics

#### 4. Policy Service API Calls
- ⚠️ **Problem**: 2 API calls per client = 80 concurrent API calls
- ⚠️ **Impact**: External service rate limiting, latency
- ✅ **Mitigation**: Rate limiting, retry logic

#### 5. Memory Usage
- ⚠️ **Problem**: Loading all assistants/works into memory
- ⚠️ **Impact**: High memory per worker (40 × memory per client)
- ✅ **Mitigation**: Pagination for large clients

### Expected Database Load Summary

**With 40 Workers Processing Different Clients:**

| Client Size | DB Ops/Client | Total Concurrent Ops | Peak Mutations/sec | Risk Level |
|------------|---------------|---------------------|-------------------|------------|
| Small (10/100) | 7 | 280 | ~50-100 | Low |
| Medium (500/5K) | 40 | 1,600 | ~200-400 | Medium |
| Large (5K/50K) | 355 | 14,200 | ~500-1000 | High |

**Key Risks:**
1. ⚠️ Connection pool exhaustion (if pool < 40)
2. ⚠️ Spanner mutation quota limits (depends on instance)
3. ⚠️ Shared query redundancy (120 redundant queries)
4. ⚠️ Memory usage (loading all data into memory)

---

## Edge Cases and Error Handling

### Error Handling Flow

```
handleAgentBuilderBetaEnable()
  ↓ (error occurs)
catch block
  ↓
rollbackAgentBuilderMigration()
  ↓
rollbackAssistantMigrations() + rollbackChatCreations()
  ↓ (if rollback fails)
Error re-thrown → Message NACKed
```

### Edge Cases Summary

| Edge Case | Behavior | Impact |
|-----------|----------|--------|
| No assistants | Skips migration, continues | Safe |
| No conversation works | Skips chat creation, continues | Safe |
| Missing SYSTEM_USER_ID | Warning, empty models array | May fail later |
| Invalid model IDs | Filtered out, warning logged | Continues with valid models |
| Missing default assistant | Error, rollback triggered | Migration fails |
| Rollback failure | Error logged, inconsistent state | Manual intervention needed |
| Optimizely credentials missing | Warning, skips Optimizely update | Migration continues |

---

## Recommendations

### 1. Immediate Improvements

#### Add Idempotency Check
```typescript
// Check if migration already completed
const alreadyMigrated = await checkIfClientAlreadyMigrated(clientId);
if (alreadyMigrated) {
  logger.info(`Client ${clientId} already migrated, skipping`);
  return;
}
```

#### Add Caching for Shared Queries
```typescript
// Cache capabilities, tools, and default assistant
// Use Redis or in-memory cache with TTL
// Reduces 120 redundant queries to 3 queries
```

#### Add Unique Constraint Check for Chats
```typescript
// Check if default chat already exists before creating
const existingChat = await chatRepo.find({
  where: {
    [Op.AND]: [
      { field: 'workId', op: Op.EQ, value: work.workId },
      { field: 'workVersionId', op: Op.EQ, value: work.workVersionId },
      { field: 'assistantId', op: Op.EQ, value: defaultAssistantId },
      { field: 'metadata.is_default_chat', op: Op.EQ, value: true },
    ],
  },
});
if (existingChat.length > 0) {
  // Skip creation
}
```

### 2. Performance Optimizations

#### Add Pagination for Large Datasets
```typescript
// Process assistants in chunks instead of loading all
async function* getAssistantsInBatches(clientId: number) {
  let offset = 0;
  const limit = 1000;
  while (true) {
    const batch = await assistantRepo.find({
      where: { /* conditions */ },
      limit,
      offset,
    });
    if (batch.length === 0) break;
    yield batch;
    offset += limit;
  }
}
```

#### Connection Pool Configuration
- Ensure Spanner connection pool ≥ 50 for 40 workers
- Monitor connection pool usage during peak load
- Add connection pool metrics/alerts

### 3. Monitoring and Observability

#### Key Metrics to Monitor
1. **Database Metrics:**
   - Spanner mutations/second
   - Read operations/second
   - Connection pool usage
   - Query latency

2. **Worker Metrics:**
   - Messages processed/second
   - Error rate
   - Rollback rate
   - Processing time per client

3. **Resource Metrics:**
   - Memory usage per worker
   - CPU usage
   - Network I/O

#### Alerts to Set Up
- Spanner mutation quota approaching limit
- Connection pool exhaustion
- High error rate (>5%)
- High rollback rate
- Processing time > 1 hour per client

### 4. Scalability Considerations

#### For 40 Workers:
- ✅ **Current system should handle** small-medium clients well
- ⚠️ **Large clients may stress** Spanner limits
- ✅ **Monitor and optimize** based on actual metrics

#### Future Scaling:
- Consider distributed locking if same-client processing becomes an issue
- Implement rate limiting if approaching Spanner quotas
- Add pagination for very large clients
- Consider splitting large clients into multiple messages

### 5. Safety Measures

#### Transaction Boundaries
- Consider wrapping assistant migration in a transaction
- Consider wrapping chat creation in a transaction
- Ensure atomicity of operations

#### Retry Logic
- Add exponential backoff for transient failures
- Distinguish between retryable and non-retryable errors
- Implement dead letter queue for failed messages

#### Testing Recommendations
1. **Load Testing:**
   - Test with 40 workers processing various client sizes
   - Monitor database load and connection pool
   - Test rollback scenarios

2. **Concurrency Testing:**
   - Test same-client processing (if not prevented at publish)
   - Test race conditions
   - Test rollback under load

3. **Failure Testing:**
   - Test database connection failures
   - Test external API failures
   - Test rollback failures
   - Test partial migration failures

---

## Conclusion

The agent-builder-beta-migration script is designed with **all-or-nothing** semantics: if any critical step fails, rollback is attempted. The system prioritizes **data consistency** over throughput.

**Key Takeaways:**
1. ✅ System handles errors gracefully with rollback mechanism
2. ✅ Works well for different clients with multiple workers
3. ⚠️ Vulnerable to race conditions if same client processed concurrently (handled at publish level)
4. ⚠️ Memory-intensive for very large clients
5. ⚠️ Database load can be high with 40 workers on large clients

**Recommended Actions:**
1. Add caching for shared queries (capabilities, tools, default assistant)
2. Ensure Spanner connection pool ≥ 50
3. Monitor Spanner metrics during peak load
4. Consider pagination for very large clients
5. Add idempotency checks
6. Implement comprehensive monitoring and alerting

---

**Document Version**: 1.0  
**Last Updated**: 2024  
**Author**: System Analysis

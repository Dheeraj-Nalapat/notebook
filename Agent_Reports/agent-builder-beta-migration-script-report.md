# Agent Builder Beta Migration Script - Comprehensive Analysis Report

## Table of Contents
1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Parameter Impact Analysis](#parameter-impact-analysis)
4. [System Reaction by Scale](#system-reaction-by-scale)
5. [Database Load Analysis](#database-load-analysis)
6. [Memory and Resource Analysis](#memory-and-resource-analysis)
7. [AMQP/RabbitMQ Impact](#amqprabbitmq-impact)
8. [Scaling Scenarios](#scaling-scenarios)
9. [Critical Issues and Risks](#critical-issues-and-risks)
10. [Recommendations](#recommendations)

---

## Overview

This document provides a comprehensive analysis of the `migrate.workspaces.to.agentbuilder.js` script, which publishes migration messages to enable Agent Builder beta feature for clients. The script runs as a one-time migration tool that identifies clients without the feature and publishes messages to a RabbitMQ queue for asynchronous processing.

**Key Script Details:**
- **Script**: `scripts/migrate.workspaces.to.agentbuilder.js`
- **Entry Point**: `MigrateWorkspacesToAgentBuilder.run(params)`
- **Message Queue**: `*.spanner_migration_script.runner`
- **Default Batch Size**: 100 clients per batch
- **Concurrent Message Limit**: 10 messages (AMQP publishing)

**Key Parameters:**
- `isPro` (boolean|null): Filter by pro status
- `batchSize` (number): Clients processed per batch (default: 100)
- `numberOfClientsLimit` (number|null): Maximum clients to process

---

## System Architecture

### Message Flow

```
MySQL Database → Script → AMQP Publisher → RabbitMQ Queue → Migration Worker
```

**Processing Flow:**
1. **Fetch Phase**: Single query to fetch all matching clients upfront
2. **Batch Processing**: Process clients in batches (controlled by `batchSize`)
3. **Message Publishing**: Publish AMQP messages with concurrency control (10 concurrent)
4. **Worker Processing**: Downstream workers process messages asynchronously

### Message Format

```json
{
  "type": "ENABLE_AGENT_BUILDER_BETA",
  "client_id": 123,
  "update_client_beta_feature_table": true
}
```

### Database Query Structure

```sql
SELECT c.id, c.name, c.subscription_id
FROM Clients c
LEFT JOIN client_beta_features cbf
  ON cbf.client_id = c.id
  AND cbf.beta_feature_id = 21
WHERE c.deleted_at IS NULL
  AND cbf.client_id IS NULL
  [AND c.is_pro = ?]  -- Optional filter
ORDER BY c.id ASC
[LIMIT ?]  -- Optional limit
```

**Key Characteristics:**
- ✅ Single upfront query (no pagination during fetch)
- ✅ LEFT JOIN to identify clients without feature
- ✅ Optional filtering by `is_pro` status
- ✅ Optional limit to control result set size

---

## Parameter Impact Analysis

### Parameter: `isPro`

**Purpose**: Filter clients by pro status

| Value | Behavior | Impact |
|-------|----------|--------|
| `true` | Only pro clients | Smaller dataset, typically fewer clients |
| `false` | Only non-pro clients | Larger dataset, typically more clients |
| `null/undefined` | All clients | Largest dataset, includes all active clients |

**Database Impact:**
- Adds `AND c.is_pro = ?` filter to query
- Reduces result set size significantly
- Improves query performance with proper index

**Recommendation**: Use `isPro` filter to process clients in separate runs (pro first, then non-pro)

---

### Parameter: `batchSize`

**Purpose**: Number of clients processed per batch during message publishing

| Value | Behavior | Impact |
|-------|----------|--------|
| `50` | Smaller batches | More frequent logging, better error granularity |
| `100` (default) | Medium batches | Balanced processing |
| `200` | Larger batches | Fewer log entries, less granular error tracking |

**Important Note**: `batchSize` does NOT affect:
- ❌ Initial database query (all clients fetched upfront)
- ❌ AMQP throughput (controlled by `CONCURRENT_MESSAGE_LIMIT = 10`)
- ❌ Memory usage (all clients loaded into memory)

**What `batchSize` DOES affect:**
- ✅ Batch processing time (larger batches = longer wait per batch)
- ✅ Error recovery granularity (smaller batches = easier to identify failures)
- ✅ Logging frequency (smaller batches = more frequent progress updates)

**Throughput Calculation:**
```
AMQP Concurrency: 10 messages
Average publish time: ~50-100ms per message
Effective throughput: ~100-200 messages/second

Batch processing time:
- batchSize 50: ~0.25-0.5 seconds per batch
- batchSize 100: ~0.5-1 second per batch
- batchSize 200: ~1-2 seconds per batch
```

---

### Parameter: `numberOfClientsLimit`

**Purpose**: Maximum number of clients to process (safety limit)

| Value | Behavior | Impact |
|-------|----------|--------|
| `null/undefined` | No limit | Processes ALL matching clients (potentially 50K-200K+) |
| `1000` | Small limit | Safe for testing, ~1K clients |
| `10000` | Medium limit | Production-safe for most cases |
| `50000` | Large limit | High memory usage, long processing time |

**Critical Impact:**
- ✅ **Memory**: Directly controls how many client objects are loaded into memory
- ✅ **Database Query**: Adds `LIMIT ?` to query, reducing result set
- ✅ **Processing Time**: Limits total processing time
- ✅ **Risk Management**: Prevents runaway migrations

**Memory Calculation:**
```
Per client object: ~100-200 bytes
- 1,000 clients = ~100-200 KB
- 10,000 clients = ~1-2 MB
- 100,000 clients = ~10-20 MB
- 1,000,000 clients = ~100-200 MB
```

**Recommendation**: Always use `numberOfClientsLimit` for large migrations. Start small, monitor, then increase.

---

## System Reaction by Scale

### Scenario 1: Small-Scale Migration (Testing)

**Parameters:**
```json
{
  "isPro": false,
  "batchSize": 50,
  "numberOfClientsLimit": 100
}
```

**System Reaction:**

| Component | Impact | Details |
|-----------|--------|---------|
| **Database** | ✅ Minimal | ~100 rows, ~0.5-1 second query time |
| **Memory** | ✅ Low | ~20 KB client data, ~15 KB log file |
| **AMQP** | ✅ Low | ~10 seconds to publish all messages |
| **Processing Time** | ✅ Fast | ~10-15 seconds total |
| **Risk Level** | ✅ Low | Safe for testing |

**Use Case**: Initial testing, validation, dry runs

---

### Scenario 2: Medium-Scale Migration

**Parameters:**
```json
{
  "isPro": false,
  "batchSize": 100,
  "numberOfClientsLimit": 1000
}
```

**System Reaction:**

| Component | Impact | Details |
|-----------|--------|---------|
| **Database** | ⚠️ Moderate | ~1K rows, ~1-2 seconds query time |
| **Memory** | ✅ Low-Medium | ~200 KB client data, ~150 KB log file |
| **AMQP** | ✅ Low-Medium | ~5-10 seconds to publish all messages |
| **Processing Time** | ✅ Fast | ~10-20 seconds total |
| **Risk Level** | ✅ Low-Medium | Production-safe for most cases |

**Use Case**: Phased migrations, production rollouts

---

### Scenario 3: Large-Scale Migration

**Parameters:**
```json
{
  "isPro": false,
  "batchSize": 200,
  "numberOfClientsLimit": 10000
}
```

**System Reaction:**

| Component | Impact | Details |
|-----------|--------|---------|
| **Database** | ⚠️ High | ~10K rows, ~5-10 seconds query time, potential lock |
| **Memory** | ⚠️ Medium | ~2 MB client data, ~1.5 MB log file |
| **AMQP** | ⚠️ Medium | ~50-100 seconds to publish all messages |
| **Processing Time** | ⚠️ Medium | ~1-2 minutes total |
| **Risk Level** | ⚠️ Medium | Monitor database and AMQP queue |

**Use Case**: Large production migrations, requires monitoring

---

### Scenario 4: Full Migration (No Limit) ⚠️

**Parameters:**
```json
{
  "isPro": false,
  "batchSize": 100,
  "numberOfClientsLimit": null
}
```

**System Reaction:**

| Component | Impact | Details |
|-----------|--------|---------|
| **Database** | ❌ Very High | 50K-200K+ rows, 30+ seconds query time, high lock risk |
| **Memory** | ⚠️ High | ~10-40 MB client data, ~7.5-30 MB log file |
| **AMQP** | ⚠️ High | ~250-1000+ seconds (4-16+ minutes) to publish |
| **Processing Time** | ⚠️ High | ~5-20 minutes total script time |
| **Risk Level** | ❌ High | Requires careful planning and monitoring |

**Use Case**: Complete migration, should be done in phases

**Estimated Timings for Full Migration:**

| Client Count | Database Query | AMQP Publishing | Total Script Time |
|--------------|----------------|-----------------|-------------------|
| 10,000 | ~5-10 seconds | ~50-100 seconds | ~1-2 minutes |
| 50,000 | ~20-30 seconds | ~250-500 seconds | ~5-10 minutes |
| 100,000 | ~30-60 seconds | ~500-1000 seconds | ~10-20 minutes |
| 200,000 | ~60-120 seconds | ~1000-2000 seconds | ~20-40 minutes |

---

## Database Load Analysis

### Query Characteristics

**Single Upfront Query:**
```sql
SELECT c.id, c.name, c.subscription_id
FROM Clients c
LEFT JOIN client_beta_features cbf ON ...
WHERE c.deleted_at IS NULL AND cbf.client_id IS NULL
ORDER BY c.id ASC
[LIMIT ?]
```

**Query Performance Factors:**

1. **Table Sizes:**
   - `Clients` table: Potentially 100K-1M+ rows
   - `client_beta_features` table: Potentially 50K-500K+ rows
   - LEFT JOIN on large tables can be expensive

2. **Index Requirements:**
   ```sql
   -- Recommended indexes for optimal performance:
   CREATE INDEX idx_client_beta_features_client_feature 
     ON client_beta_features(client_id, beta_feature_id);
   
   CREATE INDEX idx_clients_deleted_pro 
     ON Clients(deleted_at, is_pro, id);
   ```

3. **Sorting Impact:**
   - `ORDER BY c.id ASC` requires sorting
   - Large result sets increase sort time
   - Memory-based sort for small sets, disk-based for large sets

### Database Load by Scale

| Client Count | Query Time | Memory Usage | Lock Risk | Index Impact |
|--------------|------------|--------------|-----------|--------------|
| 100 | < 0.5s | Minimal | Low | Negligible |
| 1,000 | 1-2s | Low | Low | Low |
| 10,000 | 5-10s | Medium | Medium | Medium |
| 50,000 | 20-30s | High | High | High |
| 100,000+ | 30-60s+ | Very High | Very High | Very High |

### Database Concerns

**1. Long-Running Query:**
- Large queries without `LIMIT` can run for 30+ seconds
- May cause table locks or impact other queries
- **Mitigation**: Always use `numberOfClientsLimit` for large migrations

**2. LEFT JOIN Performance:**
- LEFT JOIN on `client_beta_features` can be expensive
- Without proper indexes, query time increases exponentially
- **Mitigation**: Ensure indexes exist on join columns

**3. Memory-Based Sorting:**
- Large result sets may require disk-based sorting
- Increases query time and I/O load
- **Mitigation**: Use `LIMIT` to reduce result set size

**4. Connection Pooling:**
- Single query uses one database connection
- No connection pool exhaustion risk (only one query)
- ✅ Low risk for database connections

---

## Memory and Resource Analysis

### Memory Consumption Breakdown

**1. Client Data in Memory:**
```javascript
// All clients loaded into memory at once
const allClients = await this.getAllClientsWithoutAgentBuilder(...);
// Each client: { id, name, subscription_id } ≈ 100-200 bytes
```

**Memory Usage by Client Count:**

| Clients | Memory (Client Data) | Log File Size | Total Memory Impact |
|---------|---------------------|---------------|---------------------|
| 100 | ~20 KB | ~15 KB | ~35 KB |
| 1,000 | ~200 KB | ~150 KB | ~350 KB |
| 10,000 | ~2 MB | ~1.5 MB | ~3.5 MB |
| 50,000 | ~10 MB | ~7.5 MB | ~17.5 MB |
| 100,000 | ~20 MB | ~15 MB | ~35 MB |
| 200,000 | ~40 MB | ~30 MB | ~70 MB |

**2. Log File Growth:**
```javascript
// Each client generates ~150 bytes of log entries
// Synchronous file I/O: fs.appendFileSync()
```

**Log Entry Breakdown:**
- Per client: ~150 bytes (timestamp + message + client ID)
- Per batch: ~7.5 KB (50 clients) to ~30 KB (200 clients)
- Total log file: `clients_count × 150 bytes`

**3. Node.js Process Memory:**
- Base process: ~50-100 MB
- Client data: See table above
- Log buffer: Minimal (synchronous writes)
- AMQP connection: ~1-2 MB
- **Total**: Base + Client Data + AMQP

### Memory Risk Assessment

| Client Count | Memory Risk | Recommendation |
|--------------|-------------|---------------|
| < 1,000 | ✅ Low | Safe |
| 1,000 - 10,000 | ✅ Low-Medium | Safe, monitor |
| 10,000 - 50,000 | ⚠️ Medium | Monitor, consider chunking |
| 50,000 - 100,000 | ⚠️ High | Use limit, monitor closely |
| 100,000+ | ❌ Very High | Must use limit, consider redesign |

### Log File I/O Impact

**Current Implementation:**
```javascript
fs.appendFileSync(LOG_FILE_PATH, logEntry); // Synchronous I/O
// Called for EVERY client (could be 100K+ times)
```

**Impact:**
- Synchronous I/O blocks event loop
- High I/O operations for large migrations
- Log file grows linearly with client count

**Performance Impact:**
- 100 clients: ~100 I/O operations, negligible
- 10,000 clients: ~10,000 I/O operations, ~1-2 seconds
- 100,000 clients: ~100,000 I/O operations, ~10-20 seconds

**Recommendation**: Consider buffered or async logging for large migrations

---

## AMQP/RabbitMQ Impact

### Current Implementation

**Connection Management:**
```javascript
await amqp.init(); // Single connection, reused
await amqp.publishMessage(...); // Uses shared channel
```

**Concurrency Control:**
```javascript
const limit = pLimit(CONCURRENT_MESSAGE_LIMIT); // Default: 10
```

**Message Publishing:**
- Persistent messages (`persistent: true`)
- Routing key: `*.spanner_migration_script.runner`
- Message format: JSON with `type`, `client_id`, `update_client_beta_feature_table`

### Throughput Analysis

**Publishing Rate:**
```
Concurrent limit: 10 messages
Average publish time: ~50-100ms per message
Effective throughput: ~100-200 messages/second
```

**Time to Publish by Client Count:**

| Clients | Publishing Time | Throughput |
|---------|----------------|------------|
| 100 | ~0.5-1 seconds | ~100-200 msg/s |
| 1,000 | ~5-10 seconds | ~100-200 msg/s |
| 10,000 | ~50-100 seconds | ~100-200 msg/s |
| 50,000 | ~250-500 seconds | ~100-200 msg/s |
| 100,000 | ~500-1000 seconds | ~100-200 msg/s |

**Note**: `batchSize` does NOT affect AMQP throughput (concurrency is fixed at 10)

### RabbitMQ Queue Impact

**Message Accumulation:**
- Messages are persistent (survive broker restart)
- If workers are slow, messages accumulate in queue
- Queue depth = published messages - processed messages

**Queue Depth Calculation:**
```
If publishing rate > processing rate:
  Queue depth = (publish_rate - process_rate) × time

Example:
  Publishing: 150 msg/s
  Processing: 50 msg/s
  After 1 minute: (150 - 50) × 60 = 6,000 messages in queue
```

**Memory Impact on RabbitMQ:**
- Each message: ~200-300 bytes
- 10,000 messages: ~2-3 MB
- 100,000 messages: ~20-30 MB
- 1,000,000 messages: ~200-300 MB

**Risk**: If workers are slow, queue can grow very large, consuming broker memory

### AMQP Connection Management

**Current Behavior:**
- ✅ Single connection initialized via `amqp.init()`
- ✅ Connection reused for all publishes
- ✅ Channel reused (via `getChannel()`)
- ✅ No connection pool exhaustion (single connection)

**Connection Stability:**
- If connection drops, all publishes fail
- No automatic reconnection in current implementation
- **Risk**: Connection failure causes entire migration to fail

---

## Scaling Scenarios

### Scenario A: Phased Migration (Recommended)

**Strategy**: Process clients in phases with increasing limits

```bash
# Phase 1: Test with small batch
{"isPro": false, "batchSize": 50, "numberOfClientsLimit": 100}

# Phase 2: Medium batch
{"isPro": false, "batchSize": 100, "numberOfClientsLimit": 1000}

# Phase 3: Larger batches
{"isPro": false, "batchSize": 100, "numberOfClientsLimit": 5000}

# Phase 4: Full migration in chunks
{"isPro": false, "batchSize": 100, "numberOfClientsLimit": 10000}
# Repeat until no more clients
```

**Benefits:**
- ✅ Gradual rollout reduces risk
- ✅ Monitor system behavior at each phase
- ✅ Easy to stop if issues arise
- ✅ Validates system capacity incrementally

**Timeline:**
- Phase 1: ~10 seconds
- Phase 2: ~10 seconds
- Phase 3: ~1 minute
- Phase 4: ~1-2 minutes per chunk
- Total: Depends on total client count

---

### Scenario B: Priority-Based Migration

**Strategy**: Migrate pro clients first, then non-pro

```bash
# Step 1: Pro clients (usually fewer)
{"isPro": true, "batchSize": 100, "numberOfClientsLimit": null}

# Step 2: Non-pro clients (usually more)
{"isPro": false, "batchSize": 100, "numberOfClientsLimit": 10000}
# Repeat with increasing limits
```

**Benefits:**
- ✅ Pro clients (typically fewer) migrate faster
- ✅ Lower risk for critical clients
- ✅ Easier to monitor and validate

---

### Scenario C: Time-Based Throttling

**Strategy**: Add delays between batches based on queue depth

**Implementation Concept:**
```javascript
// After each batch, check queue depth
const queueDepth = await amqp.getQueueDepth();
if (queueDepth > 10000) {
  await sleep(5000); // Wait 5 seconds if queue is full
}
```

**Benefits:**
- ✅ Prevents queue overflow
- ✅ Allows workers to catch up
- ✅ Reduces downstream pressure

---

## Critical Issues and Risks

### Issue 1: Memory Risk with Large Datasets ⚠️

**Problem:**
```javascript
// All clients loaded into memory at once
const allClients = await this.getAllClientsWithoutAgentBuilder(...);
// If 200K clients, this is ~20-40 MB just for client data
```

**Impact:**
- High memory usage for large migrations
- Potential Node.js heap exhaustion
- No pagination during fetch phase

**Mitigation:**
- ✅ Always use `numberOfClientsLimit` for large migrations
- ⚠️ Consider chunked fetching for very large datasets (future improvement)

---

### Issue 2: Database Query Performance ⚠️

**Problem:**
- LEFT JOIN on potentially large `client_beta_features` table
- No explicit index hints
- Sorting large result sets can be slow
- Long-running queries may lock tables

**Impact:**
- Query time increases with client count
- Potential table locks affecting other operations
- Database CPU and I/O load

**Mitigation:**
- ✅ Ensure proper indexes exist:
  ```sql
  CREATE INDEX idx_client_beta_features_client_feature 
    ON client_beta_features(client_id, beta_feature_id);
  CREATE INDEX idx_clients_deleted_pro 
    ON Clients(deleted_at, is_pro, id);
  ```
- ✅ Always use `numberOfClientsLimit` to reduce query size
- ✅ Run during low-traffic periods

---

### Issue 3: AMQP Throughput Bottleneck ⚠️

**Problem:**
- Fixed concurrency of 10 may be too low for large migrations
- No backpressure handling if queue fills up
- No monitoring of queue depth during migration

**Impact:**
- Slow publishing for large migrations (hours for 100K+ clients)
- Queue overflow if workers are slow
- No visibility into downstream processing

**Mitigation:**
- ⚠️ Consider making `CONCURRENT_MESSAGE_LIMIT` configurable
- ⚠️ Monitor RabbitMQ queue depth during migration
- ⚠️ Add delays between batches if queue depth grows

---

### Issue 4: Log File I/O Performance ⚠️

**Problem:**
```javascript
fs.appendFileSync(LOG_FILE_PATH, logEntry); // Synchronous I/O
// Called for EVERY client (could be 100K+ times)
```

**Impact:**
- Blocks event loop on each write
- High I/O operations for large migrations
- Log file grows very large

**Mitigation:**
- ⚠️ Consider buffered logging or async file writes
- ⚠️ Reduce logging verbosity for large migrations
- ⚠️ Consider log rotation for very large files

---

### Issue 5: No Error Recovery Mechanism ⚠️

**Problem:**
- If script fails mid-migration, no way to resume
- Must re-run entire migration (may duplicate messages)
- No tracking of which clients were successfully published

**Impact:**
- Duplicate messages if script re-run
- Wasted processing if script fails after publishing some messages
- No way to resume from last successful point

**Mitigation:**
- ⚠️ Script is idempotent (workers skip already-migrated clients)
- ⚠️ Consider adding checkpoint/resume functionality (future improvement)

---

### Issue 6: No Monitoring/Alerting ⚠️

**Problem:**
- No real-time monitoring of migration progress
- No alerts for failures or slow processing
- No visibility into downstream worker processing

**Impact:**
- Blind to issues during migration
- No early warning of problems
- Difficult to troubleshoot failures

**Mitigation:**
- ⚠️ Monitor log files manually
- ⚠️ Set up RabbitMQ queue monitoring
- ⚠️ Consider adding metrics/telemetry (future improvement)

---

## Recommendations

### 1. Immediate Improvements

#### Always Use `numberOfClientsLimit`
```javascript
// ✅ Good: Safe limit
{"isPro": false, "batchSize": 100, "numberOfClientsLimit": 10000}

// ❌ Bad: No limit (risky)
{"isPro": false, "batchSize": 100, "numberOfClientsLimit": null}
```

**Reason**: Prevents memory issues and long-running queries

---

#### Verify Database Indexes
```sql
-- Ensure these indexes exist before migration
CREATE INDEX IF NOT EXISTS idx_client_beta_features_client_feature 
  ON client_beta_features(client_id, beta_feature_id);

CREATE INDEX IF NOT EXISTS idx_clients_deleted_pro 
  ON Clients(deleted_at, is_pro, id);
```

**Reason**: Critical for query performance on large tables

---

#### Use Phased Migration Strategy
```bash
# Start small, increase gradually
Phase 1: 100 clients
Phase 2: 1,000 clients
Phase 3: 5,000 clients
Phase 4: 10,000 clients (repeat until done)
```

**Reason**: Reduces risk, allows monitoring at each phase

---

### 2. Performance Optimizations

#### Make Concurrency Configurable
```javascript
// Add to parameters
const { concurrentLimit = CONCURRENT_MESSAGE_LIMIT } = params;

// Use in publishMigrationMessages
static async publishMigrationMessages(clientIds, concurrentLimit = CONCURRENT_MESSAGE_LIMIT)
```

**Reason**: Allows tuning AMQP throughput based on system capacity

---

#### Add Queue Depth Monitoring
```javascript
// After each batch, check queue depth
const queueDepth = await amqp.getQueueDepth(MIGRATION_SCRIPT_RUNNER_QUEUE);
if (queueDepth > 10000) {
  this.logToFile('warn', `Queue depth high: ${queueDepth}, adding delay`);
  await sleep(5000);
}
```

**Reason**: Prevents queue overflow, allows workers to catch up

---

#### Optimize Logging
```javascript
// Option 1: Buffered logging
const logBuffer = [];
// ... accumulate logs ...
// Flush periodically or at end

// Option 2: Async logging
fs.appendFile(LOG_FILE_PATH, logEntry, (err) => { ... });
```

**Reason**: Reduces I/O blocking, improves performance

---

### 3. Monitoring and Observability

#### Key Metrics to Monitor

**Database Metrics:**
- Query execution time
- Query result set size
- Database CPU and memory usage
- Table lock wait times

**Script Metrics:**
- Total clients fetched
- Clients published per second
- Failed publishes
- Total processing time
- Memory usage

**AMQP Metrics:**
- Queue depth
- Publish rate (messages/second)
- Failed publishes
- Connection status

**Worker Metrics (Downstream):**
- Messages processed per second
- Processing time per client
- Error rate
- Queue consumption rate

---

#### Alerts to Set Up

1. **Database Alerts:**
   - Query time > 30 seconds
   - Database CPU > 80%
   - Table lock wait time > 5 seconds

2. **Script Alerts:**
   - Failed publishes > 1%
   - Processing time > 1 hour
   - Memory usage > 100 MB

3. **AMQP Alerts:**
   - Queue depth > 50,000 messages
   - Publish rate < 50 messages/second
   - Connection failures

4. **Worker Alerts:**
   - Processing rate < 10 messages/second
   - Error rate > 5%
   - Queue depth growing continuously

---

### 4. Safety Measures

#### Dry Run Mode
```javascript
// Add dryRun parameter
const { dryRun = false } = params;

// In publishMigrationMessages
if (dryRun) {
  this.logToFile('info', `[DRY RUN] Would publish for client ${clientId}`);
  published++;
  continue;
}
```

**Reason**: Allows testing without actually publishing messages

---

#### Checkpoint/Resume Functionality
```javascript
// Save progress to file
const checkpointFile = path.join(__dirname, 'checkpoints', `migration-${Date.now()}.json`);
fs.writeFileSync(checkpointFile, JSON.stringify({
  processedClientIds: [...],
  lastProcessedIndex: totalProcessed
}));

// Resume from checkpoint
if (resumeFromCheckpoint) {
  const checkpoint = JSON.parse(fs.readFileSync(checkpointFile));
  // Skip already processed clients
}
```

**Reason**: Allows resuming failed migrations without duplicates

---

#### Idempotency Verification
```javascript
// Before publishing, check if already migrated
const alreadyMigrated = await checkIfClientHasFeature(clientId);
if (alreadyMigrated) {
  this.logToFile('info', `Client ${clientId} already has feature, skipping`);
  continue;
}
```

**Reason**: Prevents duplicate processing (though workers should handle this)

---

### 5. Testing Recommendations

#### Load Testing
1. **Small Scale**: Test with 100 clients, verify all systems
2. **Medium Scale**: Test with 1,000 clients, monitor resources
3. **Large Scale**: Test with 10,000 clients, stress test database
4. **Full Scale**: Test with 50,000+ clients, monitor all systems

#### Failure Testing
1. **Database Failure**: Test behavior when database query fails
2. **AMQP Failure**: Test behavior when connection drops
3. **Partial Failure**: Test behavior when some publishes fail
4. **Worker Backlog**: Test behavior when queue fills up

#### Performance Testing
1. **Query Performance**: Test query time with different client counts
2. **Memory Usage**: Monitor memory with different limits
3. **AMQP Throughput**: Measure actual publish rate
4. **End-to-End**: Measure total time from start to worker completion

---

## Conclusion

The `migrate.workspaces.to.agentbuilder.js` script is designed for **one-time migrations** with **all-or-nothing** publishing semantics. The script prioritizes **simplicity** and **safety** over throughput.

**Key Takeaways:**

1. ✅ **Safe for small-medium migrations** (< 10,000 clients)
2. ⚠️ **Requires careful planning for large migrations** (> 10,000 clients)
3. ⚠️ **Memory usage scales linearly** with client count
4. ⚠️ **AMQP throughput is fixed** at ~100-200 messages/second
5. ⚠️ **Database query performance** is critical for large datasets
6. ✅ **Idempotent design** allows safe re-runs

**Recommended Approach:**

1. **Always use `numberOfClientsLimit`** for large migrations
2. **Use phased migration strategy** (start small, increase gradually)
3. **Verify database indexes** before migration
4. **Monitor all systems** during migration
5. **Test thoroughly** before production migration

**For Production Migration:**

```bash
# Recommended production parameters
{
  "isPro": false,
  "batchSize": 100,
  "numberOfClientsLimit": 10000
}

# Run in phases:
# 1. Test with 100 clients
# 2. Small batch: 1,000 clients
# 3. Medium batch: 5,000 clients
# 4. Large batch: 10,000 clients (repeat until done)
```

---

**Document Version**: 1.0  
**Last Updated**: 2024  
**Author**: System Analysis  
**Related Documents**: 
- `agent-builder-beta-migration-worker-report.md` (downstream worker analysis)
- `scripts/migrate.workspaces.to.agentbuilder.js` (source code)

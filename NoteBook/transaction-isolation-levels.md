# Transaction Isolation Levels — Database Mastery Session

> **Session Goal**: Understand the ACID guarantees, what isolation levels protect against, and how to choose the right level for your use case.

---

## 1. ACID Refresher

Before isolation levels, let's ground ourselves in ACID:

| Property | Meaning | Analogy |
|----------|---------|---------|
| **Atomicity** | All or nothing — transaction fully commits or fully rolls back | Bank transfer: both debit AND credit happen, or neither |
| **Consistency** | DB moves from one valid state to another | Balance can't go negative if constraint says so |
| **Isolation** | Concurrent transactions don't interfere with each other | Two cashiers working on the same account don't see partial work |
| **Durability** | Once committed, data survives crashes | Written to disk, not just memory |

**Isolation** is the one we can *tune* — and that's where isolation levels come in.

---

## 2. The Problems (Read Phenomena)

Isolation levels exist to prevent these concurrency problems:

### Dirty Read
Reading uncommitted data from another transaction.

```
Transaction A:                    Transaction B:
BEGIN;
UPDATE accounts SET               
  balance = 500                   
  WHERE id = 1;                   
  -- (not committed yet!)         
                                  BEGIN;
                                  SELECT balance FROM accounts 
                                  WHERE id = 1;
                                  -- Reads 500 ← DIRTY READ! 💀
ROLLBACK;                         
                                  -- Transaction B used data that 
                                  -- was never actually committed!
```

### Non-Repeatable Read
Same query returns different values within one transaction.

```
Transaction A:                    Transaction B:
BEGIN;
SELECT balance FROM accounts      
WHERE id = 1;  -- Returns 1000    
                                  BEGIN;
                                  UPDATE accounts SET balance = 500 
                                  WHERE id = 1;
                                  COMMIT;
SELECT balance FROM accounts      
WHERE id = 1;  -- Returns 500 ← DIFFERENT! 💀
-- Same query, different result within same transaction
```

### Phantom Read
New rows appear (or disappear) when re-running a query.

```
Transaction A:                    Transaction B:
BEGIN;
SELECT COUNT(*) FROM orders       
WHERE status = 'pending';         
-- Returns 5                      
                                  BEGIN;
                                  INSERT INTO orders (status) 
                                  VALUES ('pending');
                                  COMMIT;
SELECT COUNT(*) FROM orders       
WHERE status = 'pending';         
-- Returns 6 ← PHANTOM ROW! 👻
```

### Serialization Anomaly (Write Skew)
Two transactions read overlapping data and make decisions that conflict.

```
-- Rule: At least one doctor must be on call
-- Currently: Doctor A (on_call) and Doctor B (on_call)

Transaction A:                    Transaction B:
BEGIN;                            BEGIN;
SELECT COUNT(*) FROM doctors      SELECT COUNT(*) FROM doctors
WHERE on_call = true;             WHERE on_call = true;
-- Returns 2 (safe to go off)    -- Returns 2 (safe to go off)

UPDATE doctors SET on_call=false  UPDATE doctors SET on_call=false
WHERE name = 'Doctor A';         WHERE name = 'Doctor B';
COMMIT;                           COMMIT;

-- Result: NOBODY is on call! 💀 Constraint violated!
```

---

## 3. The Four Isolation Levels (SQL Standard)

```
Isolation Level        Dirty    Non-Repeatable   Phantom    Serialization
                       Read     Read             Read       Anomaly
───────────────────────────────────────────────────────────────────────────
READ UNCOMMITTED       ✅ Yes   ✅ Yes           ✅ Yes     ✅ Yes
READ COMMITTED         ❌ No    ✅ Yes           ✅ Yes     ✅ Yes
REPEATABLE READ        ❌ No    ❌ No            ✅ Yes     ✅ Yes
SERIALIZABLE           ❌ No    ❌ No            ❌ No      ❌ No
───────────────────────────────────────────────────────────────────────────
  ✅ = Problem CAN occur    ❌ = Problem is PREVENTED
  
  ← LESS ISOLATION (more concurrency, more risk)
  → MORE ISOLATION (less concurrency, more safety)
```

---

## 4. Deep Dive: Each Level

### READ UNCOMMITTED
```sql
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
```
- **Protection**: None. Can see other transactions' uncommitted changes.
- **Use case**: Almost never. Some use for approximate analytics where dirty reads are acceptable.
- **PostgreSQL**: Treats this as READ COMMITTED (doesn't support true READ UNCOMMITTED).

### READ COMMITTED (Default for PostgreSQL, Oracle, SQL Server)
```sql
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
```
- **Protection**: No dirty reads. Each statement sees only committed data.
- **Behavior**: Each SQL statement gets a **new snapshot** of the database.
- **Trade-off**: Same transaction can see different data if another transaction commits between statements.

```sql
-- PostgreSQL READ COMMITTED behavior:
BEGIN;
SELECT * FROM accounts WHERE balance > 500;  -- Sees snapshot at time of THIS statement
-- ... another transaction commits changes ...
SELECT * FROM accounts WHERE balance > 500;  -- Sees NEW snapshot — results may differ!
COMMIT;
```

### REPEATABLE READ (Default for MySQL InnoDB)
```sql
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
```
- **Protection**: No dirty reads, no non-repeatable reads. You see a consistent snapshot from transaction start.
- **Behavior**: Transaction gets ONE snapshot at the start, all reads use it.

```sql
-- PostgreSQL REPEATABLE READ behavior:
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SELECT * FROM accounts WHERE balance > 500;  -- Snapshot taken HERE
-- ... another transaction commits changes ...
SELECT * FROM accounts WHERE balance > 500;  -- SAME results as first query!
COMMIT;
```

**⚠️ MySQL vs PostgreSQL difference**:
- **MySQL**: REPEATABLE READ prevents phantom reads too (using gap locks)
- **PostgreSQL**: REPEATABLE READ does NOT prevent phantom reads (per SQL standard)

### SERIALIZABLE
```sql
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
```
- **Protection**: Full isolation. Transactions behave AS IF they ran one after another.
- **Behavior**: Detects conflicts and aborts transactions that would cause anomalies.

```sql
-- SERIALIZABLE will prevent write skew:
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SELECT COUNT(*) FROM doctors WHERE on_call = true;  -- 2
UPDATE doctors SET on_call = false WHERE name = 'Doctor A';
COMMIT;  -- May get: ERROR: could not serialize access
         -- Application must RETRY the transaction!
```

---

## 5. Implementation: Locking vs MVCC

### Two-Phase Locking (2PL) — Traditional (SQL Server default approach)
```
Transaction acquires locks as it goes:
  READ  → Shared lock (S) — others can read, can't write
  WRITE → Exclusive lock (X) — nobody else can read or write

Locks are held until transaction commits/rollbacks.

Problem: Readers block writers, writers block readers → low concurrency
```

### MVCC (Multi-Version Concurrency Control) — PostgreSQL, MySQL InnoDB, Oracle
```
Each row has hidden version info:
  
  Row: {id:1, balance:1000, xmin:100, xmax:∞}
  
  After UPDATE by transaction 200:
  Old: {id:1, balance:1000, xmin:100, xmax:200}  ← still visible to older txns
  New: {id:1, balance:500,  xmin:200, xmax:∞}    ← visible to txn 200+

Readers NEVER block writers. Writers NEVER block readers.
Each transaction sees its own consistent snapshot.
```

**MVCC Trade-off**: Dead tuples accumulate → need VACUUM (PostgreSQL) or purge thread (MySQL).

### PostgreSQL's SSI (Serializable Snapshot Isolation)
```
PostgreSQL implements SERIALIZABLE using SSI (not locks):
- All transactions run with MVCC snapshots
- System tracks read/write dependencies
- If a cycle is detected → one transaction is aborted
- Much better concurrency than lock-based serializable
```

---

## 6. Practical Guidance: Choosing the Right Level

| Use Case | Recommended Level | Why |
|----------|-------------------|-----|
| Web app CRUD operations | READ COMMITTED | Good balance of safety and performance |
| Financial transactions | SERIALIZABLE | Must prevent all anomalies |
| Reporting / Analytics | REPEATABLE READ | Consistent snapshot for entire report |
| Batch processing | READ COMMITTED | Avoid long-held snapshots |
| Inventory management | SERIALIZABLE or explicit locking | Prevent overselling |
| Social media feeds | READ COMMITTED | Slight inconsistency is acceptable |

### The Retry Pattern (Critical for SERIALIZABLE)
```python
import psycopg2
from psycopg2 import extensions

MAX_RETRIES = 3

def execute_serializable_transaction(conn, operation):
    for attempt in range(MAX_RETRIES):
        try:
            conn.set_isolation_level(
                extensions.ISOLATION_LEVEL_SERIALIZABLE
            )
            with conn.cursor() as cur:
                operation(cur)
            conn.commit()
            return  # Success!
        except psycopg2.errors.SerializationFailure:
            conn.rollback()
            if attempt == MAX_RETRIES - 1:
                raise
            # Exponential backoff
            time.sleep(0.1 * (2 ** attempt))
```

---

## 7. Explicit Locking (When Isolation Levels Aren't Enough)

```sql
-- SELECT FOR UPDATE: Lock specific rows
BEGIN;
SELECT * FROM accounts WHERE id = 1 FOR UPDATE;
-- Row is now locked — other transactions wait
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
COMMIT;

-- SELECT FOR SHARE: Lock for reading (others can read, not write)
BEGIN;
SELECT * FROM accounts WHERE id = 1 FOR SHARE;
-- Prevents others from modifying this row until we commit

-- SKIP LOCKED: Don't wait, skip locked rows (great for job queues)
SELECT * FROM jobs WHERE status = 'pending' 
ORDER BY created_at 
LIMIT 1 
FOR UPDATE SKIP LOCKED;

-- NOWAIT: Don't wait, error immediately if locked
SELECT * FROM accounts WHERE id = 1 FOR UPDATE NOWAIT;
```

---

## 8. Deadlocks

```
Transaction A:                    Transaction B:
Lock row 1 ✅                     Lock row 2 ✅
Try to lock row 2... WAITING      Try to lock row 1... WAITING
       ↑                                  ↑
       └──── DEADLOCK! Both waiting for each other ────┘

Database detects this and kills one transaction:
ERROR: deadlock detected
```

**Prevention**:
1. Always lock resources in the **same order**
2. Keep transactions **short**
3. Use **NOWAIT** or **lock timeouts**
4. Use **SERIALIZABLE** (SSI avoids traditional deadlocks)

---

## 9. Teaching Analogy 🎯

> **Isolation levels are like privacy settings in a shared office document:**
> - **READ UNCOMMITTED** = You see everyone's typing in real-time, even before they hit save (Google Docs live typing)
> - **READ COMMITTED** = You only see changes after someone hits "Save" (but the doc changes as others save)
> - **REPEATABLE READ** = You downloaded a copy at the start — your copy doesn't change mid-read
> - **SERIALIZABLE** = The document is checked out — only one person can edit at a time, like a library book

---

*Prepared for Database Mastery Session | Feb 2026*

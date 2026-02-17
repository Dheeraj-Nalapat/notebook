# Execution Plans — Database Mastery Session

> **Session Goal**: Learn to read execution plans like a pro — understand what the database is actually doing and spot performance bottlenecks.

---

## 1. What Is an Execution Plan?

An execution plan is the database's **step-by-step recipe** for answering your query. It shows:
- **What operations** are performed (scan, seek, join, sort)
- **In what order** they happen
- **How much work** each step does (rows, cost, time)

Think of it as the database showing you its work — like a math student showing their steps.

---

## 2. How to Get an Execution Plan

### PostgreSQL
```sql
-- Estimated plan (doesn't run the query)
EXPLAIN SELECT * FROM orders WHERE customer_id = 42;

-- Actual plan (runs the query, shows real numbers)
EXPLAIN ANALYZE SELECT * FROM orders WHERE customer_id = 42;

-- Full details (buffers, timing, WAL)
EXPLAIN (ANALYZE, BUFFERS, TIMING, FORMAT TEXT) 
SELECT * FROM orders WHERE customer_id = 42;

-- JSON format (great for tools/visualization)
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) 
SELECT * FROM orders WHERE customer_id = 42;
```

### MySQL
```sql
-- Basic plan
EXPLAIN SELECT * FROM orders WHERE customer_id = 42;

-- Extended info
EXPLAIN FORMAT=JSON SELECT * FROM orders WHERE customer_id = 42;

-- Tree format (MySQL 8.0+) — closest to PostgreSQL's output
EXPLAIN ANALYZE SELECT * FROM orders WHERE customer_id = 42;

-- Visual in MySQL Workbench: Click the lightning bolt icon with magnifying glass
```

### SQL Server
```sql
-- Estimated plan
SET SHOWPLAN_ALL ON;
GO
SELECT * FROM orders WHERE customer_id = 42;
GO
SET SHOWPLAN_ALL OFF;

-- Actual plan
SET STATISTICS PROFILE ON;
GO
SELECT * FROM orders WHERE customer_id = 42;
GO

-- Or use: Ctrl+L (estimated) / Ctrl+M (actual) in SSMS
```

---

## 3. Reading PostgreSQL Execution Plans

### Basic Plan Structure
```sql
EXPLAIN ANALYZE SELECT * FROM orders WHERE customer_id = 42;
```
```
Seq Scan on orders  (cost=0.00..1520.00 rows=50 width=120) (actual time=0.015..12.340 rows=47 loops=1)
  Filter: (customer_id = 42)
  Rows Removed by Filter: 99953
Planning Time: 0.085 ms
Execution Time: 12.401 ms
```

Let's decode every piece:

```
Seq Scan on orders          ← OPERATION: Sequential (full table) scan
  (cost=0.00..1520.00       ← ESTIMATED COST: startup..total (arbitrary units)
   rows=50                  ← ESTIMATED ROWS the optimizer expects
   width=120)               ← Average row width in bytes
  (actual time=0.015..12.340 ← ACTUAL TIME: first row..last row (milliseconds)
   rows=47                   ← ACTUAL ROWS returned
   loops=1)                  ← How many times this node executed
  Filter: (customer_id = 42) ← The filter condition applied
  Rows Removed by Filter: 99953  ← Rows scanned but didn't match
```

**Key Insight**: Compare `rows=50` (estimated) vs `rows=47` (actual). If these are wildly different, **statistics are stale** → run `ANALYZE`.

### The Cost Model
```
cost = startup_cost..total_cost

- startup_cost: Work before first row can be returned
  (e.g., sorting must finish before returning anything)
  
- total_cost: Work to return ALL rows
  
Units are arbitrary but proportional to:
  - seq_page_cost = 1.0   (reading a sequential page)
  - random_page_cost = 4.0 (reading a random page — 4x more expensive!)
  - cpu_tuple_cost = 0.01  (processing a row)
  - cpu_index_tuple_cost = 0.005
  - cpu_operator_cost = 0.0025
```

---

## 4. Common Plan Operations (Nodes)

### Scan Types

```
┌──────────────────────────────────────────────────────────────────────┐
│ SCAN TYPE          │ WHAT IT DOES              │ WHEN YOU SEE IT     │
├──────────────────────────────────────────────────────────────────────┤
│ Seq Scan           │ Reads entire table         │ No useful index,    │
│                    │ row by row                 │ or small table      │
├──────────────────────────────────────────────────────────────────────┤
│ Index Scan         │ Uses index to find rows,   │ Selective query +   │
│                    │ then fetches from table    │ good index          │
├──────────────────────────────────────────────────────────────────────┤
│ Index Only Scan    │ Answers from index alone   │ Covering index      │
│                    │ (no table access!)         │ (BEST CASE 🏆)     │
├──────────────────────────────────────────────────────────────────────┤
│ Bitmap Index Scan  │ Builds a bitmap of pages,  │ Medium selectivity, │
│  + Bitmap Heap Scan│ then fetches those pages   │ multiple conditions │
├──────────────────────────────────────────────────────────────────────┤
│ Index Scan (MySQL) │ Reads index + row lookup   │ Indexed column      │
│ (type: ref)        │                            │ in WHERE            │
├──────────────────────────────────────────────────────────────────────┤
│ Full Index Scan    │ Reads entire index         │ Index covers query  │
│ (MySQL: type=index)│ (but not table)            │ but no filtering    │
└──────────────────────────────────────────────────────────────────────┘
```

**Visual: Scan Type Performance Spectrum**
```
BEST ←───────────────────────────────────────────→ WORST

Index Only   Index    Bitmap Index    Seq Scan
  Scan       Scan       Scan         (Full Table)
   🏆         ✅         🔄            ⚠️
```

### Join Types

```sql
EXPLAIN ANALYZE
SELECT o.*, c.name FROM orders o JOIN customers c ON o.customer_id = c.id;
```

```
┌─────────────────────────────────────────────────────────────────────┐
│ JOIN TYPE          │ HOW IT WORKS                │ BEST WHEN        │
├─────────────────────────────────────────────────────────────────────┤
│ Nested Loop        │ For each outer row,          │ Small outer +    │
│                    │ scan inner table             │ indexed inner    │
│                    │ O(N × M) worst case          │                  │
├─────────────────────────────────────────────────────────────────────┤
│ Hash Join          │ Build hash table from        │ Large tables,    │
│                    │ smaller table, probe with    │ equality joins,  │
│                    │ larger table                 │ enough memory    │
├─────────────────────────────────────────────────────────────────────┤
│ Merge Join         │ Sort both inputs, then       │ Pre-sorted data  │
│ (Sort-Merge)       │ merge like a zipper          │ or indexed cols  │
└─────────────────────────────────────────────────────────────────────┘
```

**Example Plan with Hash Join**:
```
Hash Join  (cost=230.00..1890.00 rows=5000 width=200) (actual time=2.1..15.3 rows=4987 loops=1)
  Hash Cond: (o.customer_id = c.id)
  -> Seq Scan on orders o  (cost=0.00..1520.00 rows=100000 width=120) (actual time=0.01..8.2 rows=100000 loops=1)
  -> Hash  (cost=155.00..155.00 rows=5000 width=80) (actual time=1.8..1.8 rows=5000 loops=1)
        Buckets: 8192  Batches: 1  Memory Usage: 450kB
        -> Seq Scan on customers c  (cost=0.00..155.00 rows=5000 width=80) (actual time=0.01..0.9 rows=5000 loops=1)
```

**Reading this bottom-up**:
1. Scan `customers` table → build hash table (450kB in memory)
2. Scan `orders` table → for each row, probe the hash table
3. Return matched rows

### Other Important Nodes

```
Sort                    ← Sorts data (expensive if large!)
  Sort Key: created_at
  Sort Method: external merge  Disk: 15232kB  ← SPILLING TO DISK! ⚠️

Aggregate               ← COUNT, SUM, AVG, etc.
  -> Seq Scan on orders

Limit                   ← LIMIT clause

Materialize             ← Stores intermediate results in memory/disk

Gather                  ← Collects results from parallel workers
  Workers Planned: 4
  Workers Launched: 4
```

---

## 5. Red Flags in Execution Plans 🚩

### 1. Sequential Scan on Large Tables
```
Seq Scan on orders (cost=0.00..25000.00 rows=1000000 ...)
  Filter: (customer_id = 42)
  Rows Removed by Filter: 999950
```
**Fix**: Add an index on `customer_id`

### 2. Huge Row Estimation Errors
```
(rows=100 ...)  (actual ... rows=500000 ...)
```
**Fix**: `ANALYZE orders;` to update statistics

### 3. Disk-based Sorts
```
Sort Method: external merge  Disk: 15232kB
```
**Fix**: Increase `work_mem`, add index on sort column, or reduce data before sorting

### 4. Nested Loop with Large Tables
```
Nested Loop (actual time=0.1..45000.0 rows=1000000 loops=1)
  -> Seq Scan on large_table_a (rows=10000)
  -> Index Scan on large_table_b (loops=10000)  ← 10,000 index lookups!
```
**Fix**: May need `SET enable_nestloop = off` to force Hash/Merge Join, or restructure query

### 5. Bitmap Heap Scan with High "Lossy" Blocks
```
Bitmap Heap Scan on orders
  Recheck Cond: (status = 'active')
  Rows Removed by Index Recheck: 50000  ← Bitmap was too large, became lossy
```
**Fix**: Increase `work_mem` for larger bitmap, or use more selective conditions

---

## 6. Practical Optimization Workflow

```
Step 1: Get the plan
        EXPLAIN (ANALYZE, BUFFERS) SELECT ...;

Step 2: Read BOTTOM-UP (innermost operations first)

Step 3: Look for:
        ✓ Seq Scans on large tables → add index?
        ✓ Estimated vs actual rows → stale stats?
        ✓ Sort on disk → increase work_mem?
        ✓ High cost nodes → can we restructure?
        ✓ Buffers: shared read (high) → data not cached

Step 4: Fix one thing at a time, re-run EXPLAIN ANALYZE

Step 5: Compare plans before/after
```

---

## 7. Useful Tools for Visualizing Plans

| Tool | URL | Features |
|------|-----|----------|
| **explain.dalibo.com** | https://explain.dalibo.com | PostgreSQL plan visualizer (paste JSON) |
| **pgMustard** | https://pgmustard.com | AI-powered PostgreSQL plan analysis |
| **MySQL Workbench** | Built-in | Visual Explain for MySQL |
| **SSMS** | Built-in | Graphical execution plans for SQL Server |
| **pg_stat_statements** | Extension | Track slow queries automatically |

---

## 8. PostgreSQL BUFFERS Output Explained

```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM orders WHERE id = 42;
```
```
Index Scan using orders_pkey on orders (actual time=0.02..0.03 rows=1 loops=1)
  Index Cond: (id = 42)
  Buffers: shared hit=3           ← 3 pages read from CACHE (fast!)
Planning Time: 0.05 ms
Execution Time: 0.05 ms
```

```
Buffers: shared hit=3              ← Pages found in shared_buffers (RAM) ✅
Buffers: shared read=150           ← Pages read from DISK (slow!) ⚠️
Buffers: shared dirtied=10         ← Pages modified (will need writing)
Buffers: shared written=5          ← Pages written to disk during query
Buffers: temp read=100 written=100 ← Temp files used (sorting/hashing spilled) 🚩
```

---

## 9. MySQL EXPLAIN Output Decoded

```sql
EXPLAIN SELECT * FROM orders WHERE customer_id = 42 AND status = 'active';
```
```
+----+------+---------------+------+---------+-------+------+-------------+
| id | type | possible_keys | key  | key_len | ref   | rows | Extra       |
+----+------+---------------+------+---------+-------+------+-------------+
|  1 | ref  | idx_cust_stat | idx  | 4       | const |   47 | Using where |
+----+------+---------------+------+---------+-------+------+-------------+
```

**MySQL `type` column (best to worst)**:
```
system → const → eq_ref → ref → range → index → ALL
  🏆      🏆       ✅      ✅     ✅      🔄     ⚠️

system/const: Single row (by PK/unique)
eq_ref:       One row per join (PK/unique join)
ref:          Multiple rows via index
range:        Index range scan (BETWEEN, >, <)
index:        Full index scan (reads entire index)
ALL:          Full table scan (WORST) ⚠️
```

**MySQL `Extra` column red flags**:
```
Using filesort          ← Sorting without index ⚠️
Using temporary         ← Temp table created ⚠️
Using where             ← Filter after fetch (OK, but check selectivity)
Using index             ← Covering index! 🏆
Using index condition   ← Index Condition Pushdown (good)
```

---

## 10. Teaching Analogy 🎯

> **An execution plan is like a GPS turn-by-turn navigation:**
> - **EXPLAIN** = "Show me the route before I drive" (estimated plan)
> - **EXPLAIN ANALYZE** = "Show me the route AND how long each turn actually took" (actual plan)
> - **Seq Scan** = Driving down every street in the city to find one address
> - **Index Scan** = Looking up the address in a directory, then driving straight there
> - **Hash Join** = Writing all addresses from list A on sticky notes, then checking list B against them
> - **Sort on Disk** = Running out of desk space and having to use the floor (slow!)
> - **Estimated vs Actual rows mismatch** = GPS said "5 min" but it took 2 hours — needs updated traffic data (ANALYZE)

---

*Prepared for Database Mastery Session | Feb 2026*

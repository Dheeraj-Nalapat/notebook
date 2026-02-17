# Indexing Strategies — Database Mastery Session

> **Session Goal**: Understand how indexes work internally, when to use them, and how to design an effective indexing strategy.

---

## 1. What Is an Index? (The Mental Model)

An index is like a **book's index** — instead of reading every page to find "transactions", you look up the page number in the index.

Without an index: **Full Table Scan** (read every row)  
With an index: **Index Seek** (jump directly to matching rows)

### The Trade-off
```
  Reads    ←——— INDEX ———→   Writes
  FASTER                      SLOWER
  (seek)                      (maintain index)
```

Every index you add:
- ✅ Speeds up SELECT/WHERE/JOIN/ORDER BY
- ❌ Slows down INSERT/UPDATE/DELETE (index must be updated)
- ❌ Uses additional disk space

---

## 2. Index Data Structures

### B-Tree Index (Default, Most Common)
```
                    [50]
                   /    \
            [20, 30]    [70, 90]
           /   |   \    /   |   \
        [10] [25] [35] [60] [80] [95]
         ↓    ↓    ↓    ↓    ↓    ↓
       (rows)(rows)(rows)(rows)(rows)(rows)
```

- **Best for**: Range queries (`>`, `<`, `BETWEEN`), equality, sorting
- **Complexity**: O(log N) for lookups
- **Used by**: PostgreSQL, MySQL InnoDB, SQL Server, Oracle

```sql
-- B-Tree shines here:
SELECT * FROM orders WHERE created_at BETWEEN '2025-01-01' AND '2025-06-30';
SELECT * FROM users WHERE last_name = 'Smith';
SELECT * FROM products ORDER BY price ASC LIMIT 10;
```

### Hash Index
```
  key: "alice@email.com" → hash(key) → bucket_42 → row pointer
  key: "bob@email.com"   → hash(key) → bucket_17 → row pointer
```

- **Best for**: Exact equality lookups only (`=`)
- **Cannot do**: Range queries, sorting, partial matching
- **Complexity**: O(1) average
- **PostgreSQL**: Supported but rarely needed (B-Tree handles equality well)
- **MySQL Memory engine**: Uses hash by default

### GIN (Generalized Inverted Index) — PostgreSQL
```
  "database"  → [doc_1, doc_5, doc_12]
  "mastery"   → [doc_3, doc_5]
  "index"     → [doc_1, doc_7, doc_12]
```

- **Best for**: Full-text search, JSONB, arrays, composite types
- **Use when**: You need to search *inside* values

```sql
-- GIN for full-text search
CREATE INDEX idx_articles_search ON articles USING GIN (to_tsvector('english', body));
SELECT * FROM articles WHERE to_tsvector('english', body) @@ to_tsquery('database & mastery');

-- GIN for JSONB
CREATE INDEX idx_metadata ON products USING GIN (metadata);
SELECT * FROM products WHERE metadata @> '{"color": "red"}';
```

### GiST (Generalized Search Tree) — PostgreSQL
- **Best for**: Geometric data, range types, nearest-neighbor searches
- **Use when**: Spatial queries, IP ranges, time ranges

```sql
-- GiST for geometric/spatial
CREATE INDEX idx_location ON stores USING GIST (location);
SELECT * FROM stores WHERE location <-> point(40.7128, -74.0060) < 0.01;
```

### BRIN (Block Range Index) — PostgreSQL
- **Best for**: Very large tables with naturally ordered data
- **Extremely small**: Stores min/max per block range
- **Use when**: Time-series data, append-only tables

```sql
-- Perfect for time-series: tiny index, huge table
CREATE INDEX idx_logs_created ON logs USING BRIN (created_at);
```

---

## 3. Index Types by Use Case

### Single-Column Index
```sql
CREATE INDEX idx_users_email ON users (email);

-- Used when queries filter on a single column
SELECT * FROM users WHERE email = 'alice@example.com';
```

### Composite (Multi-Column) Index
```sql
CREATE INDEX idx_orders_status_date ON orders (status, created_at);
```

**⚠️ THE LEFT-PREFIX RULE** (Critical to teach):
```sql
-- Given index: (status, created_at)

-- ✅ Uses index (leftmost column)
SELECT * FROM orders WHERE status = 'active';

-- ✅ Uses index (both columns, left to right)
SELECT * FROM orders WHERE status = 'active' AND created_at > '2025-01-01';

-- ❌ CANNOT use this index (skips leftmost column!)
SELECT * FROM orders WHERE created_at > '2025-01-01';
```

**Column Order Strategy**: Put columns in this order:
1. **Equality conditions first** (`=`)
2. **Range conditions last** (`>`, `<`, `BETWEEN`)
3. **High cardinality first** (more unique values)

```sql
-- Query: WHERE status = 'active' AND created_at > '2025-01-01' AND region = 'US'
-- Best index:
CREATE INDEX idx_optimal ON orders (status, region, created_at);
-- status (equality) → region (equality) → created_at (range, must be last)
```

### Covering Index (Index-Only Scan)
```sql
-- The index contains ALL columns the query needs
CREATE INDEX idx_covering ON orders (customer_id, status) INCLUDE (total, created_at);

-- This query never touches the table — served entirely from the index!
SELECT customer_id, status, total, created_at
FROM orders
WHERE customer_id = 42 AND status = 'shipped';
```

### Partial Index (Conditional Index)
```sql
-- Only index rows that matter
CREATE INDEX idx_active_orders ON orders (customer_id) 
WHERE status = 'active';

-- Much smaller index! Only active orders are indexed.
-- Perfect when most queries filter on a specific condition.
```

### Expression/Functional Index
```sql
-- Index on a computed expression
CREATE INDEX idx_lower_email ON users (LOWER(email));

-- Now this query uses the index:
SELECT * FROM users WHERE LOWER(email) = 'alice@example.com';
```

---

## 4. Indexing Strategy Decision Framework

```
                    ┌─ Is this column in WHERE/JOIN/ORDER BY?
                    │
              No ←──┤──→ Yes
              │           │
        Don't Index   ┌─ How selective is it? (cardinality)
                      │
               Low ←──┤──→ High
           (gender,   │     (email, id, timestamp)
            boolean)  │          │
                      │     CREATE INDEX ✅
                      │
                ┌─ Is it used with other columns?
                │
           No ←─┤──→ Yes
           │         │
     Consider    Composite Index
     Partial     (follow left-prefix rule)
     Index
```

### When NOT to Index
- **Small tables** (< 1000 rows): Full scan is faster than index lookup
- **Low cardinality columns**: Boolean, status with 2-3 values (unless partial index)
- **Write-heavy tables**: Each index adds write overhead
- **Columns rarely in WHERE**: Unused indexes waste space and slow writes

### Cardinality Matters
```sql
-- Check cardinality (PostgreSQL)
SELECT 
    attname AS column_name,
    n_distinct,
    most_common_vals
FROM pg_stats 
WHERE tablename = 'orders';

-- High cardinality (good for indexing): email, user_id, timestamp
-- Low cardinality (bad for indexing alone): status, is_active, gender
```

---

## 5. Index Maintenance

### Bloated Indexes (PostgreSQL)
```sql
-- Check index bloat
SELECT 
    indexrelname AS index_name,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;

-- Rebuild bloated indexes
REINDEX INDEX idx_users_email;
-- Or concurrently (no lock):
REINDEX INDEX CONCURRENTLY idx_users_email;
```

### Finding Unused Indexes
```sql
-- PostgreSQL: Find indexes that are never used
SELECT 
    indexrelname AS index_name,
    idx_scan AS times_used,
    pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;
-- If times_used = 0 for weeks → DROP IT
```

### Finding Missing Indexes
```sql
-- PostgreSQL: Tables with most sequential scans (might need indexes)
SELECT 
    relname AS table_name,
    seq_scan,
    seq_tup_read,
    idx_scan,
    idx_tup_fetch
FROM pg_stat_user_tables
WHERE seq_scan > 100
ORDER BY seq_tup_read DESC;
```

---

## 6. MySQL vs PostgreSQL Index Comparison

| Feature | PostgreSQL | MySQL (InnoDB) |
|---------|-----------|----------------|
| Default structure | B-Tree | B+Tree (clustered) |
| Clustered index | No (heap table) | Yes (PRIMARY KEY) |
| Partial indexes | ✅ Yes | ❌ No |
| Expression indexes | ✅ Yes | ✅ Yes (v8.0+) |
| INCLUDE columns | ✅ Yes (v11+) | ❌ No |
| GIN/GiST | ✅ Yes | ❌ No |
| BRIN | ✅ Yes | ❌ No |
| Invisible indexes | ❌ No | ✅ Yes (v8.0+) |
| Online DDL | CONCURRENTLY | ALGORITHM=INPLACE |

### MySQL Clustered Index — Important Concept!
```
InnoDB stores data IN the primary key B+Tree:

Primary Key Index (Clustered):
    [PK: 1] → {id:1, name:"Alice", email:"alice@..."}
    [PK: 2] → {id:2, name:"Bob",   email:"bob@..."}
    [PK: 3] → {id:3, name:"Carol", email:"carol@..."}

Secondary Index:
    [email: "alice@..."] → PK: 1  (then looks up row in clustered index)
    [email: "bob@..."]   → PK: 2
    [email: "carol@..."] → PK: 3
```

**Implication**: Secondary index lookups in MySQL require TWO lookups (index → PK → row). This is why covering indexes are even more valuable in MySQL.

---

## 7. Teaching Analogy 🎯

> **Indexes are like a library's cataloging system.**
> - **No index** = walking through every shelf to find a book
> - **B-Tree index** = card catalog sorted by author (find range: all books by authors A-D)
> - **Hash index** = knowing exact shelf number for a specific ISBN
> - **Composite index** = catalog sorted by genre, THEN by author within each genre
> - **Covering index** = the catalog card has all the info you need — no need to go to the shelf
> - **Partial index** = a special catalog for ONLY "available" books (smaller, faster)
> - **Index bloat** = old cards for returned/removed books still in the catalog

---

*Prepared for Database Mastery Session | Feb 2026*

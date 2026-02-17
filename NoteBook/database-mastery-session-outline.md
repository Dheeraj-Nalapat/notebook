# Database Mastery — Session Outline & Cheat Sheet

> **Session Duration**: ~2-3 hours (with breaks)  
> **Audience**: Developers who use databases but want deeper understanding  
> **Format**: Concept → Visual → Code Examples → Discussion

---

## Session Flow

### Opening (5 min)
- "Every application is ultimately a fancy UI on top of a database"
- Frame the session: We're going from "it works" to "I know WHY it works"
- Quick poll: Who has used EXPLAIN? Who has designed a NoSQL schema?

---

### Module 1: Query Optimization (30 min)
📄 *Detailed notes: `query-optimization.md`*

**Key Teaching Points:**
1. The query execution pipeline: SQL → Parser → Optimizer → Engine → Results
2. The 5 Golden Rules:
   - Only fetch what you need (no `SELECT *`)
   - Filter early, join later
   - Don't wrap indexed columns in functions
   - Be smart with JOINs (explicit, correct type)
   - EXISTS over IN for subqueries
3. Common killers: N+1 problem, unbounded queries, correlated subqueries
4. **Live Demo**: Take a slow query → apply rules → show improvement

**Discussion Question**: "What's the slowest query in your current project?"

---

### Module 2: Indexing Strategies (30 min)
📄 *Detailed notes: `indexing-strategies.md`*

**Key Teaching Points:**
1. B-Tree mental model (sorted tree, O(log N))
2. **The Left-Prefix Rule** (most misunderstood concept!)
   - Composite index `(A, B, C)` — which queries use it?
3. Index types: Single, Composite, Covering, Partial, Expression
4. The indexing trade-off: reads faster ↔ writes slower
5. Finding unused & missing indexes (live SQL queries)

**Interactive Exercise**: Given these 5 queries, design the optimal indexes:
```sql
-- Q1: WHERE status = 'active' AND created_at > '2025-01-01'
-- Q2: WHERE customer_email = 'alice@example.com'
-- Q3: WHERE region = 'US' ORDER BY revenue DESC LIMIT 10
-- Q4: WHERE LOWER(name) LIKE 'alice%'
-- Q5: WHERE is_deleted = false AND updated_at > now() - interval '1 day'
```

**Answers**:
```sql
-- Q1: CREATE INDEX idx_q1 ON orders (status, created_at);
-- Q2: CREATE INDEX idx_q2 ON users (customer_email);
-- Q3: CREATE INDEX idx_q3 ON sales (region, revenue DESC);
-- Q4: CREATE INDEX idx_q4 ON users (LOWER(name) text_pattern_ops);
-- Q5: CREATE INDEX idx_q5 ON records (updated_at) WHERE is_deleted = false;
```

---

### ☕ Break (10 min)

---

### Module 3: Transaction Isolation Levels (25 min)
📄 *Detailed notes: `transaction-isolation-levels.md`*

**Key Teaching Points:**
1. The three villains: Dirty Read, Non-Repeatable Read, Phantom Read
2. Walk through the 4 levels with **timeline diagrams**
3. MVCC vs Locking — how databases actually implement isolation
4. Practical guidance: which level for which use case
5. The retry pattern for SERIALIZABLE

**Live Demo**: Open two `psql` terminals side by side:
```
Terminal A                    Terminal B
─────────────────────────────────────────
BEGIN;                        BEGIN;
UPDATE ... SET balance=500;   
                              SELECT balance; -- What do you see?
COMMIT;
                              SELECT balance; -- Now what?
```
Run this at READ COMMITTED, then REPEATABLE READ, then SERIALIZABLE.

---

### Module 4: Execution Plans (25 min)
📄 *Detailed notes: `execution-plans.md`*

**Key Teaching Points:**
1. `EXPLAIN` vs `EXPLAIN ANALYZE` — estimated vs actual
2. Read plans bottom-up (innermost operation first)
3. The scan spectrum: Index Only → Index → Bitmap → Seq Scan
4. Join types: Nested Loop vs Hash Join vs Merge Join
5. Red flags: Seq scan on large table, row estimate errors, disk sorts

**Live Demo**: Show a real query plan, decode it together:
```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) 
SELECT o.order_id, c.name, SUM(oi.price)
FROM orders o
JOIN customers c ON o.customer_id = c.id
JOIN order_items oi ON oi.order_id = o.id
WHERE o.created_at > '2025-01-01'
GROUP BY o.order_id, c.name
ORDER BY SUM(oi.price) DESC
LIMIT 10;
```

**Exercise**: "Spot the problem" — show 3 execution plans with issues, audience identifies them.

---

### ☕ Break (10 min)

---

### Module 5: NoSQL Modeling Patterns (30 min)
📄 *Detailed notes: `nosql-modeling-patterns.md`*

**Key Teaching Points:**
1. **The mindset shift**: Design for queries, not for data structure
2. Embedding vs Referencing — the core decision
3. The 7 patterns: Embedding, Referencing, Extended Reference, Subset, Bucket, Computed, Polymorphic
4. DynamoDB single-table design (blow their minds 🤯)
5. When SQL vs when NoSQL — honest trade-offs

**Interactive Exercise**: Design a schema for:
> "A food delivery app: users, restaurants, menus, orders, delivery tracking, reviews"
>
> Access patterns:
> 1. User views a restaurant's menu
> 2. User places an order
> 3. Driver updates delivery status
> 4. User sees their order history
> 5. Restaurant sees today's orders

Split into groups, compare SQL vs MongoDB vs DynamoDB approaches.

---

### Closing (10 min)

**The Database Mastery Pyramid:**
```
            ╱╲
           ╱  ╲
          ╱ 5  ╲     ← NoSQL: Right tool for the job
         ╱──────╲
        ╱   4    ╲    ← Execution Plans: See what DB sees
       ╱──────────╲
      ╱     3      ╲   ← Isolation: Understand concurrency
     ╱──────────────╲
    ╱       2        ╲  ← Indexing: Speed up reads
   ╱──────────────────╲
  ╱         1          ╲ ← Query Optimization: Write better SQL
 ╱──────────────────────╲
╱      FOUNDATIONS       ╲
```

**Key takeaways to leave them with:**
1. Always `EXPLAIN ANALYZE` before optimizing
2. Index your WHERE, JOIN, and ORDER BY columns
3. Know your isolation level and its trade-offs
4. In NoSQL: design for access patterns, not data structure
5. There is no "best database" — only the best fit for your use case

---

## Quick Reference Cheat Sheet

### Query Optimization
```
✅ SELECT specific columns, not *
✅ Use EXISTS over IN for subqueries
✅ Add LIMIT to user-facing queries
✅ Avoid functions on indexed columns
❌ N+1 queries (use eager loading)
❌ SELECT without WHERE on large tables
```

### Indexing
```
B-Tree: Default, range + equality
Composite: Left-prefix rule! (A,B,C) → queries on A, AB, ABC
Covering: INCLUDE columns to avoid table access
Partial: WHERE clause on index for subset
Check: pg_stat_user_indexes for unused indexes
```

### Isolation Levels
```
READ UNCOMMITTED  → Almost never use
READ COMMITTED    → Default (PostgreSQL/Oracle) — safe for most apps
REPEATABLE READ   → Default (MySQL) — consistent within transaction
SERIALIZABLE      → Financial/critical — must implement retry logic
```

### Execution Plans
```
EXPLAIN ANALYZE → Always use ANALYZE for real numbers
Read bottom-up → Innermost operations first
Red flags → Seq Scan large table, row estimate mismatch, disk sort
Best scan → Index Only Scan 🏆
Best join → Depends on data size (Hash for large, Nested Loop for small+indexed)
```

### NoSQL Patterns
```
Embed      → 1:1, 1:few, data accessed together
Reference  → 1:many, many:many, independent access
Bucket     → Time-series, group measurements
Subset     → Large arrays, embed only recent items
Single Table (DynamoDB) → All entities, one table, clever keys
```

---

## Files in This Report Set

| File | Topic | Brain Destination |
|------|-------|-------------------|
| `query-optimization.md` | Query Optimization | `Memory/Skills/` |
| `indexing-strategies.md` | Indexing Strategies | `Memory/Skills/` |
| `transaction-isolation-levels.md` | Transaction Isolation | `Memory/Concepts/` |
| `execution-plans.md` | Execution Plans | `Memory/Skills/` |
| `nosql-modeling-patterns.md` | NoSQL Modeling | `Memory/Concepts/` |
| `database-mastery-session-outline.md` | Session Outline | `Memory/Skills/` |

---

*Database Mastery Session — Prepared Feb 2026*

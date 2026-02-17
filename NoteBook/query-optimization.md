# Query Optimization — Database Mastery Session

> **Session Goal**: Understand how databases process queries and learn practical techniques to make them faster.

---

## 1. How a Query Gets Executed (The Journey)

Every SQL query goes through these stages:

```
SQL Text → Parser → Optimizer → Execution Engine → Results
```

1. **Parsing**: SQL is checked for syntax, tables/columns are validated
2. **Optimization**: The query planner evaluates multiple execution strategies and picks the cheapest
3. **Execution**: The chosen plan runs against actual data

The **optimizer** is where the magic (and pain) happens. It makes decisions based on:
- Table statistics (row counts, data distribution)
- Available indexes
- Join ordering
- Cost estimates (I/O, CPU, memory)

---

## 2. The Golden Rules of Query Optimization

### Rule 1: Only Fetch What You Need

```sql
-- ❌ BAD: Fetching everything
SELECT * FROM orders WHERE status = 'active';

-- ✅ GOOD: Only what's needed
SELECT order_id, customer_id, total 
FROM orders 
WHERE status = 'active';
```

**Why it matters**: Reduces I/O, network transfer, and memory usage. With wide tables (50+ columns), `SELECT *` can be 10x slower.

### Rule 2: Filter Early, Join Later

```sql
-- ❌ BAD: Join first, then filter
SELECT o.order_id, c.name
FROM orders o
JOIN customers c ON o.customer_id = c.id
WHERE o.created_at > '2025-01-01';

-- ✅ BETTER (conceptually — optimizer usually handles this):
-- Push predicates into subqueries when optimizer doesn't
SELECT o.order_id, c.name
FROM (SELECT order_id, customer_id FROM orders WHERE created_at > '2025-01-01') o
JOIN customers c ON o.customer_id = c.id;
```

Modern optimizers do **predicate pushdown** automatically, but complex queries can confuse them.

### Rule 3: Avoid Functions on Indexed Columns

```sql
-- ❌ BAD: Function on column kills index usage
SELECT * FROM users WHERE YEAR(created_at) = 2025;

-- ✅ GOOD: Range query uses index
SELECT * FROM users WHERE created_at >= '2025-01-01' AND created_at < '2026-01-01';

-- ❌ BAD: LOWER() prevents index
SELECT * FROM users WHERE LOWER(email) = 'user@example.com';

-- ✅ GOOD: Use a functional index or store normalized
CREATE INDEX idx_email_lower ON users (LOWER(email));
```

### Rule 4: Be Smart with JOINs

```sql
-- JOIN types and their performance characteristics:

-- INNER JOIN: Returns only matching rows (usually fastest)
-- LEFT JOIN: Returns all left rows + matching right (can be slower)
-- CROSS JOIN: Cartesian product (DANGER — N × M rows)

-- ❌ BAD: Implicit join (harder to optimize, error-prone)
SELECT * FROM orders, customers WHERE orders.customer_id = customers.id;

-- ✅ GOOD: Explicit join
SELECT * FROM orders INNER JOIN customers ON orders.customer_id = customers.id;
```

**Join Order Matters**: The optimizer tries different join orders. For N tables, there are N! possible orderings. With 10+ tables, the optimizer may not explore all possibilities.

### Rule 5: Use EXISTS Instead of IN for Subqueries

```sql
-- ❌ SLOW with large subquery results
SELECT * FROM customers 
WHERE id IN (SELECT customer_id FROM orders WHERE total > 1000);

-- ✅ FASTER: EXISTS short-circuits
SELECT * FROM customers c
WHERE EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.total > 1000);
```

**Why**: `IN` materializes the entire subquery result. `EXISTS` stops at the first match.

---

## 3. Common Performance Killers

### The N+1 Query Problem (ORM trap)
```python
# ❌ N+1 Problem (1 query + N queries)
users = User.query.all()                    # 1 query
for user in users:
    orders = user.orders                     # N queries (1 per user!)

# ✅ Eager loading
users = User.query.options(joinedload(User.orders)).all()  # 1-2 queries
```

### Unbounded Queries
```sql
-- ❌ No LIMIT — could return millions of rows
SELECT * FROM logs WHERE level = 'ERROR';

-- ✅ Always paginate
SELECT * FROM logs WHERE level = 'ERROR' ORDER BY created_at DESC LIMIT 50 OFFSET 0;

-- ✅✅ Even better: Keyset pagination (no OFFSET performance degradation)
SELECT * FROM logs 
WHERE level = 'ERROR' AND created_at < '2025-12-01'
ORDER BY created_at DESC LIMIT 50;
```

### Correlated Subqueries in SELECT
```sql
-- ❌ Executes subquery for EVERY row
SELECT 
    o.order_id,
    (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
FROM orders o;

-- ✅ Use JOIN + GROUP BY instead
SELECT o.order_id, COUNT(oi.id) AS item_count
FROM orders o
LEFT JOIN order_items oi ON oi.order_id = o.id
GROUP BY o.order_id;
```

---

## 4. Optimization Techniques by Database

| Technique | PostgreSQL | MySQL | SQL Server |
|-----------|-----------|-------|------------|
| Query hints | `SET enable_seqscan = off` | `USE INDEX`, `FORCE INDEX` | `WITH (INDEX(...))`, `OPTION (HASH JOIN)` |
| Parallel query | Auto (v9.6+) | Limited (v8.0+) | Auto |
| Materialized views | Native `MATERIALIZED VIEW` | Manual (tables + triggers) | `INDEXED VIEW` |
| CTEs | Optimized (v12+ can inline) | Optimized (v8.0+) | Optimized |
| Partitioning | Declarative (v10+) | RANGE, LIST, HASH | Partition functions |

---

## 5. Quick Wins Checklist for the Session

- [ ] Run `EXPLAIN ANALYZE` on slow queries
- [ ] Check for missing indexes on WHERE/JOIN columns
- [ ] Replace `SELECT *` with specific columns
- [ ] Add `LIMIT` to all user-facing queries
- [ ] Look for N+1 patterns in ORM code
- [ ] Check for implicit type conversions in WHERE clauses
- [ ] Review queries doing full table scans on large tables
- [ ] Consider denormalization for read-heavy workloads

---

## 6. Teaching Analogy 🎯

> **Query optimization is like planning a road trip.** 
> - The **optimizer** is your GPS — it knows multiple routes.
> - **Indexes** are highways — fast but you need on/off ramps (maintenance cost).
> - **Full table scans** are country roads — fine for short trips, terrible for long ones.
> - **Statistics** are traffic data — outdated stats = bad route suggestions.
> - **EXPLAIN** is turning on "show route details" — you see exactly why the GPS chose that path.

---

*Prepared for Database Mastery Session | Feb 2026*

# NoSQL Modeling Patterns — Database Mastery Session

> **Session Goal**: Understand when and how to model data in NoSQL databases, the key patterns, and the fundamental shift in thinking from relational design.

---

## 1. The Mindset Shift: SQL vs NoSQL

### Relational Thinking (SQL)
```
"What data do I have?" → Normalize → "How do I query it?"
Design around DATA STRUCTURE → Queries adapt to the schema
```

### NoSQL Thinking
```
"What queries will I run?" → Denormalize → "How do I store data to serve those queries?"
Design around ACCESS PATTERNS → Schema adapts to the queries
```

**This is the #1 thing to teach**: In NoSQL, you model your data based on how you'll **read** it, not based on what the data looks like.

---

## 2. NoSQL Database Categories

```
┌─────────────────────────────────────────────────────────────────────┐
│ Type              │ Examples           │ Best For                   │
├─────────────────────────────────────────────────────────────────────┤
│ Document Store    │ MongoDB, Firestore │ Flexible schemas, nested   │
│                   │ CouchDB            │ data, content management   │
├─────────────────────────────────────────────────────────────────────┤
│ Key-Value Store   │ Redis, DynamoDB    │ Caching, sessions, simple  │
│                   │ Memcached          │ lookups, high throughput   │
├─────────────────────────────────────────────────────────────────────┤
│ Wide-Column Store │ Cassandra, HBase   │ Time-series, IoT, massive  │
│                   │ ScyllaDB           │ write throughput           │
├─────────────────────────────────────────────────────────────────────┤
│ Graph Database    │ Neo4j, Neptune     │ Relationships, social nets │
│                   │ ArangoDB           │ recommendations, fraud     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Document Database Patterns (MongoDB Focus)

### Pattern 1: Embedding (Denormalization)

**When**: Data is accessed together, 1:1 or 1:few relationships.

```json
// ✅ EMBEDDED: User with their addresses (1:few)
{
  "_id": "user_123",
  "name": "Alice",
  "email": "alice@example.com",
  "addresses": [
    {
      "type": "home",
      "street": "123 Main St",
      "city": "Portland",
      "state": "OR"
    },
    {
      "type": "work",
      "street": "456 Tech Ave",
      "city": "San Francisco",
      "state": "CA"
    }
  ]
}
```

**Benefits**: Single read gets everything. No joins. Atomic updates.  
**Risks**: Document size limit (16MB in MongoDB). Can't independently query embedded data efficiently.

**Rule of Thumb**:
```
Embed when:
  ✅ "Contains" relationship (user HAS addresses)
  ✅ Data is always accessed together
  ✅ Embedded data is small (< few hundred items)
  ✅ Embedded data doesn't change independently

Don't embed when:
  ❌ Embedded array could grow unbounded (millions of items)
  ❌ Data is accessed independently
  ❌ Many-to-many relationship
  ❌ Embedded data is large or frequently updated
```

### Pattern 2: Referencing (Normalization)

**When**: Data is large, accessed independently, or has many-to-many relationships.

```json
// User document
{
  "_id": "user_123",
  "name": "Alice",
  "email": "alice@example.com"
}

// Order documents (reference user by ID)
{
  "_id": "order_456",
  "user_id": "user_123",        // ← Reference
  "items": ["item_a", "item_b"],
  "total": 99.99,
  "created_at": "2025-12-01T10:00:00Z"
}
```

**Trade-off**: Requires multiple queries or `$lookup` (MongoDB's version of JOIN — expensive!).

### Pattern 3: Extended Reference (Hybrid)

**When**: You reference another document but need quick access to a few of its fields.

```json
// Order with extended reference to user
{
  "_id": "order_456",
  "user_id": "user_123",
  "user_name": "Alice",          // ← Copied from user document
  "user_email": "alice@ex.com",  // ← Copied for quick display
  "items": [...],
  "total": 99.99
}
```

**Trade-off**: Denormalized data may become stale. Need a strategy to update copies.

### Pattern 4: Subset Pattern

**When**: Documents are too large because of a big array, but you only need recent items.

```json
// Product with ONLY last 10 reviews embedded
{
  "_id": "product_789",
  "name": "Wireless Headphones",
  "price": 79.99,
  "recent_reviews": [            // ← Only last 10
    { "user": "Bob", "rating": 5, "text": "Great!", "date": "2025-12-01" },
    { "user": "Carol", "rating": 4, "text": "Good value", "date": "2025-11-28" }
    // ... up to 10
  ],
  "total_reviews": 1547
}

// Separate reviews collection for full history
{
  "_id": "review_001",
  "product_id": "product_789",
  "user": "Bob",
  "rating": 5,
  "text": "Great!",
  "date": "2025-12-01"
}
```

### Pattern 5: Bucket Pattern (Time-Series)

**When**: High-volume time-series data (IoT sensors, metrics, logs).

```json
// ❌ BAD: One document per measurement (millions of tiny documents)
{ "sensor_id": "temp_1", "value": 22.5, "ts": "2025-12-01T10:00:00Z" }
{ "sensor_id": "temp_1", "value": 22.7, "ts": "2025-12-01T10:00:01Z" }
// ... millions more

// ✅ GOOD: Bucket pattern — group measurements by time period
{
  "sensor_id": "temp_1",
  "bucket_start": "2025-12-01T10:00:00Z",
  "bucket_end": "2025-12-01T11:00:00Z",
  "count": 3600,
  "sum": 81000,
  "measurements": [
    { "ts": "2025-12-01T10:00:00Z", "value": 22.5 },
    { "ts": "2025-12-01T10:00:01Z", "value": 22.7 },
    // ... up to 3600 per hour-bucket
  ]
}
```

**Benefits**: Fewer documents, pre-computed aggregates, efficient range queries.

### Pattern 6: Computed Pattern (Pre-Aggregation)

**When**: Expensive computations that are read frequently.

```json
// Instead of computing on every read:
// "How many orders this month? What's the total revenue?"

// Pre-compute and store:
{
  "_id": "stats_2025_12",
  "month": "2025-12",
  "total_orders": 15234,
  "total_revenue": 1523400.00,
  "avg_order_value": 100.00,
  "top_products": [
    { "id": "prod_1", "name": "Widget A", "count": 500 },
    { "id": "prod_2", "name": "Gadget B", "count": 320 }
  ],
  "updated_at": "2025-12-15T12:00:00Z"
}
```

**Update strategy**: Real-time (on every write) or periodic (cron job).

### Pattern 7: Polymorphic Pattern

**When**: Documents in the same collection have different structures.

```json
// Vehicles collection — different types share common fields
{
  "_id": "v_001",
  "type": "car",
  "make": "Toyota",
  "model": "Camry",
  "doors": 4,
  "trunk_capacity_liters": 425
}

{
  "_id": "v_002",
  "type": "truck",
  "make": "Ford",
  "model": "F-150",
  "payload_kg": 1000,
  "bed_length_ft": 6.5
}

{
  "_id": "v_003",
  "type": "motorcycle",
  "make": "Harley-Davidson",
  "model": "Street 750",
  "engine_cc": 749
}

// Query all vehicles by make (common field):
db.vehicles.find({ make: "Toyota" })

// Query type-specific:
db.vehicles.find({ type: "truck", payload_kg: { $gte: 500 } })
```

---

## 4. Key-Value / DynamoDB Patterns

### Single Table Design (DynamoDB)

The most powerful DynamoDB pattern: store **ALL entities in one table** using clever key design.

```
┌────────────────┬──────────────────────┬─────────────────────────────┐
│ PK             │ SK                   │ Attributes                  │
├────────────────┼──────────────────────┼─────────────────────────────┤
│ USER#alice     │ PROFILE              │ name, email, joined_date    │
│ USER#alice     │ ORDER#2025-001       │ total, status, items        │
│ USER#alice     │ ORDER#2025-002       │ total, status, items        │
│ USER#alice     │ ADDRESS#home         │ street, city, state         │
│ USER#bob       │ PROFILE              │ name, email, joined_date    │
│ USER#bob       │ ORDER#2025-003       │ total, status, items        │
│ PRODUCT#widget │ METADATA             │ name, price, category       │
│ PRODUCT#widget │ REVIEW#alice         │ rating, text, date          │
│ PRODUCT#widget │ REVIEW#bob           │ rating, text, date          │
└────────────────┴──────────────────────┴─────────────────────────────┘
```

**Access patterns served**:
```
Get user profile:     PK = "USER#alice", SK = "PROFILE"
Get user's orders:    PK = "USER#alice", SK begins_with "ORDER#"
Get all user data:    PK = "USER#alice" (returns profile + orders + addresses)
Get product reviews:  PK = "PRODUCT#widget", SK begins_with "REVIEW#"
```

### GSI Overloading (Global Secondary Index)

```
GSI1: Inverted index for different access patterns

┌────────────────────────┬────────────────┬─────────────────┐
│ GSI1PK                 │ GSI1SK         │ (other attrs)   │
├────────────────────────┼────────────────┼─────────────────┤
│ ORDER#pending          │ 2025-12-01     │ user, total     │
│ ORDER#pending          │ 2025-12-02     │ user, total     │
│ ORDER#shipped          │ 2025-12-01     │ user, total     │
│ CATEGORY#electronics   │ PRODUCT#widget │ name, price     │
└────────────────────────┴────────────────┴─────────────────┘

Access patterns:
  All pending orders by date: GSI1PK = "ORDER#pending", GSI1SK > "2025-12-01"
  Products in category:       GSI1PK = "CATEGORY#electronics"
```

---

## 5. Wide-Column Patterns (Cassandra)

### Partition Key Design (Critical!)

```sql
-- Cassandra data is distributed by PARTITION KEY
-- All data with the same partition key lives on the same node

CREATE TABLE sensor_data (
    sensor_id TEXT,
    reading_date DATE,
    reading_time TIMESTAMP,
    value DOUBLE,
    PRIMARY KEY ((sensor_id, reading_date), reading_time)
);
-- Partition Key: (sensor_id, reading_date) → data for one sensor-day on one node
-- Clustering Column: reading_time → sorts data within the partition

-- ✅ GOOD: Query within a partition
SELECT * FROM sensor_data 
WHERE sensor_id = 'temp_1' AND reading_date = '2025-12-01'
AND reading_time >= '2025-12-01T10:00:00' AND reading_time < '2025-12-01T11:00:00';

-- ❌ BAD: Query across all partitions (full cluster scan!)
SELECT * FROM sensor_data WHERE value > 30;
```

### Time-Based Partitioning
```
Partition Key: sensor_id + date bucket

Day 1: [sensor_1, 2025-12-01] → 86,400 readings (manageable)
Day 2: [sensor_1, 2025-12-02] → 86,400 readings

vs.

BAD: [sensor_1] → millions of readings in one partition → HOT PARTITION! 🔥
```

### Query-First Table Design
```
-- In Cassandra, you create a TABLE PER QUERY PATTERN

-- Query 1: "Get user's recent orders"
CREATE TABLE orders_by_user (
    user_id UUID,
    order_date TIMESTAMP,
    order_id UUID,
    total DECIMAL,
    PRIMARY KEY (user_id, order_date)
) WITH CLUSTERING ORDER BY (order_date DESC);

-- Query 2: "Get orders by status"
CREATE TABLE orders_by_status (
    status TEXT,
    order_date TIMESTAMP,
    order_id UUID,
    user_id UUID,
    total DECIMAL,
    PRIMARY KEY (status, order_date)
) WITH CLUSTERING ORDER BY (order_date DESC);

-- Same data, different tables, different access patterns!
-- Write to BOTH tables on every order (or use materialized views)
```

---

## 6. Graph Database Patterns (Neo4j)

### When to Use Graph
```
Use Graph DB when:
  ✅ Relationships are as important as entities
  ✅ Queries involve traversing relationships (friends of friends)
  ✅ Variable-length paths ("shortest path between A and B")
  ✅ Many-to-many relationships with properties on the relationship

Avoid Graph DB when:
  ❌ Simple CRUD with no complex relationships
  ❌ Aggregations over large datasets
  ❌ Full-text search is primary use case
```

### Core Patterns
```cypher
// Social Network: Friends of Friends
MATCH (me:User {name: "Alice"})-[:FRIENDS_WITH*2]->(fof:User)
WHERE NOT (me)-[:FRIENDS_WITH]->(fof) AND fof <> me
RETURN DISTINCT fof.name AS suggestion;

// Recommendation: People who bought X also bought Y
MATCH (u:User)-[:PURCHASED]->(p1:Product {name: "Laptop"})
MATCH (u)-[:PURCHASED]->(p2:Product)
WHERE p2.name <> "Laptop"
RETURN p2.name, COUNT(*) AS times_co_purchased
ORDER BY times_co_purchased DESC LIMIT 5;

// Fraud Detection: Circular money flows
MATCH path = (a:Account)-[:TRANSFERRED_TO*3..6]->(a)
WHERE ALL(t IN relationships(path) WHERE t.amount > 10000)
RETURN path;
```

---

## 7. Choosing SQL vs NoSQL — Decision Framework

```
                        ┌── Need ACID transactions across multiple entities?
                        │   → SQL (or carefully designed NoSQL)
                        │
Start ──┬── Need flexible/evolving schema?
        │   → Document DB (MongoDB)
        │
        ├── Need extreme write throughput?
        │   → Wide-Column (Cassandra)
        │
        ├── Need sub-millisecond key lookups?
        │   → Key-Value (Redis, DynamoDB)
        │
        ├── Need complex relationship queries?
        │   → Graph DB (Neo4j)
        │
        ├── Need full-text search?
        │   → Search engine (Elasticsearch)
        │
        └── General purpose, complex queries, strong consistency?
            → SQL (PostgreSQL, MySQL)
```

### The Honest Truth About NoSQL
```
✅ NoSQL excels at:                    ❌ NoSQL struggles with:
  - Horizontal scaling                   - Ad-hoc queries
  - High write throughput                - JOINs across entities
  - Flexible schemas                     - Complex transactions
  - Specific access patterns             - Data consistency (eventual)
  - Developer velocity (initially)       - Reporting/analytics
```

---

## 8. Anti-Patterns to Avoid

### 1. Treating NoSQL Like SQL
```json
// ❌ BAD: Normalized data in MongoDB (too many lookups)
// Users collection
{ "_id": "u1", "name": "Alice", "address_id": "a1" }
// Addresses collection  
{ "_id": "a1", "street": "123 Main St" }
// Orders collection
{ "_id": "o1", "user_id": "u1", "item_ids": ["i1", "i2"] }
// Items collection
{ "_id": "i1", "name": "Widget" }

// Need 4 queries to show one order! 😱
```

### 2. Unbounded Arrays
```json
// ❌ BAD: Array that grows forever
{
  "_id": "popular_post",
  "title": "Viral Post",
  "comments": [
    // ... 500,000 comments → document exceeds 16MB limit!
  ]
}

// ✅ GOOD: Separate collection with reference
{ "_id": "comment_001", "post_id": "popular_post", "text": "...", "date": "..." }
```

### 3. Not Thinking About Access Patterns
```
// ❌ BAD: "Let's just store the data and figure out queries later"
// → End up with expensive full-collection scans
// → Forced to restructure data after going to production

// ✅ GOOD: List ALL access patterns FIRST, then design schema
```

---

## 9. Teaching Analogy 🎯

> **SQL vs NoSQL is like organizing a library:**
> - **SQL (Relational)**: Dewey Decimal System — every book has ONE correct place, organized by subject. Finding a book? Follow the system. Cross-referencing? Use the catalog. Rigid but powerful.
> - **Document DB (MongoDB)**: Each shelf is a self-contained "packet" — a cookbook contains the recipe, a photo of the dish, AND the grocery list. Everything you need in one grab.
> - **Key-Value (Redis/DynamoDB)**: Lockers with combination codes. If you know the code, instant access. If you don't? No way to search.
> - **Wide-Column (Cassandra)**: A massive filing cabinet where each drawer is labeled by topic+date. Great for pulling out an entire drawer. Terrible for "find all drawers containing the word 'budget'".
> - **Graph (Neo4j)**: A mind map on a whiteboard — everything is connected with labeled arrows. Great for "show me all connections to Alice within 3 hops."

---

*Prepared for Database Mastery Session | Feb 2026*

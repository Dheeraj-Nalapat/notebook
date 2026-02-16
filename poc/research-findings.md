# Research Findings: Existing Approaches to AI Memory/Brain Systems

> **Research Date**: February 16, 2026
> **Context**: Building a standalone Brain Engine that extracts knowledge from markdown files, classifies content, and enables intelligent retrieval with intuition generation using local LLMs.

---

## Table of Contents

1. [Existing Implementations](#existing-implementations)
2. [Theoretical / Academic Frameworks](#theoretical--academic-frameworks)
3. [Cross-Cutting Architectural Patterns](#cross-cutting-architectural-patterns)
4. [Key Lessons and Pitfalls](#key-lessons-and-pitfalls)
5. [What's Novel About Our Brain Engine](#whats-novel-about-our-brain-engine)
6. [References](#references)

---

## Existing Implementations

### 1. File-Based RAG (No Vector DB) — agent-cli by Bas Nijholt

**Source**: https://www.nijho.lt/post/file-based-rag-memory/

The most validated "keep it simple" approach. Rejects vector databases entirely:

- Markdown files in `~/my-docs` as the sole storage
- Git versioning for memory history and rollback
- OpenAI-compatible proxy so any tool (Cursor, Cline, Open WebUI) can use the same memory
- Decoupled from any specific client — works across tools via a proxy layer

**Key failure lesson**: His earlier project "AI Journal" tried sophisticated structured extraction (typed "claim atoms", multi-layer organization, recency-aware scoring with decay functions) but **failed because local LLMs couldn't handle the extraction complexity**. The takeaway: **validate each component (chunking, retrieval, re-ranking) independently before integration**.

**Architecture**:
```
Documents (folder) --> Chunking --> Embeddings --> Retrieval
Memories (Markdown) --> Git versioned --> Editable by human
Proxy Layer --> OpenAI-compatible API --> Any client tool
```

---

### 2. BrainAI — Multi-Agent Reasoning Pipeline

**Source**: https://github.com/shambhavi0x/BrainAI

A multi-step agentic system with self-evaluation:

- **Pipeline**: Planner (goal decomposition) --> Retriever (FAISS semantic search) --> Reasoner (LLM) --> Tool Chain (Summarize/Extract/Analyze/Verify) --> Evaluator (confidence scoring)
- Self-evaluation layer assigns confidence scores to outputs
- Falls back to external knowledge when documents are insufficient
- Produces structured intelligence reports with reasoning chains

**Stack**: Groq LLM, LangChain, FAISS, SentenceTransformers, Streamlit UI

**Key insight**: The confidence scoring and self-evaluation loop is what separates this from basic RAG. The system doesn't just retrieve — it reasons about whether the retrieval was sufficient.

---

### 3. Second Brain AI Agent — Tiago Forte's Method Automated

**Source**: https://github.com/2ndbrainai/Second-Brain-AI-agent

Implements the popular "Building a Second Brain" (BASB) methodology with automation:

- Auto-indexes Markdown files + extracts content from linked PDFs, YouTube videos, web pages
- File-watching for automatic re-indexing on changes
- Built on LangChain + ChromaDB
- Designed for Obsidian integration

**Pipeline**:
```
Markdown files --> Text extraction --> Chunking --> ChromaDB vector store --> Query agent
      |
      +--> Embedded links (PDFs, YouTube, web) --> Additional extraction
```

**Relevance to our project**: Closest to what we're building in terms of the "watch folder, extract, index" pattern. Key difference: they don't classify content into categories or generate cross-concept connections.

---

### 4. Basic Memory — Semantic Graph from Conversations

**Source**: https://memory.basicmachines.co/docs/introduction

Persistent knowledge graph stored as Markdown:

- **Markdown files are the source of truth** (not a database)
- SQLite used ONLY for indexing/search speed — not primary storage
- Integrates via **Model Context Protocol (MCP)** — relevant since our workspace already has an MCP server
- Git-compatible versioning
- Both humans and AI can read/write to the same knowledge base
- Auto-syncs file changes to the semantic graph

**Key design principle**: The knowledge graph is derived FROM the files, not the other way around. If you delete the database, it can be rebuilt from the Markdown files. Files are always the single source of truth.

---

### 5. OpenClaw Memory System — Lifecycle-Managed Memory

**Source**: http://clawdocs.org/architecture/memory-system/

Practical persistent memory with a biological-inspired lifecycle:

- **5-step memory lifecycle**:
  1. **Decay** — Old unused memories gradually deprioritized (not deleted)
  2. **Retrieval** — Relevant memory loaded on new conversations
  3. **Storage** — Write extracted knowledge to appropriate file
  4. **Extraction** — Pull key information into structured notes
  5. **Observation** — Identify facts worth remembering during processing

- Categories: `preferences.md`, `contacts.md`, `projects.md`, `learnings.md`
- Stored at `~/.openclaw/memory/` — fully editable with any text editor
- Token-bounded context loading per conversation
- Privacy-first: recommends local models

**Key insight**: The decay mechanism prevents memory bloat. Without it, every system eventually drowns in old, irrelevant information. Memories aren't deleted — they're just ranked lower over time unless re-accessed.

---

### 6. Obsidian + Smart Connections Plugin

**Source**: Community plugins for Obsidian

The most popular existing approach to AI-powered note organization:

- Uses embeddings to find semantically similar notes
- Auto-suggests links between notes based on content similarity
- Local processing with optional cloud API
- Works within Obsidian's existing wiki-link structure

**Limitation**: It's a plugin, not a standalone system. It can suggest connections but doesn't autonomously classify, extract, or generate new insights.

---

## Theoretical / Academic Frameworks

### 7. Nenex — Neural Personal Wiki (Theoretical, Never Implemented)

**Source**: https://gwern.net/nenex

A purely theoretical framework by Gwern, deeply influential but never built:

- **Edit-centric, not file-centric** — the wiki is a sequence of edits, not a set of pages
- All user actions (writes, edits, summarizations) are logged to a master log
- An LLM is continuously finetuned on this edit stream to learn the user's writing style, knowledge corpus, and preferences
- The wiki is represented as a revision-control history (functional programming style)
- Inspired by Vannevar Bush's Memex and Douglas Engelbart's "tool for thought"

**Proposed features**:
- Auto-detecting pages that have become stale or need updates
- Suggesting links between concepts
- Summarizing on demand
- Learning user's unique voice and preferences

**Core insight**: Treat everything as sequence prediction rather than traditional hypertext. The system doesn't just store — it learns to predict what you'd write next.

---

### 8. Model-Document Protocol (MDP) — Academic Framework

**Source**: arxiv.org/pdf/2510.25160v2

A formal academic framework for transforming raw documents into LLM-ready inputs. Defines **three pathways**:

1. **Agentic Reasoning**: Curating raw evidence into coherent context through multi-step agent workflows
2. **Memory Grounding**: Accumulating reusable notes for enriched reasoning across sessions
3. **Structured Leveraging**: Encoding documents into formal representations (knowledge graphs, KV caches, structured schemas)

Goes beyond simple "passage fetching" — emphasizes semantic abstraction, structured transformation, and map-reduce style synthesis for integrating large-scale evidence.

**Relevance**: Our Brain Engine essentially implements all three pathways: agentic classification, persistent memory files, and knowledge graph construction.

---

### 9. Stanford Generative Agents — Cognitive Memory Architecture

**Source**: Park et al., "Generative Agents: Interactive Simulacra of Human Behavior" (2023)

Simulated human-like memory in AI agents:

- **Memory Stream**: A timestamped log of ALL observations (everything the agent sees/does)
- **Retrieval Function**: Scores memories by three factors:
  - **Recency** — How recently was this memory created?
  - **Importance** — How significant is this memory? (scored by LLM on creation)
  - **Relevance** — How related is it to the current query/context?
- **Reflection**: Periodically, the agent synthesizes higher-level insights from raw memories
  - Raw observations --> "What are the key takeaways?" --> Higher-level reflections
  - Reflections can themselves be reflected upon, creating a hierarchy

**Memory hierarchy**:
```
Level 0: Raw observations ("Alice saw Bob at the cafe")
Level 1: Reflections ("Alice and Bob are becoming friends")
Level 2: Meta-reflections ("Alice values social connections")
```

**Key insight**: The reflection step is what creates "understanding". Without it, you just have a search engine over memories. With it, the system can form opinions, spot patterns, and make inferences — which is exactly what our "intuition engine" aims to do.

---

### 10. MemGPT / Letta — OS-Style Tiered Memory for LLMs

**Source**: MemGPT paper + Letta project (2024-2025)

Models memory management after an operating system's virtual memory:

- **Main Context** (working memory): Limited by LLM context window, contains currently active information
- **Recall Storage** (conversation history): Searchable log of past interactions
- **Archival Storage** (long-term): Vector-indexed, unlimited size, persistent across sessions

**Key innovation**: The LLM itself decides when to page memory in and out — like a virtual memory OS. It issues function calls like `archival_memory_insert()`, `archival_memory_search()`, `conversation_search()`.

**Relevance to our project**: Our Brain structure (Thoughts = working/episodic, Memory = long-term, Connections = associative) naturally maps to this tiered model. The key difference is we use file-based storage instead of database-backed tiers.

---

### 11. Microsoft GraphRAG — Community-Based Knowledge Graphs

**Source**: Microsoft Research (2024)

Builds a knowledge graph from documents using LLMs, then uses graph structure for retrieval:

- **Entity Extraction**: LLM identifies entities and relationships from text chunks
- **Community Detection**: Uses the Leiden algorithm to find clusters of related entities
- **Community Summaries**: LLM generates summaries for each community
- **Dual Search**:
  - **Local Search**: Traditional RAG for specific questions
  - **Global Search**: Uses community summaries for broad, thematic questions

**Architecture**:
```
Documents --> Chunks --> Entity/Relationship Extraction --> Knowledge Graph
    --> Leiden Community Detection --> Community Summaries
    --> Local Search (entity-focused) + Global Search (theme-focused)
```

**Key insight**: Community detection automatically finds "topics" without manual classification. The Brain Engine could use this instead of (or alongside) LLM-based classification.

---

## Cross-Cutting Architectural Patterns

| Pattern | Used By | Relevance to Our Brain Engine |
|---------|---------|-------------------------------|
| **Markdown as source of truth** | agent-cli, Basic Memory, OpenClaw | Already our design — validated by multiple projects |
| **File watcher triggers** | Second Brain AI, agent-cli | Our `watchdog` plan — validated pattern |
| **Memory decay/scoring** | OpenClaw, Generative Agents | Should add to prioritize recent knowledge |
| **Knowledge graph** | Basic Memory, GraphRAG | Our NetworkX plan — validated, consider community detection |
| **Vector embeddings for retrieval** | BrainAI, Second Brain AI | Our ChromaDB + Ollama embeddings plan — validated |
| **Reflection/Intuition generation** | Generative Agents, BrainAI | Our "intuition engine" — novel when combined with local LLM |
| **Edit-centric logging** | Nenex (theoretical) | Could log all Brain changes for future learning |
| **Tiered memory (working/archival)** | MemGPT/Letta | Our Thoughts vs Memory split already mirrors this |
| **Confidence scoring** | BrainAI, MDP | Should add to classifier output |
| **Community detection** | GraphRAG | Could auto-discover topic clusters |
| **MCP integration** | Basic Memory | Our workspace already has an MCP server — future bridge |
| **Self-evaluation loop** | BrainAI | Could validate extraction quality |
| **Git versioning** | agent-cli, Basic Memory, OpenClaw | Should add for rollback and history |

---

## Key Lessons and Pitfalls

### From agent-cli (Most Important Lesson)
> **"Don't build the whole system at once."** The author's earlier AI Journal project attempted sophisticated structured extraction with local LLMs and failed. The successful approach was validating each piece independently:
> 1. First, prove chunking works
> 2. Then, prove retrieval works
> 3. Then, prove re-ranking works
> 4. Only then, combine them

### From OpenClaw
> **"Decay functions are essential."** Without them, the system drowns in old information. Every memory should have a recency score that gradually decreases unless the memory is re-accessed.

### From Generative Agents
> **"The reflection step is what separates retrieval from understanding."** Periodically synthesizing higher-level insights from raw memories creates genuine "knowledge" rather than just a search index.

### From Nenex (Theoretical)
> **"Edit-centric logging enables future learning."** If you log every change to the Brain, you build a dataset that could later be used to finetune a model on YOUR specific knowledge patterns.

### From GraphRAG
> **"Community detection finds structure humans miss."** Automatic clustering of entities can reveal topic groupings and connections that manual classification would never discover.

### From MemGPT
> **"Let the system manage its own memory."** The most sophisticated systems don't just store information passively — they actively decide what to remember, what to archive, and what to surface.

### General Pitfalls to Avoid
1. **Over-engineering classification prompts** — local LLMs work best with simple, well-structured prompts
2. **Storing everything in vectors** — files should be the truth, vectors are just an index
3. **No deduplication strategy** — re-processing the same file shouldn't create duplicate entries
4. **Ignoring token limits** — when loading context for retrieval, always bound the total tokens
5. **Building monolithically** — validate each component before integration

---

## What's Novel About Our Brain Engine

Comparing against all 11 existing solutions, our system has a unique combination of properties:

### 1. Cognitive-Mapped Folder Structure
No existing tool maps its storage to the human brain's memory architecture:
- `Thoughts/daily/` = **Episodic Memory** (time-stamped experiences)
- `Thoughts/long-shots/` = **Prospective Memory** (future plans)
- `Memory/Concepts/` = **Semantic Memory** (facts, concepts, knowledge)
- `Memory/Skills/` = **Procedural Memory** (how-to knowledge)
- `Memory/Connections/` = **Associative Memory** (knowledge graph)
- `Thoughts/scratchpad.md` = **Working Memory** (temporary buffer)

### 2. Local LLM for Both Classification AND Intuition
Most tools use cloud APIs or only do retrieval. We use Ollama for:
- Content classification (concept vs skill vs connection)
- Tag extraction
- Summary generation
- Cross-concept intuition discovery
- All fully offline, fully private

### 3. Standalone Decoupled Architecture
Most tools are plugins (Obsidian plugins, Cursor extensions). Our Brain Engine is:
- An independent Python service
- Exposes an HTTP API
- Can be consumed by any tool
- Watches for file changes autonomously
- Completely decoupled from any editor or AI assistant

### 4. Dual-Mode Knowledge Representation
Simultaneously maintains:
- **Human-readable**: Clean Markdown files with frontmatter and wikilinks
- **Machine-searchable**: Vector embeddings in ChromaDB
- **Graph-navigable**: NetworkX knowledge graph
- All three stay in sync automatically

### 5. Active Intuition Engine
Existing tools only retrieve. Our system also:
- Periodically generates NEW connections between concepts
- Identifies gaps in knowledge
- Suggests related topics to explore
- Produces "What if X connects to Y?" style insights

---

## Technology Comparison Matrix

| Feature | agent-cli | BrainAI | Second Brain AI | Basic Memory | OpenClaw | **Our Brain Engine** |
|---------|-----------|---------|-----------------|--------------|----------|---------------------|
| Storage | Markdown | FAISS | ChromaDB | MD + SQLite | Markdown | MD + ChromaDB + NetworkX |
| Classification | None | None | None | None | Manual categories | **LLM-powered auto** |
| Knowledge Graph | No | No | No | Semantic graph | No | **Yes (NetworkX)** |
| Intuition/Reflection | No | Confidence scoring | No | No | No | **Yes (Ollama)** |
| File Watching | Yes | No | Yes | Auto-sync | No | **Yes (watchdog)** |
| Memory Decay | No | No | No | No | Yes | **Planned** |
| API | Proxy | Streamlit | CLI | MCP | CLI | **FastAPI** |
| Local LLM | Partial | No (Groq) | No (OpenAI) | No | Optional | **Yes (Ollama)** |
| Git Integration | Yes | No | No | Yes | Yes | **Planned** |
| Standalone | Yes | Yes | Yes | MCP plugin | Plugin | **Yes** |

---

## References

1. **agent-cli / File-Based RAG**: https://www.nijho.lt/post/file-based-rag-memory/
2. **BrainAI**: https://github.com/shambhavi0x/BrainAI
3. **Second Brain AI Agent**: https://github.com/2ndbrainai/Second-Brain-AI-agent
4. **Basic Memory**: https://memory.basicmachines.co/docs/introduction
5. **OpenClaw Memory System**: http://clawdocs.org/architecture/memory-system/
6. **Nenex (Neural Personal Wiki)**: https://gwern.net/nenex
7. **Model-Document Protocol (MDP)**: https://arxiv.org/pdf/2510.25160v2
8. **Generative Agents (Stanford)**: Park et al., 2023 — "Generative Agents: Interactive Simulacra of Human Behavior"
9. **MemGPT / Letta**: https://memgpt.ai / https://github.com/letta-ai/letta
10. **Microsoft GraphRAG**: https://github.com/microsoft/graphrag
11. **Obsidian Smart Connections**: Obsidian community plugin ecosystem

---

*Research compiled for Brain Engine POC — February 2026*

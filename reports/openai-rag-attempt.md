# OpenAI RAG Attempt

I added an OpenAI-backed RAG harness named `openai_semantic_hybrid`.

It uses:

- BM25 candidate generation over notes + transcript chunks.
- OpenAI `text-embedding-3-small` embeddings for semantic reranking.
- OpenAI Responses API generation for grounded synthesis with meeting-id citations.
- A local embedding cache at `data/processed/openai-embedding-cache.json`.

Command:

```bash
npm run eval:openai
```

Current environment result:

```text
getaddrinfo ENOTFOUND api.openai.com
Host api.openai.com not found: 5(REFUSED)
```

So the implementation is present, but this dev environment cannot resolve the OpenAI API hostname. The same command should run in a network that allows outbound access to `api.openai.com` with `OPENAI_API_KEY` set.

# Granola Meetings Eval

A compact benchmark for comparing meeting-corpus agents over the provided Granola transcripts and notes.

## What It Tests

- single-meeting factual retrieval
- temporal queries like "latest standup"
- cross-meeting synthesis
- product-feedback synthesis
- sales/compliance summaries
- unsupported-specific handling, where the right answer is to avoid inventing facts

The default run compares two offline harnesses:

- `notes_bm25`: searches titles, lists, people, and generated meeting notes
- `hybrid_transcript_bm25`: searches notes plus overlapping transcript chunks

There is also an OpenAI-backed RAG harness:

- `openai_semantic_hybrid`: uses BM25 only for candidate generation, reranks candidates with OpenAI embeddings, then asks an OpenAI model to synthesize the answer with citations

The default answerer is deterministic and extractive so the benchmark can be rerun without model variance or an API key. If `OPENAI_API_KEY` is set, pass `--llm` to use a model-backed answerer over the same retrieved context.

The grader separates meeting-level citation recall from citation span support. Citation recall checks whether the answer cited the required meeting; citation span support checks whether the cited snippet overlaps the expected supporting evidence, which makes weak or title-only citations visible.

The design is research-informed: `docs/research-notes.md` summarizes the ComplexFuncBench/ToolEval-style step-evaluation ideas and the practical RAG/observability patterns adapted here.

Online evaluation plan: `docs/online-evaluation.md` defines A/B arms, event schema, user feedback, citation click-through, reformulation rate, thumbs up/down, task completion, and human review sampling.

## Setup

```bash
/usr/bin/npm install --registry https://registry.x2p.facebook.net/
cp .env.example .env.local
```

Set `OPENAI_API_KEY` in `.env.local` only if you want model-backed answering.

## Run

```bash
/usr/bin/npm run build:cli
/usr/bin/npm run ingest
/usr/bin/npm run eval
/usr/bin/npm run report
/usr/bin/npm run human-review
/usr/bin/npm run check-regressions
```

Or run the core benchmark/report pipeline:

```bash
/usr/bin/npm run prepare-data
```

Run one config:

```bash
/usr/bin/npm run eval -- --config hybrid_transcript_bm25
```

Run with an OpenAI-backed answerer:

```bash
/usr/bin/npm run eval -- --llm
```

Run the OpenAI semantic RAG harness:

```bash
/usr/bin/npm run eval:openai
```

Run all harnesses, including OpenAI semantic RAG:

```bash
/usr/bin/npm run eval:all
```

The RAG harness requires outbound access to `api.openai.com`. In restricted environments where that hostname cannot resolve, the offline harnesses still run and the OpenAI harness can be rerun unchanged from a normal network.

## Dashboard

```bash
/usr/bin/npm run dev
```

Open the Vite URL and inspect aggregate scores, per-case answers, retrieved evidence, and missing rubric terms.

## Outputs

- `data/processed/meetings.json`: local merged corpus, ignored by git
- `reports/latest-results.json`: latest full benchmark result
- `public/results/latest-results.json`: dashboard copy of the latest result
- `reports/benchmark-report.md`: readable experiment report
- `reports/human-review.csv`: reviewer worksheet for sampled answer review

## Data and Secret Handling

The raw data and processed corpus are intentionally ignored by `.gitignore`. Do not commit raw transcripts or real API keys. If the repository is made public, include instructions for the reviewer to place the provided data locally and run ingestion.

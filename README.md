# Granola Meetings Eval

A compact benchmark for comparing meeting-corpus agents over the provided Granola transcripts and notes.

## What It Tests

- single-meeting factual retrieval
- temporal queries like "latest standup"
- cross-meeting synthesis
- product-feedback synthesis
- sales/compliance summaries
- unsupported-specific handling, where the right answer is to avoid inventing facts

The default run compares several offline agent harnesses. These are not just retrieval labels; each one captures the surrounding agent setup: system prompt, tool definitions, orchestration loop, context packing, memory boundary, sandbox/approval policy, logging, recency handling, and prompt/grounding policy.

- `notes_bm25`: searches titles, lists, people, and generated meeting notes
- `compact_hybrid_bm25`: searches notes plus transcripts, then aggressively compacts and diversifies the context
- `hybrid_transcript_bm25`: searches notes plus overlapping transcript chunks
- `wide_context_hybrid_bm25`: gives the agent a larger context window and allows more chunks per meeting
- `recency_weighted_hybrid_bm25`: uses the hybrid toolchain with a stronger temporal/recency ranking policy
- `local_vector_database_rag`: indexes notes and transcript chunks into a local vector database and fuses vector search with BM25 candidates

There is also an OpenAI-backed RAG harness:

- `openai_semantic_hybrid`: uses BM25 only for candidate generation, reranks candidates with OpenAI embeddings, then asks an OpenAI model to synthesize the answer with citations

The default answerer is deterministic and extractive so the benchmark can be rerun without model variance or an API key. If `OPENAI_API_KEY` is set, pass `--llm` to use a model-backed answerer over the same retrieved context. The point of the offline comparison is to show that the same answerer can produce different outcomes when the harness changes.

The grader separates meeting-level citation recall from citation span support. Citation recall checks whether the answer cited the required meeting; citation span support checks whether the cited snippet overlaps the expected supporting evidence, which makes weak or title-only citations visible. The deterministic grader is the default because it is repeatable, cheap, and easy to compare across runs. An optional OpenAI LLM-as-judge pass can be enabled with `--judge` to add semantic correctness, citation faithfulness, completeness, and hallucination-risk diagnostics.

The design is research-informed: `docs/research-notes.md` summarizes the ComplexFuncBench/ToolEval-style step-evaluation ideas and the practical RAG/observability patterns adapted here.

Online evaluation plan: `docs/online-evaluation.md` defines A/B arms, event schema, user feedback, citation click-through, reformulation rate, thumbs up/down, task completion, and human review sampling.

## Code Structure

- `src/cli/`: command-line entry points for ingesting data, running evals, rendering reports, creating human-review samples, and checking regressions
- `src/lib/configs.ts`: agent-harness definitions, including system prompt, tools, loop, context, memory, sandbox, approvals, and logging policy
- `src/lib/retrieval.ts`: local BM25 retrieval over notes and transcript chunks
- `src/lib/vectorDatabase.ts`: local vector database retrieval over notes and transcript chunks
- `src/lib/semanticRetrieval.ts`: OpenAI embedding rerank for the semantic RAG harness
- `src/lib/answer.ts`: deterministic extractive answerer and optional OpenAI answer synthesis
- `src/lib/grade.ts`: deterministic offline grader and aggregate metrics
- `src/lib/llmJudge.ts`: optional OpenAI LLM-as-judge evaluator used by `npm run eval -- --judge`
- `src/lib/report.ts`: Markdown experiment report renderer
- `src/app/`: Vite/React dashboard for inspecting runs, cases, answers, evidence, and traces
- `evals/granola_meetings_eval.json`: golden query set with expected behavior, evidence, and rubric terms
- `docs/`: methodology and online evaluation plan
- `reports/`: generated report and human-review worksheet artifacts

## Setup

```bash
npm install
cp .env.example .env.local
mkdir -p data/raw
cp /path/to/transcripts.json data/raw/transcripts.json
cp /path/to/data.json data/raw/data.json
```

The default paths in `.env.local` point at `data/raw/transcripts.json` and `data/raw/data.json`. Override them if you keep the provided files elsewhere. Set `OPENAI_API_KEY` only if you want model-backed answering.

## Run

```bash
npm run build:cli
npm run ingest
npm run eval
npm run report
npm run human-review
npm run check-regressions
```

Or run the core benchmark/report pipeline:

```bash
npm run prepare-data
```

Run one harness:

```bash
npm run eval -- --config hybrid_transcript_bm25
```

Run with an OpenAI-backed answerer:

```bash
npm run eval -- --llm
```

Run the optional OpenAI LLM-as-judge pass:

```bash
npm run eval -- --judge
```

Because the default run now evaluates five offline harnesses, `--judge` makes one judge call per case per harness. To keep cost down, judge a subset with `--config`, for example:

```bash
npm run eval -- --config notes_bm25,wide_context_hybrid_bm25 --judge
```

Run the OpenAI semantic RAG harness:

```bash
npm run eval:openai
```

Run all harnesses, including OpenAI semantic RAG:

```bash
npm run eval:all
```

The RAG harness requires outbound access to `api.openai.com`. In restricted environments where that hostname cannot resolve, the offline harnesses still run and the OpenAI harness can be rerun unchanged from a normal network.

## Dashboard

```bash
npm run dev
```

The deployment dashboard serves the full benchmark result from `public/results/latest-results.json`, including answer text, retrieved evidence snippets, citations, and trace metadata. Keep the GitHub repo and deployment link limited to the Granola reviewers.

Open the Vite URL and inspect aggregate scores, per-case answers, retrieved evidence, and missing rubric terms.

## Vercel Deployment

This is a Vite/React app, so it can be deployed directly to Vercel from this project directory. The Vercel build command is `npm run build` and the output directory is `dist`, both captured in `vercel.json`.

For a deployment with populated dashboard results, generate the public results file before deploying:

```bash
npm run build:cli
npm run ingest
npm run eval
npm run report
```

That writes `public/results/latest-results.json`, which the dashboard loads at runtime. If private meeting data should not be deployed, the app still builds and the tracked `reports/benchmark-report.md` remains the shareable experiment artifact.

## Outputs

- `data/processed/meetings.json`: local merged corpus, ignored by git
- `reports/latest-results.json`: latest full benchmark result
- `public/results/latest-results.json`: dashboard copy of the latest result
- `reports/benchmark-report.md`: readable experiment report
- `reports/human-review.csv`: reviewer worksheet for sampled answer review

## Prompt Coverage and Evidence

### Efficiently find the correct content

Implemented with four retrieval paths: notes-only BM25, hybrid notes plus transcript chunks, local vector database plus BM25 fusion, and OpenAI embedding rerank over BM25 candidates. The hybrid approach keeps lexical retrieval as a cheap baseline while allowing transcript evidence to recover facts not present in notes; the vector database path tests cosine-similarity retrieval over the same corpus while retaining BM25 as a grounding-oriented retriever. Evidence: `src/lib/retrieval.ts`, `src/lib/vectorDatabase.ts`, `src/lib/semanticRetrieval.ts`, `src/lib/configs.ts`.

### Know whether one query approach is better than another

Implemented as an offline benchmark runner that evaluates every case across selected harness configs and writes comparable scores, traces, latency, token, and cost estimates. Evidence: `src/cli/eval.ts`, `src/lib/grade.ts`, `src/lib/report.ts`, `reports/benchmark-report.md`.

### Dataset of meetings and transcripts

Implemented an ingestion step that merges the provided transcript and metadata files into a local processed corpus. Raw and processed data are intentionally ignored so private meeting content is not committed. Evidence: `src/cli/ingest.ts`, `src/lib/data.ts`, `.gitignore`, `.env.example`.

### Small high-signal realistic query set

Implemented a compact golden set covering factual lookup, temporal lookup, cross-meeting synthesis, account summaries, product feedback, compliance/security, and insufficient-evidence handling. Evidence: `evals/granola_meetings_eval.json`.

### Meaningful retrieval and reasoning behaviours

Covered single-meeting retrieval, latest-meeting temporal intent, multi-meeting synthesis, transcript-vs-notes context selection, ambiguity/no-answer behavior, citation grounding, and cost/latency tradeoffs. Evidence: `evals/granola_meetings_eval.json`, `src/lib/text.ts`, `src/lib/retrieval.ts`, `src/lib/answer.ts`.

### Define good answers and evidence

Each eval case includes expected behavior, required meeting evidence, evidence snippets, and expected answer terms. The grader checks retrieval recall, citation recall, citation span support, expected-term coverage, hallucination risk, tool success, step completeness, and latency. Evidence: `evals/granola_meetings_eval.json`, `src/lib/grade.ts`.

### Repeatable runner and grader

The default answerer and grader are deterministic so runs can be compared without model variance or API cost. The same runner can optionally enable OpenAI answering with `--llm` and OpenAI judging with `--judge`. Evidence: `src/cli/eval.ts`, `src/lib/answer.ts`, `src/lib/grade.ts`, `src/lib/llmJudge.ts`.

### Compare at least two approaches

The default run compares notes-only BM25, compact hybrid BM25, balanced hybrid BM25, wide-context BM25, recency-weighted BM25, and vector database + BM25 RAG harnesses. The optional `openai_semantic_hybrid` harness uses embedding rerank and model synthesis when an API key and network are available. Evidence: `src/lib/configs.ts`, `npm run eval`, `npm run eval:openai`.

### Minimal agent or harness

Implemented a runnable TypeScript harness with CLI workflows for ingestion, evaluation, report generation, human review sampling, and regression checks, plus a React dashboard for inspection. Evidence: `src/cli/`, `src/lib/`, `src/app/`, `package.json`.

### Multi-turn, context selection, grounding, ambiguity, latency, and cost

This benchmark prioritizes context selection, grounding, ambiguity/no-answer behavior, latency, and cost because those are most diagnostic for a first meeting-corpus agent benchmark. Multi-turn is documented as a future extension rather than included in the small initial set. Evidence: `docs/research-notes.md`, `docs/online-evaluation.md`, `src/lib/metrics.ts`, `src/cli/regression.ts`.

### Distinguish system failures from grading failures

The output separates retrieval recall, answer-term coverage, citation recall, citation support, hallucination risk, and optional LLM judge scores. This makes it easier to tell whether a miss came from retrieval, synthesis, citation grounding, or a brittle rubric. Evidence: `src/lib/grade.ts`, `src/lib/llmJudge.ts`, `reports/human-review.csv`.

### Research-informed methodology

The design adapts stepwise tool-use evaluation, RAG evaluation, citation grounding, observability, and human review patterns. Deterministic metrics stay primary for repeatability; LLM-as-judge is optional because it adds semantic coverage but also cost and variance. Evidence: `docs/research-notes.md`, `src/lib/llmJudge.ts`.

### Deliverable: Code

The project is runnable with TypeScript CLI scripts and a Vite/React dashboard. Evidence: `package.json`, `src/cli/eval.ts`, `src/app/main.tsx`.

### Deliverable: Experiment report

The report includes methodology, harness configs, score tables, discussion, observability, cost efficiency, A/B experiment plan, notable failures, and extensions. Evidence: `reports/benchmark-report.md`, generated by `src/cli/report.ts`.

### Evaluation: Benchmark quality

Cases are intentionally small but varied, each with evidence and expected behavior. The grader measures the behaviors the benchmark is meant to test: retrieval, grounding, answer coverage, citations, no-answer behavior, tool traces, latency, and cost. Evidence: `evals/granola_meetings_eval.json`, `src/lib/grade.ts`.

### Evaluation: Actionable insights

The benchmark exposes which harness wins, where it fails, and which improvement to try next. It includes regression gates and a human-review CSV so future changes can be compared instead of guessed. Evidence: `src/cli/regression.ts`, `src/cli/humanReview.ts`, `reports/human-review.csv`.

### Example categories

The eval set includes retrieval-style questions, lateral/cross-meeting synthesis, and open-ended coaching/product-summary style questions while keeping every answer grounded in specific meeting evidence. Evidence: `evals/granola_meetings_eval.json`.

## Optimization Notes

- Retrieval: BM25 is used as a cheap, strong baseline; hybrid transcript retrieval expands recall; local vector database retrieval tests cosine-similarity RAG with BM25 fusion and no external service; OpenAI embeddings rerank only a candidate pool to control cost. Evidence: `src/lib/retrieval.ts`, `src/lib/vectorDatabase.ts`, `src/lib/semanticRetrieval.ts`.
- Context packing: harnesses vary top-k, transcript chunk size, overlap, docs per meeting, context character budget, and temporal recency weighting to test compact vs wide vs recency-aware agent behavior. Evidence: `src/lib/configs.ts`, `src/lib/retrieval.ts`.
- Answering: deterministic extractive answering is the default for repeatable CI-style evals; model-backed answering is opt-in with `--llm`. Evidence: `src/lib/answer.ts`.
- Judging: deterministic metrics remain primary; optional `--judge` adds semantic validation when API access is available. Evidence: `src/lib/grade.ts`, `src/lib/llmJudge.ts`.
- Observability: every run records interpretation, retrieval, generation, and optional judge trace steps with latency and structured outputs. Evidence: `src/cli/eval.ts`, `src/lib/types.ts`.
- Cost control: token and API-cost estimates are recorded per answer and summarized by harness; regression checks enforce latency, cost, recall, citation support, and hallucination guardrails. Evidence: `src/lib/metrics.ts`, `src/cli/regression.ts`.
- Review loop: generated reports and human-review CSVs make it easy to inspect borderline cases and improve the benchmark. Evidence: `src/lib/report.ts`, `src/cli/humanReview.ts`.

## Data and Secret Handling

The raw data and processed corpus are intentionally ignored by `.gitignore`. Do not commit raw transcripts or real API keys. If the repository is made public, include instructions for the reviewer to place the provided data locally and run ingestion.

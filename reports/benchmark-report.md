# Granola Meetings Agent Benchmark Report

Generated: 2026-10-26T18:06:30.634Z

## Abstract

This benchmark evaluates whether a meeting-corpus agent can retrieve the right meetings, select grounded evidence, and produce an answer that covers the expected facts. I built a compact, high-signal set of 10 realistic queries over 898 Granola meetings (873 with raw transcripts), spanning single-meeting lookup, temporal lookup, cross-meeting synthesis, compliance/security asks, product feedback synthesis, and unsupported-specific handling.

The methodology is informed by stepwise tool-use evaluation patterns from ComplexFuncBench / ToolEval-style benchmarks and practical eval/observability tooling such as DeepEval and Evidently: log the trajectory, grade tool/retrieval behavior separately from final semantic grounding, and keep enough structured metadata to debug failures over time. In this implementation every answer records JSON trace steps for query interpretation, retrieval, and generation.

The grader intentionally separates evidence recall, answer coverage, citation behavior, tool-step success, and latency. That makes the result actionable: a low score can point to retrieval/context selection, answer synthesis, citation behavior, trace/tool behavior, or grading/rubric issues.

## Harnesses Tested

- OpenAI Semantic Hybrid (`openai_semantic_hybrid`): Uses BM25 as candidate generation, OpenAI embeddings for semantic reranking, and an OpenAI model to synthesize the final answer with citations.

These are harness comparisons rather than only model comparisons. The default offline harnesses keep the answerer deterministic and vary the surrounding agent system: tool policy, orchestration loop, context packing, recency handling, and prompt/grounding policy. The OpenAI semantic harness is optional because it adds network dependency and model variance.

### Harness Design Matrix

| Harness | Orchestration / loop | Context management | Tools / execution | Prompt / answer policy |
| --- | --- | --- | --- | --- |
| OpenAI Semantic Hybrid | Two-stage retrieval loop: BM25 candidate generation, embedding rerank, then model synthesis. | Semantic-reranked hybrid context, top 10 results, up to two chunks per meeting, 16k character budget. | Local BM25 candidate generation plus OpenAI embeddings and OpenAI answer synthesis. | Model-backed synthesis prompt constrained to supplied evidence and bracketed meeting-id citations. |

## Results

| Harness | Avg score | LLM judge | Retrieval recall@k | Answer correctness proxy | Citation recall | Citation support | Hallucination rate | Tool success | Avg tokens | Est. run cost | Avg latency |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| OpenAI Semantic Hybrid | 0.774 | n/a | 98% | 41% | 98% | 27% | 0% | 100% | 34281 | $0.0058 | 5005 ms |

Best overall: OpenAI Semantic Hybrid at 0.774.

## Case-Level Scores

| Case | Category | Difficulty | Query | Scores |
| --- | --- | --- | --- | --- |
| deepgram_pricing_capacity_evolution | cross-meeting synthesis | hard | How did Deepgram pricing and capacity discussions evolve from the contract sync to the February concurrency talks? | openai_semantic_hybrid: 0.702 |
| aws_api_gateway_streaming | single-meeting technical retrieval | medium | What did AWS suggest for Granola's Lambda/API Gateway architecture, especially for HTTP streaming? | openai_semantic_hybrid: 0.660 |
| workspace_privacy_design_themes | product feedback synthesis | hard | Across the workspace feedback calls, what were the recurring concerns about privacy, ownership, and personal versus team spaces? | openai_semantic_hybrid: 0.934 |
| ios_feedback_recurring_requests | product feedback synthesis | hard | What themes kept coming up in iOS app feedback, and which requests looked most actionable? | openai_semantic_hybrid: 0.648 |
| oncall_handover_recurring_incidents | operations retrieval | medium | What issues should the next on-call engineer watch based on the March on-call handovers? | openai_semantic_hybrid: 0.752 |
| latest_standup_launch_blockers | temporal retrieval | medium | What were the action items and launch blockers in the latest standup? | openai_semantic_hybrid: 0.798 |
| ramp_enterprise_terms | sales retrieval | easy | What did Granola agree to change for Ramp, and what pricing/compliance terms were discussed? | openai_semantic_hybrid: 0.824 |
| kraken_procurement_readiness | sales retrieval | easy | What procurement and security requirements did Kraken raise before broader Granola rollout? | openai_semantic_hybrid: 0.819 |
| plus_capital_compliance_followup | sales/compliance synthesis | medium | What compliance needs did Plus Capital have, and how did the follow-up change the product ask? | openai_semantic_hybrid: 0.836 |
| salesforce_pricing_insufficient_evidence | ambiguity and grounding | hard | What did Patrick from Salesforce agree to pay for Granola? | openai_semantic_hybrid: 0.770 |

## Discussion

The benchmark is deliberately small, but the cases stress different failure modes. Notes-only retrieval should do well when Granola's generated notes already contain the answer, while transcript search should recover details that were omitted or phrased differently in notes. Compact, balanced, wide-context, and recency-weighted harnesses test whether the surrounding agent loop improves results without changing model weights. Temporal cases test whether a harness recognizes "latest" as an ordering constraint instead of a lexical keyword. Cross-meeting cases test diversification: returning six chunks from one meeting is usually worse than returning one strong chunk from each relevant meeting.

The current default run uses deterministic extractive answering so the benchmark is repeatable without an API key. When `OPENAI_API_KEY` is set, the same harness can run model-backed answering; the deterministic grader remains the same so retrieval and model changes are comparable. Passing `--judge` adds an OpenAI LLM-as-judge pass that scores semantic correctness, citation faithfulness, completeness, and hallucination risk as secondary diagnostics.

Each result row includes a trace with:

- `interpret_query`: query category, difficulty, temporal intent, and expected retrieval shape.
- `retrieve_context`: retrieval strategy, context policy, tool policy, context budget, returned meeting IDs, chunk types, and scores.
- `generate_answer_*`: whether the answer used an LLM or the deterministic extractive fallback, prompt policy, citation IDs, and fallback errors if any.
- `judge_answer_with_model`: optional LLM-as-judge scores and rationale when `--judge` is enabled.

## Observability and Evaluation

The harness records structured traces for every case: query interpretation, retrieval/tool parameters, returned meeting IDs, chunk types, scores, answer generation mode, citation IDs, success/failure flags, and per-step latency. These traces support offline debugging and can be emitted unchanged in an online system.

Offline evaluation is covered by the golden JSON eval set and deterministic grader. It reports answer correctness proxy, citation recall, citation span support, hallucination rate, retrieval recall@k, tool-call success rate, latency, token estimates, and cost estimates. The optional LLM judge adds a semantic check for answer correctness and faithfulness, but it is kept separate from the deterministic score because judge models introduce cost and variance. Human review is supported by the generated review CSV, where reviewers can score helpfulness, grounding, citation quality, hallucination risk, and whether missing/ambiguous evidence was handled correctly.

For online evaluation, the same cases map naturally to A/B experiments: route a cohort to a candidate harness, monitor user feedback, citation click-through, reformulation rate, thumbs up/down, task completion, human-review sampling, latency percentiles, and estimated cost per successful answer.

## Quality Bar

Good answers must be grounded in retrieved meeting evidence, cite source meeting IDs, avoid unsupported specifics, and explicitly say when the corpus does not answer the question. The grader separates retrieval recall@k from final-answer correctness and citation accuracy so retrieval failures and synthesis failures can be debugged independently.

## Cost Efficiency

Each result includes estimated prompt tokens, completion tokens, embedding tokens, context size, latency, and estimated third-party API cost. The estimates are configurable through environment variables, which lets the benchmark model routing and pricing changes without changing code. The `check-regressions` command enforces latency, cost, retrieval-recall, citation-support, and hallucination thresholds before a new run is accepted. Cost controls to extend next are cache hit-rate tracking, model routing by case difficulty, max-context budgets, embedding-cache warmup, and per-query spend caps.

## A/B Experiment Plan

- Control: `notes_bm25`, cheap notes-only retrieval.
- Treatment A: `compact_hybrid_bm25`, tight context compaction and meeting diversification.
- Treatment B: `hybrid_transcript_bm25`, balanced transcript retrieval with no model dependency.
- Treatment C: `wide_context_hybrid_bm25`, higher-recall context packing with latency/token guardrails.
- Treatment D: `recency_weighted_hybrid_bm25`, temporal ranking for latest/current questions.
- Treatment E: `local_vector_database_rag`, local vector database retrieval fused with BM25 over the same notes/transcript corpus.
- Optional Treatment F: `openai_semantic_hybrid`, semantic RAG with embedding rerank and model synthesis.
- Primary metrics: grounded correctness, evidence recall, human-review pass rate.
- Guardrails: p95 latency, estimated cost per successful answer, no-answer correctness, citation precision, user thumbs-down rate.
- Ramp: internal dogfood, then 5% traffic, then 25%, with rollback on latency/cost or hallucination regressions.

## Notable Failures

- openai_semantic_hybrid on deepgram_pricing_capacity_evolution: score 0.702. Missing evidence: none. Weak citation spans: 69496ba5-5315-4b03-b589-df4ee3750ba6, 72454729-0f61-42db-a213-012bb765892b. Missing terms: $218k, $0.13, Nova 3, 5M hours, 17-18,000, TCO. Query: How did Deepgram pricing and capacity discussions evolve from the contract sync to the February concurrency talks?
- openai_semantic_hybrid on aws_api_gateway_streaming: score 0.660. Missing evidence: none. Weak citation spans: 567e57e3-4e8b-4094-a7cd-f54aec239b24. Missing terms: 80 AWS Lambdas, single entry point, HTTP streaming, proxy integration, chunked transfer, 30-minute, 10MB. Query: What did AWS suggest for Granola's Lambda/API Gateway architecture, especially for HTTP streaming?
- openai_semantic_hybrid on ios_feedback_recurring_requests: score 0.648. Missing evidence: 9a690f35-b543-4d68-817b-d8bdb1a06c3f. Weak citation spans: eeaa7f47-c867-40d8-b182-1798327ec43b, d60975a6-5a5d-46a6-80d4-d5c79e438489, 9a690f35-b543-4d68-817b-d8bdb1a06c3f. Missing terms: phone on table, AirPods, real-time transcript, Apple Notes, walk and talk. Query: What themes kept coming up in iOS app feedback, and which requests looked most actionable?

## Extensions

- Expand sampled human review for borderline cases where the deterministic expected-term grader is too brittle.
- Add semantic claim-to-citation judging on top of the current lexical citation-span support proxy.
- Add a judge model with strict evidence IDs as a secondary faithfulness / answer-relevance score, but keep retrieval recall as a non-LLM metric.
- Add multi-turn cases, especially follow-ups that require carrying a resolved entity like "Deepgram" or "the latest standup".
- Add budget alerts and cache hit-rate tracking for cost regressions.
- Add conflict-specific rubrics for cases where newer meetings supersede older decisions.

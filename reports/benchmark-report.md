# Granola Meetings Agent Benchmark Report

Generated: 2026-10-26T16:39:52.684Z

## Abstract

This benchmark evaluates whether a meeting-corpus agent can retrieve the right meetings, select grounded evidence, and produce an answer that covers the expected facts. I built a compact, high-signal set of 10 realistic queries over 898 Granola meetings (873 with raw transcripts), spanning single-meeting lookup, temporal lookup, cross-meeting synthesis, compliance/security asks, product feedback synthesis, and unsupported-specific handling.

The methodology is informed by stepwise tool-use evaluation patterns from ComplexFuncBench / ToolEval-style benchmarks and practical eval/observability tooling such as DeepEval and Evidently: log the trajectory, grade tool/retrieval behavior separately from final semantic grounding, and keep enough structured metadata to debug failures over time. In this implementation every answer records JSON trace steps for query interpretation, retrieval, and generation.

The grader intentionally separates evidence recall, answer coverage, citation behavior, tool-step success, and latency. That makes the result actionable: a low score can point to retrieval/context selection, answer synthesis, citation behavior, trace/tool behavior, or grading/rubric issues.

## Harnesses Tested

- Notes BM25 (`notes_bm25`): Searches only Granola titles, lists, attendees, and generated notes. This is cheap and fast, but misses details only present in raw transcript.
- Hybrid Transcript BM25 (`hybrid_transcript_bm25`): Searches metadata/notes plus overlapping transcript chunks, then packs diversified evidence into the answer context.

## Results

| Harness | Avg score | LLM judge | Retrieval recall@k | Answer correctness proxy | Citation recall | Citation support | Hallucination rate | Tool success | Avg tokens | Est. run cost | Avg latency |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Notes BM25 | 0.798 | n/a | 95% | 49% | 95% | 40% | 0% | 100% | 4437 | $0.0000 | 431 ms |
| Hybrid Transcript BM25 | 0.786 | n/a | 98% | 48% | 90% | 36% | 0% | 100% | 6413 | $0.0000 | 8086 ms |

Best overall: Notes BM25 at 0.798.

## Case-Level Scores

| Case | Category | Difficulty | Query | Scores |
| --- | --- | --- | --- | --- |
| deepgram_pricing_capacity_evolution | cross-meeting synthesis | hard | How did Deepgram pricing and capacity discussions evolve from the contract sync to the February concurrency talks? | notes_bm25: 0.753; hybrid_transcript_bm25: 0.744 |
| aws_api_gateway_streaming | single-meeting technical retrieval | medium | What did AWS suggest for Granola's Lambda/API Gateway architecture, especially for HTTP streaming? | notes_bm25: 0.835; hybrid_transcript_bm25: 0.864 |
| workspace_privacy_design_themes | product feedback synthesis | hard | Across the workspace feedback calls, what were the recurring concerns about privacy, ownership, and personal versus team spaces? | notes_bm25: 0.975; hybrid_transcript_bm25: 0.934 |
| ios_feedback_recurring_requests | product feedback synthesis | hard | What themes kept coming up in iOS app feedback, and which requests looked most actionable? | notes_bm25: 0.661; hybrid_transcript_bm25: 0.732 |
| oncall_handover_recurring_incidents | operations retrieval | medium | What issues should the next on-call engineer watch based on the March on-call handovers? | notes_bm25: 0.755; hybrid_transcript_bm25: 0.726 |
| latest_standup_launch_blockers | temporal retrieval | medium | What were the action items and launch blockers in the latest standup? | notes_bm25: 0.798; hybrid_transcript_bm25: 0.789 |
| ramp_enterprise_terms | sales retrieval | easy | What did Granola agree to change for Ramp, and what pricing/compliance terms were discussed? | notes_bm25: 0.824; hybrid_transcript_bm25: 0.815 |
| kraken_procurement_readiness | sales retrieval | easy | What procurement and security requirements did Kraken raise before broader Granola rollout? | notes_bm25: 0.776; hybrid_transcript_bm25: 0.767 |
| plus_capital_compliance_followup | sales/compliance synthesis | medium | What compliance needs did Plus Capital have, and how did the follow-up change the product ask? | notes_bm25: 0.836; hybrid_transcript_bm25: 0.730 |
| salesforce_pricing_insufficient_evidence | ambiguity and grounding | hard | What did Patrick from Salesforce agree to pay for Granola? | notes_bm25: 0.770; hybrid_transcript_bm25: 0.761 |

## Discussion

The benchmark is deliberately small, but the cases stress different failure modes. Notes-only retrieval should do well when Granola's generated notes already contain the answer, while transcript search should recover details that were omitted or phrased differently in notes. Temporal cases test whether a harness recognizes "latest" as an ordering constraint instead of a lexical keyword. Cross-meeting cases test diversification: returning six chunks from one meeting is usually worse than returning one strong chunk from each relevant meeting.

The current default run uses deterministic extractive answering so the benchmark is repeatable without an API key. When `OPENAI_API_KEY` is set, the same harness can run model-backed answering; the deterministic grader remains the same so retrieval and model changes are comparable. Passing `--judge` adds an OpenAI LLM-as-judge pass that scores semantic correctness, citation faithfulness, completeness, and hallucination risk as secondary diagnostics.

Each result row includes a trace with:

- `interpret_query`: query category, difficulty, temporal intent, and expected retrieval shape.
- `retrieve_context`: retrieval strategy, context budget, returned meeting IDs, chunk types, and scores.
- `generate_answer_*`: whether the answer used an LLM or the deterministic extractive fallback, citation IDs, and fallback errors if any.
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
- Treatment A: `hybrid_transcript_bm25`, higher-recall transcript retrieval with no model dependency.
- Treatment B: `openai_semantic_hybrid`, semantic RAG with embedding rerank and model synthesis.
- Primary metrics: grounded correctness, evidence recall, human-review pass rate.
- Guardrails: p95 latency, estimated cost per successful answer, no-answer correctness, citation precision, user thumbs-down rate.
- Ramp: internal dogfood, then 5% traffic, then 25%, with rollback on latency/cost or hallucination regressions.

## Notable Failures

- notes_bm25 on ios_feedback_recurring_requests: score 0.661. Missing evidence: eeaa7f47-c867-40d8-b182-1798327ec43b, 9a690f35-b543-4d68-817b-d8bdb1a06c3f. Weak citation spans: eeaa7f47-c867-40d8-b182-1798327ec43b, 9a690f35-b543-4d68-817b-d8bdb1a06c3f. Missing terms: Apple Notes, walk and talk. Query: What themes kept coming up in iOS app feedback, and which requests looked most actionable?

## Extensions

- Expand sampled human review for borderline cases where the deterministic expected-term grader is too brittle.
- Add semantic claim-to-citation judging on top of the current lexical citation-span support proxy.
- Add a judge model with strict evidence IDs as a secondary faithfulness / answer-relevance score, but keep retrieval recall as a non-LLM metric.
- Add multi-turn cases, especially follow-ups that require carrying a resolved entity like "Deepgram" or "the latest standup".
- Add budget alerts and cache hit-rate tracking for cost regressions.
- Add conflict-specific rubrics for cases where newer meetings supersede older decisions.

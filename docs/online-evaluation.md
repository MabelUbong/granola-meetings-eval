# Online Evaluation Plan

The offline benchmark is the release gate. Online evaluation measures whether improvements survive real user behavior.

## A/B Tests

Experiment arms:

- Control: `notes_bm25`
- Treatment A: `hybrid_transcript_bm25`
- Treatment B: `openai_semantic_hybrid`

Recommended ramp:

- Internal dogfood
- 5% of eligible traffic
- 25% of eligible traffic
- 50% if guardrails stay green

Primary success metrics:

- Task completion rate
- Positive user feedback rate
- Human-review pass rate on sampled answers
- Citation click-through rate

Guardrail metrics:

- Thumbs-down rate
- Reformulation rate within 2 minutes
- No-answer correctness on ambiguous queries
- p50/p95 latency
- Estimated cost per successful answer
- Citation precision and retrieval recall@k on sampled queries

## Event Schema

Emit one `meeting_agent_answer` event per answer:

```json
{
  "run_id": "uuid",
  "experiment_id": "granola_meetings_agent_v1",
  "variant": "hybrid_transcript_bm25",
  "query_id": "uuid",
  "user_id_hash": "opaque",
  "query_chars": 84,
  "retrieval_strategy": "bm25",
  "answer_strategy": "extractive",
  "model": null,
  "embedding_model": null,
  "retrieved_meeting_ids": ["..."],
  "citation_meeting_ids": ["..."],
  "retrieval_latency_ms": 123,
  "generation_latency_ms": 456,
  "total_latency_ms": 579,
  "prompt_tokens_estimate": 2400,
  "completion_tokens_estimate": 300,
  "embedding_tokens_estimate": 0,
  "estimated_cost_usd": 0.0,
  "cache_hit": true,
  "answer_chars": 1120
}
```

Emit separate interaction events:

- `meeting_agent_citation_clicked`
- `meeting_agent_feedback_submitted`
- `meeting_agent_query_reformulated`
- `meeting_agent_task_completed`
- `meeting_agent_human_reviewed`

## Human Review Sampling

Sample:

- 100% of thumbs-down answers
- 100% of no-answer/ambiguous answers during ramp
- 10% of normal answers
- More from high-cost or high-latency buckets

Review dimensions:

- Answer correctness
- Grounding in cited evidence
- Citation accuracy
- Hallucination yes/no
- Missing relevant evidence
- Helpfulness

## Regression Policy

Block ramp if any condition is true:

- p95 latency regresses more than 25%
- estimated cost per successful answer regresses more than 30%
- thumbs-down rate regresses more than 10%
- human hallucination rate exceeds 2%
- citation click-through drops while reformulation rises
- sampled retrieval recall@k drops below the offline gate

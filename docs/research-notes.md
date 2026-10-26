# Research Notes

This benchmark borrows from a few established patterns for evaluating tool-using agents:

- ComplexFuncBench-style stressors: multi-step retrieval, constrained context selection, and long-context distractors.
- ToolEval / T-Eval / ToolBench-style step evaluation: judge whether the agent chose the right tool or retrieval operation, used sensible arguments, and produced the right final answer.
- DeepEval-style RAG evaluation: separate context relevance, answer correctness, and faithfulness/grounding.
- Evidently-style observability: store structured traces and aggregate error patterns over time.
- Meeting-notes eval design patterns: keep compact prompts, atomic rubric checks, and intentional no-evidence cases where the right behavior is to flag a gap.

Adaptation for this take-home:

- The corpus tool is represented by local retrieval harnesses rather than a production MCP connector.
- The strongest harness is an OpenAI semantic RAG arm: lexical candidate generation, embedding reranking, context packing, and model-backed answer synthesis.
- Every answer stores JSON trace steps for query interpretation, retrieval, and generation.
- The deterministic grader scores evidence recall, expected-term coverage, citation recall, tool-step success, step completeness, and latency.
- An optional OpenAI LLM-as-judge pass scores semantic correctness, citation faithfulness, completeness, and hallucination risk while staying separate from the deterministic score for repeatability.
- Cases include exact lookup, latest/temporal lookup, cross-meeting synthesis, account-summary retrieval, product-feedback synthesis, and insufficient-evidence behavior.
- The default answerer is extractive for repeatability. An OpenAI-backed answerer can be enabled with `--llm`, and an OpenAI-backed judge can be enabled with `--judge`, without changing the eval set.

Optimization pass:

- Added named-entity retrieval boosts so account-specific questions prioritize the named company/person over generic topical matches.
- Penalized meeting footer/contact/link lines during passage selection because they often contain the account name but not the answer.
- Added citation span support as a separate deterministic score from meeting-level citation recall.
- Tightened unsupported-price handling so "Patrick from Salesforce" is disambiguated from other Patricks and generic Salesforce integration meetings before deciding whether pricing evidence exists.

## External Audit

The external audit used arXiv/GitHub search results for RAG and agent evaluation work plus widely adopted framework patterns.

Relevant public directions:

- Ragas (`arXiv:2309.15217`) and RAG evaluation tools such as DeepEval and TruLens converge on separating retrieval/context quality, answer correctness or relevance, faithfulness/grounding, and citation behavior. The benchmark mirrors that split with retrieval recall@k, answer expected-term coverage, grounded citation precision, citation recall, and hallucination risk.
- Citation-focused work such as ALCE-style attributed generation and later citation-grounding papers reinforces that source links are not enough; the cited evidence must support the claim. This harness includes a lexical citation-span support proxy; semantic claim-to-citation validation is a future extension.
- Agent/process benchmarks such as ToolEval-style and AgentProcessBench-style work emphasize step-level diagnosis for tool-using systems. This harness records query interpretation, retrieval/tool parameters, generation mode, success flags, latency, token estimates, and costs for each case.
- Recent hybrid retrieval and RAG-search work continues to use lexical retrieval as a strong baseline while comparing dense or semantic reranking, corrective retrieval, and larger context budgets. The `openai_semantic_hybrid` arm follows that pattern: BM25 candidate generation, OpenAI embedding rerank, and model-backed synthesis with citations.

Conclusion: the implementation is well-shaped for the take-home benchmark and intentionally more diagnostic than a single end-to-end judge score. It is not theoretically optimal. The highest-value extensions are multi-turn cases, conflict/newer-evidence rubrics, calibrated judge prompts over a larger human-labeled sample, and running the OpenAI semantic arm from an unrestricted network.

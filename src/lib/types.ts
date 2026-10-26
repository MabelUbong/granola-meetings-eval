export type Meeting = {
  id: string;
  title: string;
  createdAt: string;
  listTitles: string[];
  people: string[];
  notes: string;
  transcript: string;
};

export type CorpusSource = 'notes' | 'hybrid';

export type HarnessConfig = {
  id: string;
  label: string;
  description: string;
  systemPrompt: string;
  toolDefinitions: string[];
  promptPolicy: string;
  orchestrationPolicy: string;
  contextPolicy: string;
  memoryPolicy: string;
  sandboxPolicy: string;
  approvalPolicy: string;
  toolPolicy: string;
  loggingPolicy: string;
  source: CorpusSource;
  retrievalStrategy: 'bm25' | 'local_vector_database' | 'openai_embeddings';
  answerStrategy: 'extractive' | 'openai';
  embeddingModel?: string;
  candidatePool?: number;
  topK: number;
  maxDocsPerMeeting: number;
  transcriptChunkWords: number;
  transcriptChunkOverlap: number;
  contextCharBudget: number;
  recencyBoost: number;
};

export type CorpusDoc = {
  docId: string;
  meetingId: string;
  title: string;
  createdAt: string;
  listTitles: string[];
  kind: 'notes' | 'transcript';
  chunkIndex: number;
  text: string;
};

export type RetrievedContext = CorpusDoc & {
  score: number;
  snippet: string;
};

export type EvidenceRequirement = {
  meetingId: string;
  title: string;
  snippet: string;
};

export type EvalCase = {
  id: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  query: string;
  expectedBehavior: string;
  requiredEvidence: EvidenceRequirement[];
  expectedTerms: string[];
  rationale: string;
};

export type Citation = {
  meetingId: string;
  title: string;
  createdAt: string;
  snippet: string;
};

export type TraceStep = {
  stepId: string;
  name: string;
  kind: 'interpretation' | 'retrieval' | 'generation' | 'grading';
  timestamp: string;
  latencyMs: number;
  success: boolean;
  tool?: string;
  model?: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  error?: string;
};

export type AgentAnswer = {
  caseId: string;
  configId: string;
  query: string;
  answer: string;
  citations: Citation[];
  contexts: RetrievedContext[];
  steps: TraceStep[];
  metrics: {
    retrievalLatencyMs: number;
    generationLatencyMs: number;
    contextChars: number;
    promptTokensEstimate: number;
    completionTokensEstimate: number;
    embeddingTokensEstimate: number;
    totalTokensEstimate: number;
    estimatedCostUsd: number;
  };
  latencyMs: number;
  usedLlm: boolean;
  model?: string;
};

export type LlmJudgeResult = {
  model: string;
  score: number;
  answerCorrectness: number;
  citationFaithfulness: number;
  completeness: number;
  hallucinationRisk: number;
  rationale: string;
  missingEvidence: string[];
  unsupportedClaims: string[];
  latencyMs: number;
  promptTokensEstimate: number;
  completionTokensEstimate: number;
  estimatedCostUsd: number;
  error?: string;
};

export type CaseGrade = {
  caseId: string;
  configId: string;
  score: number;
  evidenceRecall: number;
  retrievalRecallAtK: number;
  citationRecall: number;
  citationSupport: number;
  expectedTermCoverage: number;
  groundedCitationPrecision: number;
  hallucinationRisk: number;
  toolSuccess: number;
  stepCompleteness: number;
  latencyScore: number;
  missingEvidenceIds: string[];
  poorCitationSpanIds: string[];
  missingTerms: string[];
  llmJudge?: LlmJudgeResult;
};

export type ConfigSummary = {
  configId: string;
  label: string;
  averageScore: number;
  evidenceRecall: number;
  retrievalRecallAtK: number;
  citationRecall: number;
  citationSupport: number;
  expectedTermCoverage: number;
  hallucinationRate: number;
  toolSuccess: number;
  stepCompleteness: number;
  avgTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
  llmJudgeScore?: number;
  llmJudgeFaithfulness?: number;
};

export type BenchmarkRun = {
  publicView?: {
    redacted: boolean;
    note: string;
    sourceReport: string;
  };
  generatedAt: string;
  dataset: {
    meetingCount: number;
    transcriptCount: number;
    dateRange: {
      min: string;
      max: string;
    };
  };
  configs: HarnessConfig[];
  cases: EvalCase[];
  answers: AgentAnswer[];
  grades: CaseGrade[];
  summaries: ConfigSummary[];
};

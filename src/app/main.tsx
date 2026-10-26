import React, {useEffect, useMemo, useState} from 'react';
import {createRoot} from 'react-dom/client';
import type {BenchmarkRun, CaseGrade, ConfigSummary, EvalCase} from '../lib/types';
import './style.css';

type CaseStatus = 'strong' | 'watch' | 'gap';

type CaseRollup = {
  testCase: EvalCase;
  avgScore: number;
  minScore: number;
  maxScore: number;
  missingEvidence: number;
  missingTerms: number;
  judgeScore?: number;
  status: CaseStatus;
};

type TradeoffYMetricKey =
  | 'averageScore'
  | 'evidenceRecall'
  | 'citationSupport'
  | 'expectedTermCoverage';
type TradeoffXMetricKey = 'latencyMs' | 'avgTokens';
type HeatmapMetricKey =
  | 'score'
  | 'retrievalRecallAtK'
  | 'expectedTermCoverage'
  | 'citationSupport'
  | 'hallucinationRisk';

type SummaryMetricOption<T extends string> = {
  key: T;
  label: string;
  value: (summary: ConfigSummary) => number;
  display: (value: number) => string;
};

type GradeMetricOption = {
  key: HeatmapMetricKey;
  label: string;
  value: (grade: CaseGrade) => number;
  display: (value: number) => string;
  invert?: boolean;
};

const TRADEOFF_Y_METRICS: SummaryMetricOption<TradeoffYMetricKey>[] = [
  {
    key: 'averageScore',
    label: 'Score',
    value: summary => summary.averageScore,
    display: formatScore,
  },
  {
    key: 'evidenceRecall',
    label: 'Evidence',
    value: summary => summary.evidenceRecall,
    display: formatPct,
  },
  {
    key: 'citationSupport',
    label: 'Citation Span',
    value: summary => summary.citationSupport,
    display: formatPct,
  },
  {
    key: 'expectedTermCoverage',
    label: 'Terms',
    value: summary => summary.expectedTermCoverage,
    display: formatPct,
  },
];

const TRADEOFF_X_METRICS: SummaryMetricOption<TradeoffXMetricKey>[] = [
  {
    key: 'latencyMs',
    label: 'Latency',
    value: summary => summary.latencyMs,
    display: formatLatency,
  },
  {
    key: 'avgTokens',
    label: 'Tokens',
    value: summary => summary.avgTokens,
    display: value => formatNumber(Math.round(value)),
  },
];

const HEATMAP_METRICS: GradeMetricOption[] = [
  {
    key: 'score',
    label: 'Score',
    value: grade => grade.score,
    display: formatScore,
  },
  {
    key: 'retrievalRecallAtK',
    label: 'Recall',
    value: grade => grade.retrievalRecallAtK,
    display: formatPct,
  },
  {
    key: 'expectedTermCoverage',
    label: 'Terms',
    value: grade => grade.expectedTermCoverage,
    display: formatPct,
  },
  {
    key: 'citationSupport',
    label: 'Citations',
    value: grade => grade.citationSupport,
    display: formatPct,
  },
  {
    key: 'hallucinationRisk',
    label: 'Hallucination',
    value: grade => grade.hallucinationRisk,
    display: formatPct,
    invert: true,
  },
];

function formatPct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatScore(value: number): string {
  return value.toFixed(3);
}

function formatDelta(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(3)}`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined).format(value);
}

function formatCurrency(value: number): string {
  if (value === 0) {
    return '$0';
  }
  if (value < 0.01) {
    return `$${value.toFixed(5)}`;
  }
  return `$${value.toFixed(2)}`;
}

function formatLatency(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${Math.round(ms)}ms`;
}

function formatShortLatency(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${Math.round(ms)}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function metricTone(value: number, high = 0.85, low = 0.65): 'good' | 'warn' | 'bad' {
  if (value >= high) {
    return 'good';
  }
  if (value >= low) {
    return 'warn';
  }
  return 'bad';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function shortLabel(label: string): string {
  const words = label.split(/\s+/g).filter(Boolean);
  if (words.length === 1) {
    return words[0].slice(0, 3).toUpperCase();
  }
  return words
    .slice(0, 3)
    .map(word => word[0])
    .join('')
    .toUpperCase();
}

function heatColor(score: number): string {
  if (score >= 0.82) {
    return '#0f766e';
  }
  if (score >= 0.76) {
    return '#4c8f6a';
  }
  if (score >= 0.7) {
    return '#d69b2d';
  }
  return '#c84d46';
}

function caseStatus(avgScore: number, missingEvidence: number): CaseStatus {
  if (avgScore >= 0.82 && missingEvidence === 0) {
    return 'strong';
  }
  if (avgScore >= 0.7) {
    return 'watch';
  }
  return 'gap';
}

function getGradesForCase(run: BenchmarkRun, caseId: string): CaseGrade[] {
  return run.grades.filter(grade => grade.caseId === caseId);
}

function getGrade(run: BenchmarkRun, caseId: string, configId: string): CaseGrade | undefined {
  return run.grades.find(grade => grade.caseId === caseId && grade.configId === configId);
}

function summarizeCases(run: BenchmarkRun): CaseRollup[] {
  return run.cases.map(testCase => {
    const grades = getGradesForCase(run, testCase.id);
    const scores = grades.map(grade => grade.score);
    const avgScore = scores.reduce((sum, score) => sum + score, 0) / Math.max(scores.length, 1);
    const judgeScores = grades
      .map(grade => grade.llmJudge?.score)
      .filter((score): score is number => score !== undefined);
    const judgeScore =
      judgeScores.length > 0
        ? judgeScores.reduce((sum, score) => sum + score, 0) / judgeScores.length
        : undefined;
    const missingEvidence = grades.reduce(
      (sum, grade) => sum + grade.missingEvidenceIds.length,
      0,
    );
    const missingTerms = grades.reduce((sum, grade) => sum + grade.missingTerms.length, 0);

    return {
      testCase,
      avgScore,
      minScore: scores.length ? Math.min(...scores) : 0,
      maxScore: scores.length ? Math.max(...scores) : 0,
      missingEvidence,
      missingTerms,
      judgeScore,
      status: caseStatus(avgScore, missingEvidence),
    };
  });
}

function scoreBarStyle(value: number): React.CSSProperties {
  return {width: `${Math.max(4, Math.min(100, value * 100))}%`};
}

function App() {
  const [run, setRun] = useState<BenchmarkRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/results/latest-results.json')
      .then(response => {
        if (!response.ok) {
          throw new Error(`Missing results file (${response.status})`);
        }
        return response.json() as Promise<BenchmarkRun>;
      })
      .then(data => {
        setRun(data);
        setSelectedCaseId(data.cases[0]?.id || null);
        const topSummary = [...data.summaries].sort(
          (left, right) => right.averageScore - left.averageScore,
        )[0];
        setSelectedConfigId(topSummary?.configId || null);
      })
      .catch(fetchError => {
        setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
      });
  }, []);

  const selectedCase = run?.cases.find(testCase => testCase.id === selectedCaseId) || run?.cases[0];

  const derived = useMemo(() => {
    if (!run) {
      return null;
    }

    const rankedSummaries = [...run.summaries].sort(
      (left, right) => right.averageScore - left.averageScore,
    );
    const caseRollups = summarizeCases(run);
    const hardestCases = [...caseRollups].sort((left, right) => left.avgScore - right.avgScore);
    const judgeModels = Array.from(
      new Set(
        run.grades
          .map(grade => grade.llmJudge?.model)
          .filter((model): model is string => Boolean(model)),
      ),
    );
    const judgeFailures = run.grades.filter(grade => grade.llmJudge?.error).length;
    const evidenceLeader = rankedSummaries.reduce<ConfigSummary | undefined>(
      (best, summary) =>
        !best || summary.evidenceRecall > best.evidenceRecall ? summary : best,
      undefined,
    );
    const avgLatency =
      run.summaries.reduce((sum, summary) => sum + summary.latencyMs, 0) /
      Math.max(run.summaries.length, 1);
    const answerCost = run.summaries.reduce(
      (sum, summary) => sum + summary.estimatedCostUsd,
      0,
    );
    const judgeCost = run.grades.reduce(
      (sum, grade) => sum + (grade.llmJudge?.estimatedCostUsd || 0),
      0,
    );

    return {
      rankedSummaries,
      caseRollups,
      hardestCases,
      judgeModels,
      judgeFailures,
      evidenceLeader,
      avgLatency,
      totalCost: answerCost + judgeCost,
    };
  }, [run]);

  if (error) {
    return (
      <main className="shell empty-shell">
        <section className="empty">
          <p className="eyebrow">Dashboard offline</p>
          <h1>Granola Meetings Eval</h1>
          <p>Run results are not available yet.</p>
          <div className="result-help">
            <p>To populate this dashboard, place the private data files under <code>data/raw</code> and run:</p>
            <code>npm run prepare-data</code>
            <p>The written report is tracked at <code>reports/benchmark-report.md</code>.</p>
          </div>
          <p className="muted">{error}</p>
        </section>
      </main>
    );
  }

  if (!run || !selectedCase || !derived) {
    return (
      <main className="shell empty-shell">
        <section className="empty">
          <p className="eyebrow">Loading</p>
          <h1>Granola Meetings Eval</h1>
          <p>Loading benchmark results...</p>
        </section>
      </main>
    );
  }

  const winner = derived.rankedSummaries[0];
  const runnerUp = derived.rankedSummaries[1];
  const scoreMargin = winner && runnerUp ? winner.averageScore - runnerUp.averageScore : 0;
  const winnerNote =
    runnerUp && Math.abs(scoreMargin) < 0.005
      ? 'Effectively tied with the runner-up'
      : runnerUp
        ? `${formatDelta(scoreMargin)} over ${runnerUp.label}`
        : 'Only evaluated config';
  const selectedGrades = getGradesForCase(run, selectedCase.id);
  const bestSelectedScore = selectedGrades.length
    ? Math.max(...selectedGrades.map(grade => grade.score))
    : 0;
  const selectedRollup =
    derived.caseRollups.find(rollup => rollup.testCase.id === selectedCase.id) ||
    derived.caseRollups[0];

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand-block">
          <p className="eyebrow">Benchmark dashboard</p>
          <h1>Granola Meetings Eval</h1>
          <p>
            {formatNumber(run.cases.length)} cases across {formatNumber(run.dataset.meetingCount)} meetings
            and {formatNumber(run.dataset.transcriptCount)} transcripts.
          </p>
        </div>
        <div className="run-meta" aria-label="Run metadata">
          <span>Generated {formatDateTime(run.generatedAt)}</span>
          <span>
            {formatDate(run.dataset.dateRange.min)} - {formatDate(run.dataset.dateRange.max)}
          </span>
          <a href="/results/latest-results.json" className="download">
            Results JSON
          </a>
        </div>
      </header>

      <section className="overview-grid" aria-label="Run overview">
        <article className="kpi kpi-leader">
          <span className="kpi-label">Current leader</span>
          <strong>{winner?.label || 'No configs'}</strong>
          <p>{winner ? `${formatScore(winner.averageScore)} score. ${winnerNote}.` : 'No summary available.'}</p>
        </article>
        <article className="kpi">
          <span className="kpi-label">Evidence recall</span>
          <strong>
            {derived.evidenceLeader ? formatPct(derived.evidenceLeader.evidenceRecall) : '--'}
          </strong>
          <p>
            {derived.evidenceLeader
              ? `${derived.evidenceLeader.label} leads required evidence`
              : 'Awaiting results'}
          </p>
        </article>
        <article className="kpi">
          <span className="kpi-label">Judge coverage</span>
          <strong>{derived.judgeModels.length ? derived.judgeModels.join(', ') : 'Local only'}</strong>
          <p>
            {derived.judgeFailures === 0
              ? 'All judge calls completed'
              : `${derived.judgeFailures} judge calls failed`}
          </p>
        </article>
        <article className="kpi">
          <span className="kpi-label">Runtime profile</span>
          <strong>{formatLatency(derived.avgLatency)}</strong>
          <p>{formatCurrency(derived.totalCost)} estimated run cost</p>
        </article>
      </section>

      <section className="insights-grid" aria-label="Benchmark visual metrics">
        <TradeoffChart
          summaries={derived.rankedSummaries}
          selectedConfigId={selectedConfigId}
          onSelectConfig={setSelectedConfigId}
        />
        <MetricBars
          summaries={derived.rankedSummaries}
          selectedConfigId={selectedConfigId}
          onSelectConfig={setSelectedConfigId}
        />
        <CaseHeatmap
          run={run}
          caseRollups={derived.caseRollups}
          selectedCaseId={selectedCase.id}
          selectedConfigId={selectedConfigId}
          onSelectCase={setSelectedCaseId}
          onSelectConfig={setSelectedConfigId}
        />
      </section>

      <section className="leaderboard" aria-label="Config comparison">
        <div className="section-head">
          <div>
            <p className="eyebrow">Config comparison</p>
            <h2>Retrieval quality, grounding, and operating cost</h2>
          </div>
          <div className="risk-strip" aria-label="Lowest scoring cases">
            {derived.hardestCases.slice(0, 3).map(rollup => (
              <button
                type="button"
                key={rollup.testCase.id}
                className="risk-pill"
                onClick={() => setSelectedCaseId(rollup.testCase.id)}>
                <span>{rollup.testCase.id.replace(/_/g, ' ')}</span>
                <strong>{formatScore(rollup.avgScore)}</strong>
              </button>
            ))}
          </div>
        </div>

        <div className="comparison-table">
          <div className="comparison-row comparison-head">
            <span>Config</span>
            <span>Score</span>
            <span>Evidence</span>
            <span>Citation Span</span>
            <span>Judge</span>
            <span>Latency</span>
            <span>Tokens</span>
            <span>Cost</span>
          </div>
          {derived.rankedSummaries.map((summary, index) => (
            <ConfigRow
              key={summary.configId}
              rank={index + 1}
              summary={summary}
              selected={summary.configId === selectedConfigId}
              onSelect={setSelectedConfigId}
            />
          ))}
        </div>
      </section>

      <section className="workspace">
        <aside className="case-list" aria-label="Eval cases">
          <div className="case-list-head">
            <span>Eval cases</span>
            <span>Avg score</span>
          </div>
          {derived.caseRollups.map(rollup => (
            <button
              type="button"
              className={
                rollup.testCase.id === selectedCase.id ? 'case-button active' : 'case-button'
              }
              key={rollup.testCase.id}
              aria-pressed={rollup.testCase.id === selectedCase.id}
              onClick={() => setSelectedCaseId(rollup.testCase.id)}>
              <span className="case-button-top">
                <span className={`status-dot ${rollup.status}`} aria-hidden="true" />
                <span>
                  {rollup.testCase.category} / {rollup.testCase.difficulty}
                </span>
              </span>
              <span className="case-button-title">{rollup.testCase.query}</span>
              <span className="case-button-bottom">
                <span>
                  {rollup.missingEvidence
                    ? `${rollup.missingEvidence} evidence gaps`
                    : 'Evidence covered'}
                </span>
                <strong>{formatScore(rollup.avgScore)}</strong>
              </span>
            </button>
          ))}
        </aside>

        <section className="case-detail">
          <div className="case-heading">
            <div>
              <p className="eyebrow">
                {selectedCase.category} / {selectedCase.difficulty}
              </p>
              <h2>{selectedCase.query}</h2>
              <p>{selectedCase.expectedBehavior}</p>
            </div>
            <div className={`case-health ${selectedRollup.status}`}>
              <span>Case average</span>
              <strong>{formatScore(selectedRollup.avgScore)}</strong>
              <small>
                {selectedRollup.missingEvidence
                  ? `${selectedRollup.missingEvidence} evidence gaps`
                  : 'Required evidence covered'}
              </small>
            </div>
          </div>

          <div className="evidence-panel">
            <div className="panel-heading">
              <h3>Required evidence</h3>
              <span>{selectedCase.requiredEvidence.length} meetings</span>
            </div>
            <div className="evidence-grid">
              {selectedCase.requiredEvidence.map(evidence => (
                <article className="evidence-item" key={evidence.meetingId}>
                  <strong>{evidence.title}</strong>
                  <p>{evidence.snippet}</p>
                  <code>{evidence.meetingId}</code>
                </article>
              ))}
            </div>
          </div>

          <div className="answers-headline">
            <div>
              <p className="eyebrow">Generated answers</p>
              <h2>Side-by-side output and grading trace</h2>
            </div>
            <div className="case-score-range">
              <span>Range</span>
              <strong>
                {formatScore(selectedRollup.minScore)} - {formatScore(selectedRollup.maxScore)}
              </strong>
            </div>
          </div>

          <div className="answers">
            {run.configs.map(config => {
              const answer = run.answers.find(
                item => item.caseId === selectedCase.id && item.configId === config.id,
              );
              const grade = getGrade(run, selectedCase.id, config.id);
              if (!answer || !grade) {
                return null;
              }

              const isBest = grade.score === bestSelectedScore;
              const isSelectedConfig = selectedConfigId === config.id;

              return (
                <article
                  className={[
                    'answer-panel',
                    isBest ? 'best' : '',
                    isSelectedConfig ? 'selected-config' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  key={config.id}>
                  <div className="answer-head">
                    <div>
                      <div className="answer-title-row">
                        <h3>{config.label}</h3>
                        {isBest ? <span className="winner-badge">Best on case</span> : null}
                      </div>
                      <p>{config.description}</p>
                      <div className="policy-list" aria-label={`${config.label} harness policies`}>
                        <span>{config.orchestrationPolicy}</span>
                        <span>{config.contextPolicy}</span>
                        <span>{config.toolPolicy}</span>
                      </div>
                    </div>
                    <div className="answer-score">
                      <span>Score</span>
                      <strong>{formatScore(grade.score)}</strong>
                    </div>
                  </div>

                  <div className="metric-grid" aria-label={`${config.label} metrics`}>
                    <MetricPill label="Recall@k" value={grade.retrievalRecallAtK} />
                    <MetricPill label="Terms" value={grade.expectedTermCoverage} />
                    <MetricPill label="Citation span" value={grade.citationSupport} />
                    <MetricPill label="Hallucination" value={grade.hallucinationRisk} invert />
                    <MetricPill label="Tool" value={grade.toolSuccess} />
                    {grade.llmJudge ? (
                      <MetricPill label="Judge" value={grade.llmJudge.score} />
                    ) : null}
                    <div className="metric-pill neutral">
                      <span>Tokens</span>
                      <strong>{formatNumber(answer.metrics.totalTokensEstimate)}</strong>
                    </div>
                    <div className="metric-pill neutral">
                      <span>Cost</span>
                      <strong>{formatCurrency(answer.metrics.estimatedCostUsd)}</strong>
                    </div>
                  </div>

                  <pre>{answer.answer}</pre>

                  <div className="diagnostics">
                    <DiagnosticLine
                      label="Missing evidence"
                      values={grade.missingEvidenceIds}
                      empty="none"
                    />
                    <DiagnosticLine
                      label="Weak citation spans"
                      values={grade.poorCitationSpanIds}
                      empty="none"
                    />
                    <DiagnosticLine label="Missing terms" values={grade.missingTerms} empty="none" />
                    {grade.llmJudge ? (
                      <p>
                        <strong>LLM judge:</strong>{' '}
                        {grade.llmJudge.error
                          ? `failed: ${grade.llmJudge.error}`
                          : grade.llmJudge.rationale || 'no rationale'}
                      </p>
                    ) : null}
                  </div>

                  <div className="answer-accordions">
                    <details>
                      <summary>Retrieved evidence ({answer.contexts.length})</summary>
                      <ol>
                        {answer.contexts.map(context => (
                          <li key={context.docId}>
                            <strong>
                              {context.title} ({context.kind}, {context.score.toFixed(2)})
                            </strong>
                            <span>{context.snippet}</span>
                            <code>{context.meetingId}</code>
                          </li>
                        ))}
                      </ol>
                    </details>
                    <details>
                      <summary>Trace steps ({answer.steps.length})</summary>
                      <ol>
                        {answer.steps.map(step => (
                          <li key={step.stepId}>
                            <strong>
                              {step.name} ({step.kind}, {formatLatency(step.latencyMs)})
                            </strong>
                            <span>
                              {step.success ? 'success' : 'failed'}
                              {step.tool ? ` / ${step.tool}` : ''}
                              {step.model ? ` / ${step.model}` : ''}
                            </span>
                            <code>{JSON.stringify(step.output)}</code>
                          </li>
                        ))}
                      </ol>
                    </details>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </section>
    </main>
  );
}

function ConfigRow({
  rank,
  summary,
  selected,
  onSelect,
}: {
  rank: number;
  summary: ConfigSummary;
  selected: boolean;
  onSelect: (configId: string) => void;
}) {
  return (
    <button
      type="button"
      className={selected ? 'comparison-row selected' : 'comparison-row'}
      onClick={() => onSelect(summary.configId)}>
      <span className="config-name">
        <span className="rank">#{rank}</span>
        <strong>{summary.label}</strong>
      </span>
      <span className="score-cell">
        <strong>{formatScore(summary.averageScore)}</strong>
        <span className="score-track" aria-hidden="true">
          <span style={scoreBarStyle(summary.averageScore)} />
        </span>
      </span>
      <span>{formatPct(summary.evidenceRecall)}</span>
      <span className={metricTone(summary.citationSupport)}>{formatPct(summary.citationSupport)}</span>
      <span>
        {summary.llmJudgeScore !== undefined ? formatScore(summary.llmJudgeScore) : 'n/a'}
      </span>
      <span>{formatLatency(summary.latencyMs)}</span>
      <span>{formatNumber(Math.round(summary.avgTokens))}</span>
      <span>{formatCurrency(summary.estimatedCostUsd)}</span>
    </button>
  );
}

function TradeoffChart({
  summaries,
  selectedConfigId,
  onSelectConfig,
}: {
  summaries: ConfigSummary[];
  selectedConfigId: string | null;
  onSelectConfig: (configId: string) => void;
}) {
  const [yMetricKey, setYMetricKey] = useState<TradeoffYMetricKey>('averageScore');
  const [xMetricKey, setXMetricKey] = useState<TradeoffXMetricKey>('latencyMs');
  const yMetric =
    TRADEOFF_Y_METRICS.find(metric => metric.key === yMetricKey) || TRADEOFF_Y_METRICS[0];
  const xMetric =
    TRADEOFF_X_METRICS.find(metric => metric.key === xMetricKey) || TRADEOFF_X_METRICS[0];
  const width = 680;
  const height = 300;
  const padLeft = 50;
  const padRight = 22;
  const padTop = 24;
  const padBottom = 42;
  const xValues = summaries.map(xMetric.value);
  const yValues = summaries.map(yMetric.value);
  const maxX = Math.max(...xValues, 1);
  const minY = Math.min(...yValues, 0);
  const maxY = Math.max(...yValues, 1);
  const yFloor = clamp(Math.floor((minY - 0.02) * 20) / 20, 0, 1);
  const yCeil = clamp(Math.ceil((maxY + 0.02) * 20) / 20, yFloor + 0.05, 1);
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  const points = summaries.map((summary, index) => {
    const x = padLeft + (xMetric.value(summary) / maxX) * plotWidth;
    const normalizedY = (yMetric.value(summary) - yFloor) / Math.max(yCeil - yFloor, 0.01);
    const y = padTop + (1 - normalizedY) * plotHeight;
    return {summary, index, x, y};
  });

  return (
    <article className="chart-card tradeoff-card">
      <div className="chart-head">
        <div>
          <p className="eyebrow">Tradeoff map</p>
          <h2>{yMetric.label} vs {xMetric.label.toLowerCase()}</h2>
        </div>
        <div className="chart-controls">
          <SegmentedControl
            label="Y metric"
            options={TRADEOFF_Y_METRICS}
            selectedKey={yMetricKey}
            onSelect={setYMetricKey}
          />
          <SegmentedControl
            label="X metric"
            options={TRADEOFF_X_METRICS}
            selectedKey={xMetricKey}
            onSelect={setXMetricKey}
          />
        </div>
      </div>
      <svg className="tradeoff-chart" viewBox={`0 0 ${width} ${height}`} role="img">
        <line x1={padLeft} y1={padTop} x2={padLeft} y2={height - padBottom} className="chart-axis" />
        <line
          x1={padLeft}
          y1={height - padBottom}
          x2={width - padRight}
          y2={height - padBottom}
          className="chart-axis"
        />
        {[0, 0.5, 1].map(tick => {
          const y = padTop + (1 - tick) * plotHeight;
          const value = yFloor + tick * (yCeil - yFloor);
          return (
            <g key={tick}>
              <line x1={padLeft} y1={y} x2={width - padRight} y2={y} className="chart-grid" />
              <text x={padLeft - 10} y={y + 4} textAnchor="end" className="chart-label">
                {yMetric.display(value)}
              </text>
            </g>
          );
        })}
        {[0, 0.5, 1].map(tick => {
          const x = padLeft + tick * plotWidth;
          return (
            <g key={tick}>
              <line x1={x} y1={padTop} x2={x} y2={height - padBottom} className="chart-grid" />
              <text x={x} y={height - 15} textAnchor="middle" className="chart-label">
                {xMetricKey === 'latencyMs'
                  ? formatShortLatency(maxX * tick)
                  : xMetric.display(maxX * tick)}
              </text>
            </g>
          );
        })}
        <text x={padLeft} y={height - 3} className="chart-label">
          {xMetric.label.toLowerCase()}
        </text>
        <text x={5} y={padTop + 8} className="chart-label">
          {yMetric.label.toLowerCase()}
        </text>
        {points.map(point => (
          <g
            key={point.summary.configId}
            className={point.summary.configId === selectedConfigId ? 'chart-point active' : 'chart-point'}
            role="button"
            tabIndex={0}
            onClick={() => onSelectConfig(point.summary.configId)}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                onSelectConfig(point.summary.configId);
              }
            }}>
            <circle
              cx={point.x}
              cy={point.y}
              r={9}
              className={`chart-dot dot-${point.index % 5}`}
            />
            <text
              x={clamp(point.x + 13, padLeft + 12, width - 95)}
              y={clamp(point.y + 4, padTop + 12, height - padBottom - 6)}
              className="chart-point-label">
              {shortLabel(point.summary.label)}
            </text>
          </g>
        ))}
      </svg>
      <div className="chart-legend">
        {points.map(point => (
          <button
            type="button"
            className={point.summary.configId === selectedConfigId ? 'active' : ''}
            key={point.summary.configId}
            onClick={() => onSelectConfig(point.summary.configId)}>
            <i className={`legend-dot dot-${point.index % 5}`} />
            {shortLabel(point.summary.label)} {yMetric.display(yMetric.value(point.summary))} /{' '}
            {xMetric.display(xMetric.value(point.summary))}
          </button>
        ))}
      </div>
    </article>
  );
}

function MetricBars({
  summaries,
  selectedConfigId,
  onSelectConfig,
}: {
  summaries: ConfigSummary[];
  selectedConfigId: string | null;
  onSelectConfig: (configId: string) => void;
}) {
  const maxTokens = Math.max(...summaries.map(summary => summary.avgTokens), 1);
  const metrics = [
    {
      label: 'Avg score',
      value: (summary: ConfigSummary) => summary.averageScore,
      display: (value: number) => formatScore(value),
    },
    {
      label: 'Evidence',
      value: (summary: ConfigSummary) => summary.evidenceRecall,
      display: (value: number) => formatPct(value),
    },
    {
      label: 'Citation span',
      value: (summary: ConfigSummary) => summary.citationSupport,
      display: (value: number) => formatPct(value),
    },
    {
      label: 'Token economy',
      value: (summary: ConfigSummary) => 1 - summary.avgTokens / maxTokens,
      display: (value: number) => formatPct(value),
    },
  ];

  return (
    <article className="chart-card bars-card">
      <div className="chart-head">
        <div>
          <p className="eyebrow">Harness profile</p>
          <h2>Quality and efficiency bars</h2>
        </div>
      </div>
      <div className="bar-groups">
        {summaries.map((summary, index) => (
          <button
            type="button"
            className={summary.configId === selectedConfigId ? 'bar-group active' : 'bar-group'}
            key={summary.configId}
            onClick={() => onSelectConfig(summary.configId)}>
            <div className="bar-title">
              <strong>{summary.label}</strong>
              <span>{formatNumber(Math.round(summary.avgTokens))} tokens</span>
            </div>
            {metrics.map(metric => {
              const value = clamp(metric.value(summary), 0, 1);
              return (
                <div className="bar-row" key={metric.label}>
                  <span>{metric.label}</span>
                  <div className="bar-track">
                    <i className={`bar-fill dot-${index % 5}`} style={scoreBarStyle(value)} />
                  </div>
                  <strong>{metric.display(value)}</strong>
                </div>
              );
            })}
          </button>
        ))}
      </div>
    </article>
  );
}

function CaseHeatmap({
  run,
  caseRollups,
  selectedCaseId,
  selectedConfigId,
  onSelectCase,
  onSelectConfig,
}: {
  run: BenchmarkRun;
  caseRollups: CaseRollup[];
  selectedCaseId: string;
  selectedConfigId: string | null;
  onSelectCase: (caseId: string) => void;
  onSelectConfig: (configId: string) => void;
}) {
  const [metricKey, setMetricKey] = useState<HeatmapMetricKey>('score');
  const metric = HEATMAP_METRICS.find(item => item.key === metricKey) || HEATMAP_METRICS[0];
  const sortedCases = [...caseRollups].sort((left, right) => left.avgScore - right.avgScore);
  return (
    <article className="chart-card heatmap-card">
      <div className="chart-head">
        <div>
          <p className="eyebrow">Case heatmap</p>
          <h2>Where each harness wins or struggles</h2>
        </div>
        <SegmentedControl
          label="Heatmap metric"
          options={HEATMAP_METRICS}
          selectedKey={metricKey}
          onSelect={setMetricKey}
        />
      </div>
      <div className="heatmap-scroll">
        <div
          className="heatmap"
          style={{
            gridTemplateColumns: `minmax(220px, 1.5fr) repeat(${run.configs.length}, minmax(74px, 1fr))`,
          }}>
          <div className="heatmap-corner">Case</div>
          {run.configs.map(config => (
            <button
              type="button"
              className={config.id === selectedConfigId ? 'heatmap-config active' : 'heatmap-config'}
              key={config.id}
              onClick={() => onSelectConfig(config.id)}>
              {shortLabel(config.label)}
            </button>
          ))}
          {sortedCases.map(rollup => (
            <React.Fragment key={rollup.testCase.id}>
              <button
                type="button"
                className={
                  rollup.testCase.id === selectedCaseId
                    ? 'heatmap-case active'
                    : 'heatmap-case'
                }
                onClick={() => onSelectCase(rollup.testCase.id)}>
                <span>{rollup.testCase.id.replace(/_/g, ' ')}</span>
                <strong>{formatScore(rollup.avgScore)}</strong>
              </button>
              {run.configs.map(config => {
                const grade = getGrade(run, rollup.testCase.id, config.id);
                const rawValue = grade ? metric.value(grade) : 0;
                const normalizedValue = metric.invert ? 1 - rawValue : rawValue;
                return (
                  <button
                    type="button"
                    className={
                      rollup.testCase.id === selectedCaseId || config.id === selectedConfigId
                        ? 'heatmap-cell active'
                        : 'heatmap-cell'
                    }
                    key={config.id}
                    style={{backgroundColor: heatColor(normalizedValue)}}
                    onClick={() => {
                      onSelectCase(rollup.testCase.id);
                      onSelectConfig(config.id);
                    }}
                    title={`${config.label}: ${metric.display(rawValue)}`}>
                    {metric.display(rawValue)}
                  </button>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </article>
  );
}

function SegmentedControl<T extends string>({
  label,
  options,
  selectedKey,
  onSelect,
}: {
  label: string;
  options: {key: T; label: string}[];
  selectedKey: T;
  onSelect: (key: T) => void;
}) {
  return (
    <div className="segmented" aria-label={label}>
      {options.map(option => (
        <button
          type="button"
          className={option.key === selectedKey ? 'active' : ''}
          key={option.key}
          onClick={() => onSelect(option.key)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

function MetricPill({
  label,
  value,
  invert = false,
}: {
  label: string;
  value: number;
  invert?: boolean;
}) {
  const tone = invert ? metricTone(1 - value) : metricTone(value);
  return (
    <div className={`metric-pill ${tone}`}>
      <span>{label}</span>
      <strong>{formatPct(value)}</strong>
    </div>
  );
}

function DiagnosticLine({
  label,
  values,
  empty,
}: {
  label: string;
  values: string[];
  empty: string;
}) {
  return (
    <p>
      <strong>{label}:</strong> {values.length ? values.join(', ') : empty}
    </p>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

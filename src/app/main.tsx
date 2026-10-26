import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import type {BenchmarkRun} from '../lib/types';
import './style.css';

function formatPct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function App() {
  const [run, setRun] = useState<BenchmarkRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

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
      })
      .catch(fetchError => {
        setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
      });
  }, []);

  const selectedCase = run?.cases.find(testCase => testCase.id === selectedCaseId) || run?.cases[0];

  if (error) {
    return (
      <main className="shell">
        <section className="empty">
          <h1>Granola Meetings Eval</h1>
          <p>Run results are not available yet.</p>
          <code>/usr/bin/npm run prepare-data</code>
          <p className="muted">{error}</p>
        </section>
      </main>
    );
  }

  if (!run || !selectedCase) {
    return (
      <main className="shell">
        <section className="empty">
          <h1>Granola Meetings Eval</h1>
          <p>Loading benchmark results...</p>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1>Granola Meetings Eval</h1>
          <p>
            {run.cases.length} cases over {run.dataset.meetingCount} meetings. Generated{' '}
            {new Date(run.generatedAt).toLocaleString()}.
          </p>
        </div>
        <a href="/results/latest-results.json" className="download">
          JSON
        </a>
      </header>

      <section className="summary-grid" aria-label="Harness summaries">
        {run.summaries.map(summary => (
          <article className="summary-panel" key={summary.configId}>
            <div className="summary-title">{summary.label}</div>
            <div className="score">{summary.averageScore.toFixed(3)}</div>
            <dl>
              <div>
                <dt>Recall@k</dt>
                <dd>{formatPct(summary.retrievalRecallAtK)}</dd>
              </div>
              <div>
                <dt>Terms</dt>
                <dd>{formatPct(summary.expectedTermCoverage)}</dd>
              </div>
              <div>
                <dt>Cite recall</dt>
                <dd>{formatPct(summary.citationRecall)}</dd>
              </div>
              <div>
                <dt>Cite span</dt>
                <dd>{formatPct(summary.citationSupport)}</dd>
              </div>
              <div>
                <dt>Halluc.</dt>
                <dd>{formatPct(summary.hallucinationRate)}</dd>
              </div>
              <div>
                <dt>Tool</dt>
                <dd>{formatPct(summary.toolSuccess)}</dd>
              </div>
              <div>
                <dt>Tokens</dt>
                <dd>{summary.avgTokens.toFixed(0)}</dd>
              </div>
              <div>
                <dt>Cost</dt>
                <dd>${summary.estimatedCostUsd.toFixed(4)}</dd>
              </div>
              <div>
                <dt>Latency</dt>
                <dd>{summary.latencyMs.toFixed(0)}ms</dd>
              </div>
            </dl>
          </article>
        ))}
      </section>

      <section className="workspace">
        <nav className="case-list" aria-label="Eval cases">
          {run.cases.map(testCase => {
            const grades = run.grades.filter(grade => grade.caseId === testCase.id);
            const avg =
              grades.reduce((sum, grade) => sum + grade.score, 0) / Math.max(grades.length, 1);
            return (
              <button
                type="button"
                className={testCase.id === selectedCase.id ? 'case-button active' : 'case-button'}
                key={testCase.id}
                onClick={() => setSelectedCaseId(testCase.id)}>
                <span>{testCase.id.replaceAll('_', ' ')}</span>
                <strong>{avg.toFixed(2)}</strong>
              </button>
            );
          })}
        </nav>

        <section className="case-detail">
          <div className="case-heading">
            <div>
              <p className="eyebrow">
                {selectedCase.category} / {selectedCase.difficulty}
              </p>
              <h2>{selectedCase.query}</h2>
            </div>
          </div>

          <div className="rubric">
            <h3>Expected Behavior</h3>
            <p>{selectedCase.expectedBehavior}</p>
            <h3>Required Evidence</h3>
            <ul>
              {selectedCase.requiredEvidence.map(evidence => (
                <li key={evidence.meetingId}>
                  <strong>{evidence.title}</strong>
                  <span>{evidence.snippet}</span>
                  <code>{evidence.meetingId}</code>
                </li>
              ))}
            </ul>
          </div>

          <div className="answers">
            {run.configs.map(config => {
              const answer = run.answers.find(
                item => item.caseId === selectedCase.id && item.configId === config.id,
              );
              const grade = run.grades.find(
                item => item.caseId === selectedCase.id && item.configId === config.id,
              );
              if (!answer || !grade) {
                return null;
              }

              return (
                <article className="answer-panel" key={config.id}>
                  <div className="answer-head">
                    <h3>{config.label}</h3>
                    <div className="metrics">
                      <span>Score {grade.score.toFixed(3)}</span>
                      <span>Recall@k {formatPct(grade.retrievalRecallAtK)}</span>
                      <span>Terms {formatPct(grade.expectedTermCoverage)}</span>
                      <span>Cite span {formatPct(grade.citationSupport)}</span>
                      <span>Halluc. {formatPct(grade.hallucinationRisk)}</span>
                      <span>Tool {formatPct(grade.toolSuccess)}</span>
                      <span>{answer.metrics.totalTokensEstimate} est. tokens</span>
                      <span>${answer.metrics.estimatedCostUsd.toFixed(5)}</span>
                    </div>
                  </div>
                  <pre>{answer.answer}</pre>
                  <div className="diagnostics">
                    <p>
                      <strong>Missing evidence:</strong>{' '}
                      {grade.missingEvidenceIds.length ? grade.missingEvidenceIds.join(', ') : 'none'}
                    </p>
                    <p>
                      <strong>Weak citation spans:</strong>{' '}
                      {grade.poorCitationSpanIds.length ? grade.poorCitationSpanIds.join(', ') : 'none'}
                    </p>
                    <p>
                      <strong>Missing terms:</strong>{' '}
                      {grade.missingTerms.length ? grade.missingTerms.join(', ') : 'none'}
                    </p>
                  </div>
                  <details>
                    <summary>Retrieved evidence</summary>
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
                    <summary>Trace steps</summary>
                    <ol>
                      {answer.steps.map(step => (
                        <li key={step.stepId}>
                          <strong>
                            {step.name} ({step.kind}, {step.latencyMs}ms)
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
                </article>
              );
            })}
          </div>
        </section>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

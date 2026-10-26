export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

export function estimateModelCostUsd(inputTokens: number, outputTokens: number): number {
  const inputPerMillion = envNumber('OPENAI_INPUT_COST_PER_1M', 0.15);
  const outputPerMillion = envNumber('OPENAI_OUTPUT_COST_PER_1M', 0.6);
  return (inputTokens / 1_000_000) * inputPerMillion + (outputTokens / 1_000_000) * outputPerMillion;
}

export function estimateEmbeddingCostUsd(tokens: number): number {
  const embeddingPerMillion = envNumber('OPENAI_EMBEDDING_COST_PER_1M', 0.02);
  return (tokens / 1_000_000) * embeddingPerMillion;
}

export function roundUsd(value: number): number {
  return Number(value.toFixed(6));
}

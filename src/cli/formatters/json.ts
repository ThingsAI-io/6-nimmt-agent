import type { SimulateResult, StrategiesResult, PlayResult, RecommendResult, CompeteResult, CliError } from './types.js';

export function formatJson(
  data: SimulateResult | StrategiesResult | PlayResult | RecommendResult | CompeteResult | CliError,
): string {
  return JSON.stringify(data, null, 2);
}

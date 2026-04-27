import type { SimulateResult, StrategiesResult, PlayResult, RecommendResult, CliError } from './types.js';

export function formatJson(
  data: SimulateResult | StrategiesResult | PlayResult | RecommendResult | CliError,
): string {
  return JSON.stringify(data, null, 2);
}

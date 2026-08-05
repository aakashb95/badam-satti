import { DealSummary } from './types';

export interface NextRoundStage {
  label: string;
  value: string;
}

export function createNextRoundStages(summary: DealSummary): NextRoundStage[];

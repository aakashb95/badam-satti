import React from 'react';
import { NEXT_ROUND_STAGE_DELAYS_MS } from '../roundTiming';
import { createNextRoundStages } from '../roundTransition';
import { DealSummary } from '../types';

interface RoundStartScreenProps {
  round: number;
  summary: DealSummary;
}

const RoundStartScreen: React.FC<RoundStartScreenProps> = ({ round, summary }) => {
  const stages = createNextRoundStages(summary);
  const accessibleSummary = stages.map((stage) => `${stage.label}: ${stage.value}`).join('. ');

  return (
    <main className="screen results-reveal-screen deal-reveal-screen">
      <div className="results-reveal">
        <header className="deal-reveal-header" aria-hidden="true">
          <span>Round {round}</span>
          <strong>New deal</strong>
        </header>
        <div
          className="round-reveal-sequence"
          aria-label={`Round ${round}. ${accessibleSummary}.`}
        >
          {stages.map((stage, index) => (
            <div
              key={stage.label}
              className={`round-reveal-tile deal-reveal-tile deal-reveal-stage-${index + 1}`}
              style={{
                '--round-reveal-delay': `${NEXT_ROUND_STAGE_DELAYS_MS[index]}ms`,
              } as React.CSSProperties}
              aria-hidden="true"
            >
              <span>{stage.label}</span>
              <strong>{stage.value}</strong>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
};

export default RoundStartScreen;

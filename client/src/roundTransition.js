const formatNames = (names) => {
  if (names.length < 2) return names[0] || '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`;
};

export const createNextRoundStages = (summary) => [
  {
    label: 'Highest score',
    value: `${summary.dealerName} deals`,
  },
  {
    label: '7♥',
    value: `${summary.heartsSevenPlayerName} starts`,
  },
  summary.extraCardPlayerNames.length
    ? {
        label: summary.extraCardPlayerNames.length === 1 ? 'Extra card' : 'Extra cards',
        value: formatNames(summary.extraCardPlayerNames),
      }
    : {
        label: 'Even deal',
        value: `${summary.cardsPerPlayer} cards each`,
      },
];

import { asNumber, percent } from '../../shared/domain.mjs';

// An order ID may be reused after an SO change; match the customer and SO from each snapshot.
export function productionSeries(rounds, submissions, selectedRound, selectedOrder) {
  return rounds
    .filter(
      (round) =>
        round.date === selectedRound.date &&
        (round.factory || round.snapshot.factory) ===
          (selectedRound.factory || selectedRound.snapshot.factory) &&
        round.shift === selectedRound.shift &&
        round.line === selectedRound.line,
    )
    .flatMap((round) => {
      const order = round.snapshot.orders.find(
        (candidate) =>
          candidate.customer === selectedOrder.customer && candidate.so === selectedOrder.so,
      );
      if (!order) return [];
      const entry = submissions.find(
        (submission) =>
          submission.roundId === round.id &&
          submission.orderId === order.id &&
          submission.stationId === 'production',
      );
      const actual = asNumber(entry?.payload.values.pb);
      return [
        {
          id: round.id,
          start: round.start,
          end: round.end,
          endAt: round.endAt,
          actual,
          target: asNumber(order.target),
          percentage: percent(actual, order.target),
        },
      ];
    })
    .sort((a, b) => Date.parse(a.endAt) - Date.parse(b.endAt));
}

export function seriesTotals(series) {
  const recorded = series.filter((point) => point.actual !== null);
  return {
    actual: recorded.length ? recorded.reduce((sum, point) => sum + point.actual, 0) : null,
    recorded: recorded.length,
    total: series.length,
    maximum: Math.max(1, ...series.flatMap((point) => [point.actual || 0, point.target || 0])),
  };
}

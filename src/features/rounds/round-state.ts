import * as domain from '../../shared/domain.mjs';
import type { DataRecord as Obj } from '../../shared/types';
import { createDemo } from '../demo/demo.mjs';
const D: any = domain;
export function demoForScope(scope: Obj) {
  const base: any = createDemo();
  base.config.factory = scope.factory;
  base.config.shift = scope.shift;
  base.catalog = D.FACTORY_SHIFTS;
  base.deployment = { authProvider: 'local' };
  if (scope.factory !== 'AJ2' || scope.shift !== 'กะเช้า') {
    base.rounds = [];
    base.submissions = [];
    base.reports = [];
    base.audits = [];
  }
  return base;
}
export function scopeKey(scope: Obj) {
  return scope.factory + '|' + scope.shift;
}
export function firstRound(
  state: any,
  date = state.selectedDate || D.productionDate(state.config),
) {
  const rounds = D.roundsOnDate(state.rounds, date);
  return rounds.find((r: Obj) => D.isCurrentRound(r, state.config))?.id || rounds[0]?.id || '';
}

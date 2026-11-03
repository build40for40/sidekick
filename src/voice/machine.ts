import type { Phase } from './types';
const allowed: Record<Phase, readonly Phase[]> = {
  ready: ['ready','downloading','listening','thinking','speaking','error'],
  downloading: ['ready','error'], listening: ['ready','transcribing','error'],
  transcribing: ['ready','thinking','error'], thinking: ['ready','speaking','error'],
  speaking: ['ready','speaking','error'], error: ['ready','error'],
};
export function transitionPhase(current: Phase, next: Phase): Phase {
  if (current === next) return current;
  if (!allowed[current].includes(next)) throw Error(`Invalid interaction transition: ${current} to ${next}`);
  return next;
}

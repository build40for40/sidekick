export type LessonKind = 'find' | 'click' | 'practise';
export type InputSource = 'virtual' | 'physical';
export interface Lesson { kind: LessonKind; target: string; hints: boolean; complete: boolean; source?: InputSource }
export type LessonEvent = { type: 'start'; kind: LessonKind; target: string } | { type: 'hints'; enabled: boolean } | { type: 'input'; controlId: string; source: InputSource };
export function transitionLesson(state: Lesson | null, event: LessonEvent): Lesson | null {
  if (event.type === 'start') return { kind: event.kind, target: event.target, hints: true, complete: false };
  if (!state) return null;
  if (event.type === 'hints') return { ...state, hints: event.enabled };
  if (event.controlId !== state.target || state.complete) return state;
  return { ...state, complete: true, source: event.source };
}

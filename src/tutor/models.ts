import { tutorModels } from '../voice/config';
import { inferenceOptions, type RemoteInferenceOptions } from '../voice/remote';

export type TutorModelSelection = { mode: 'local'; model: keyof typeof tutorModels } | RemoteInferenceOptions;
export function validateModelSelection(selection: TutorModelSelection): TutorModelSelection {
  if (selection.mode === 'local') {
    if (!Object.hasOwn(tutorModels, selection.model)) throw Error('Unknown local tutor model.');
    return { mode: 'local', model: selection.model };
  }
  const remote = inferenceOptions(selection);
  if (remote.mode !== 'remote') throw Error('Invalid tutor model.');
  return remote;
}
export function modelKey(model: TutorModelSelection): string {
  return model.mode === 'local' ? `local:${model.model}` : JSON.stringify([model.endpoint, model.model]);
}
export const localModelLabels: Record<keyof typeof tutorModels, string> = {
  quality: 'Qwen 2.5 · 1.5B', fast: 'Qwen 2.5 · 0.5B', compact: 'SmolLM2 · 360M',
};

import { createSidekick, type Sidekick } from './index';
// This page is a minimal integration example. Production hosts import createSidekick.
const mount = document.querySelector<HTMLElement>('#app')!;
// Remote demo builds require an explicit Record/setup consent step.
const remoteModel = import.meta.env.VITE_TUTOR_MODEL as string | undefined;
const sidekick = createSidekick(mount, {
  inference: remoteModel ? { mode: 'remote', endpoint: new URL('./api/tutor', location.href).href, model: remoteModel } : { mode: 'local' },
  modelCatalog: new URL('./api/models', location.href).href,
  autoInitializeVoice: !remoteModel,
});
declare global { interface Window { sidekick: Sidekick } }
window.sidekick = sidekick;
sidekick.on(event => {
  if (event.type === 'timing') console.info('[Sidekick timing, milliseconds; firstAudible is scheduling estimate]', JSON.stringify(event.timings));
});
window.addEventListener('pagehide', () => sidekick.destroy());
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });

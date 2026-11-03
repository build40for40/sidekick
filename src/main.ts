import { createSidekick, type Sidekick } from './index';
// This page is a minimal integration example. Production hosts import createSidekick.
const mount = document.querySelector<HTMLElement>('#app')!;
const sidekick = createSidekick(mount);
declare global { interface Window { sidekick: Sidekick } }
window.sidekick = sidekick;
sidekick.on(event => {
  if (event.type === 'timing') console.info('[Sidekick local timing, milliseconds; firstAudible is scheduling estimate]', JSON.stringify(event.timings));
});
window.addEventListener('pagehide', () => sidekick.destroy());
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });

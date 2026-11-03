import { localModelLabels, modelKey, type TutorModelSelection } from './tutor/models';

/** Settings are scoped to the component's shadow root; the host owns configuration and lifecycle. */
export function createSettings(root: ShadowRoot, options: {
  games: { id: string; name: string }[];
  onModel(model: TutorModelSelection): void;
  onGame(game: string | null): void;
  onOpen(): void;
  signal: AbortSignal;
}) {
  const find = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const button = find<HTMLButtonElement>('.settings-toggle');
  const panel = find('.settings-panel');
  const close = find<HTMLButtonElement>('.settings-close');
  const modelSelect = find<HTMLSelectElement>('.model-select');
  const gameSelect = find<HTMLSelectElement>('.game-select');
  const status = find('.settings-status');
  let models: TutorModelSelection[] = [];
  let keys = '';
  let open = false;
  const setOpen = (value: boolean, restoreFocus = false) => {
    open = value; panel.hidden = !value; button.setAttribute('aria-expanded', String(value));
    if (value) { options.onOpen(); modelSelect.focus(); }
    else if (restoreFocus) button.focus({ preventScroll: true });
  };
  const option = (value: string, label: string) => {
    const item = document.createElement('option'); item.value = value; item.textContent = label; return item;
  };
  gameSelect.append(option('', 'No game · controller only'), ...options.games.map(game => option(game.id, game.name)));
  button.onclick = () => setOpen(!open);
  close.onclick = () => setOpen(false, true);
  modelSelect.onchange = () => { const selected = models.find(model => modelKey(model) === modelSelect.value); if (selected) options.onModel(selected); };
  gameSelect.onchange = () => options.onGame(gameSelect.value || null);
  root.addEventListener('keydown', event => {
    if ((event as KeyboardEvent).key !== 'Escape' || !open) return;
    event.preventDefault(); event.stopPropagation(); setOpen(false, true);
  }, { signal: options.signal });
  document.addEventListener('pointerdown', event => {
    const path = event.composedPath();
    if (open && !path.includes(panel) && !path.includes(button)) setOpen(false);
  }, { signal: options.signal });
  root.addEventListener('focusout', event => {
    const next = (event as FocusEvent).relatedTarget as Node | null;
    if (open && next && !panel.contains(next) && next !== button) setOpen(false);
  }, { signal: options.signal });
  return {
    update(selection: TutorModelSelection, available: TutorModelSelection[], game: string | null, loading: boolean, catalogStatus: string) {
      const nextKeys = JSON.stringify(available.map(modelKey));
      if (keys !== nextKeys) {
        keys = nextKeys; models = available;
        const local = document.createElement('optgroup'); local.label = 'On this device';
        const remote = document.createElement('optgroup'); remote.label = 'Remote';
        for (const model of models) (model.mode === 'local' ? local : remote).append(option(modelKey(model), model.mode === 'local' ? localModelLabels[model.model] : model.model));
        if (!remote.children.length) { const empty = option('', 'No remote models configured'); empty.disabled = true; remote.append(empty); }
        modelSelect.replaceChildren(local, remote);
      }
      modelSelect.value = modelKey(selection);
      gameSelect.value = game ?? '';
      find('.settings-hint').textContent = loading ? 'Voice setup is in progress. Changing models cancels it.' : 'After changing models, press Record to finish setup.';
      status.textContent = selection.mode === 'remote'
        ? 'Transcripts and game context go to this provider. Audio stays on your device.'
        : 'Questions and audio stay on your device. Local models need a download.';
      find('.catalog-status').textContent = catalogStatus;
    },
  };
}

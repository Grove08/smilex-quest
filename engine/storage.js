const KEY = 'smilex-quest-v1';

export function memoryStorage() {
  let saved = null;
  return { load: () => saved, save: (s) => { saved = JSON.parse(JSON.stringify(s)); }, clear: () => { saved = null; } };
}

export function localStorageAdapter(key = KEY) {
  return {
    load() { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
    save(s) { try { localStorage.setItem(key, JSON.stringify(s)); } catch { /* без сохранения */ } },
    clear() { try { localStorage.removeItem(key); } catch { /* без сохранения */ } },
  };
}

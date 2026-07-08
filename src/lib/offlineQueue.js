// Petite file d'attente persistée en localStorage : si une écriture Supabase
// échoue parce que le téléphone est hors-ligne, l'action est mise de côté et
// rejouée automatiquement dès que la connexion revient.

const QUEUE_KEY = 'atelier:offlineQueue';

function getQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

function setQueue(queue) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.warn('Impossible de sauvegarder la file hors-ligne.', e);
  }
}

export function enqueue(type, payload) {
  const queue = getQueue();
  queue.push({ type, payload, queuedAt: Date.now() });
  setQueue(queue);
}

export function getQueueLength() {
  return getQueue().length;
}

export function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

// handlers = { insertVente: fn, insertDepense: fn, deleteEntry: fn, upsertProduit: fn, deleteProduit: fn, updatePhone: fn }
export async function flushQueue(handlers) {
  const queue = getQueue();
  if (queue.length === 0) return 0;

  const remaining = [];
  for (const action of queue) {
    const handler = handlers[action.type];
    if (!handler) continue;
    try {
      await handler(action.payload);
    } catch (e) {
      remaining.push(action); // on réessaiera à la prochaine tentative
    }
  }
  setQueue(remaining);
  return remaining.length;
}

/**
 * Conversation id = one chat thread. The server counts each id once per month,
 * so the id must stay the same for the whole thread and change for a new one.
 * A new thread is detected when the user-message count drops, or restarts at 1
 * after a longer thread.
 */
let current: string | null = null;
let lastUserCount = 0;

function newId(): string {
  const raw = globalThis.crypto?.randomUUID?.() ?? `c${Date.now()}${Math.random().toString(36).slice(2)}`;
  return raw.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64).padEnd(8, '0');
}

export function conversationIdFor(messages: ReadonlyArray<{ role: string }>): string {
  const userCount = messages.filter((m) => m.role === 'user').length;
  const isNewThread =
    current === null || userCount < lastUserCount || (userCount === 1 && lastUserCount !== 1);
  if (isNewThread) current = newId();
  lastUserCount = userCount;
  return current as string;
}

/**
 * Domain layer: validation, task creation, and reading the task list.
 * Contains no DOM access and no knowledge of localStorage.
 */

export const MAX_TITLE_LENGTH = 200;

const INVALID_TITLE_MESSAGE = 'Enter a task title (1–200 characters).';

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, title: string } | { ok: false, message: string }}
 */
export function validateTitle(raw) {
  if (typeof raw !== 'string') {
    return { ok: false, message: INVALID_TITLE_MESSAGE };
  }

  const title = raw.trim();

  if (title.length === 0 || title.length > MAX_TITLE_LENGTH) {
    return { ok: false, message: INVALID_TITLE_MESSAGE };
  }

  return { ok: true, title };
}

/**
 * Builds a task in memory without touching storage.
 * @param {string} rawTitle
 * @param {() => Date} [now]
 * @returns {{ id: string, title: string, createdAt: string }}
 */
export function buildTask(rawTitle, now = () => new Date()) {
  const result = validateTitle(rawTitle);

  if (!result.ok) {
    throw new ValidationError(result.message);
  }

  return {
    id: crypto.randomUUID(),
    title: result.title,
    createdAt: now().toISOString(),
  };
}

/**
 * Reads and normalises stored tasks. Stored data is untrusted.
 * @param {{ read: () => string | null }} storage
 * @returns {{ tasks: Array<{id: string, title: string, createdAt: string}>, corrupt: boolean }}
 */
export function listTasks(storage) {
  const raw = storage.read();

  if (raw === null || raw === undefined || raw === '') {
    return { tasks: [], corrupt: false };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { tasks: [], corrupt: true };
  }

  if (!Array.isArray(parsed)) {
    return { tasks: [], corrupt: true };
  }

  const tasks = parsed.filter(isTaskLike).map(normalise);

  tasks.sort((a, b) => {
    const aTime = Date.parse(a.createdAt);
    const bTime = Date.parse(b.createdAt);

    if (Number.isNaN(aTime) || Number.isNaN(bTime) || aTime === bTime) {
      return 0;
    }

    return bTime - aTime;
  });

  return { tasks, corrupt: false };
}

/**
 * Validates, creates, and persists a task. Newest task is stored first.
 * @param {{ read: () => string | null, write: (value: string) => void }} storage
 * @param {string} rawTitle
 * @param {() => Date} [now]
 * @returns {{ id: string, title: string, createdAt: string }}
 */
export function createTask(storage, rawTitle, now) {
  const task = buildTask(rawTitle, now);
  const { tasks } = listTasks(storage);

  storage.write(JSON.stringify([task, ...tasks]));

  return task;
}

/**
 * Removes every stored task.
 * @param {{ clear: () => void }} storage
 */
export function clearTasks(storage) {
  storage.clear();
}

function isTaskLike(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof value.id === 'string' &&
    value.id.trim() !== '' &&
    typeof value.title === 'string' &&
    value.title.trim() !== ''
  );
}

function normalise(task) {
  return {
    id: task.id,
    title: task.title.trim(),
    createdAt: typeof task.createdAt === 'string' ? task.createdAt : '',
  };
}

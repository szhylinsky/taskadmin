import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_TITLE_LENGTH,
  ValidationError,
  buildTask,
  clearTasks,
  createTask,
  deleteTask,
  listTasks,
  validateTitle,
} from '../js/task-store.js';

/* ------------------------------------------------------------------ helpers */

function fakeStorage(initial = null) {
  let value = initial;
  let writes = 0;

  return {
    read: () => value,
    write: (next) => {
      value = next;
      writes += 1;
    },
    clear: () => {
      value = null;
    },
    dump: () => value,
    writeCount: () => writes,
  };
}

const at = (iso) => () => new Date(iso);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/* ---------------------------------------------------------------- scenarios */

test('Scenario 1: Create a new task', () => {
  // Given the user has no tasks
  const storage = fakeStorage();

  // When the user creates a task with title "Buy groceries"
  createTask(storage, 'Buy groceries');

  // Then the task "Buy groceries" should be added to the task list
  const { tasks, corrupt } = listTasks(storage);

  assert.equal(corrupt, false);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].title, 'Buy groceries');
  assert.match(tasks[0].id, UUID_PATTERN);
  assert.match(tasks[0].createdAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(storage.dump(), /Buy groceries/);
});

test('Scenario 2: List all tasks', () => {
  // Given the user has the following tasks:
  const storage = fakeStorage();
  const rows = [
    { title: 'Buy groceries' },
    { title: 'Read a book' },
  ];

  for (const row of rows) {
    createTask(storage, row.title);
  }

  // When the user requests the list of tasks
  const { tasks } = listTasks(storage);

  // Then the user should see 2 tasks
  assert.equal(tasks.length, 2);

  // And the tasks should include "Buy groceries" and "Read a book"
  const titles = tasks.map((task) => task.title);
  assert.ok(titles.includes('Buy groceries'));
  assert.ok(titles.includes('Read a book'));
});

test('Scenario 3: Delete a task', () => {
  // Given the user has the following tasks:
  const storage = fakeStorage();
  const rows = [
    { title: 'Buy groceries' },
    { title: 'Read a book' },
  ];
  const ids = new Map();

  for (const row of rows) {
    ids.set(row.title, createTask(storage, row.title).id);
  }

  // When the user deletes the task "Buy groceries"
  const result = deleteTask(storage, ids.get('Buy groceries'));

  // Then the task "Buy groceries" should no longer be in the task list
  assert.equal(result.removed, true);

  const { tasks, corrupt } = listTasks(storage);
  assert.equal(corrupt, false);
  assert.deepEqual(tasks.map((task) => task.title), ['Read a book']);
  assert.match(storage.dump(), /Read a book/);
  assert.doesNotMatch(storage.dump(), /Buy groceries/);
});

test('Scenario 4: Delete one of several tasks with the same title', () => {
  // Given the user has the following tasks: (two with the same title)
  const storage = fakeStorage();
  const first = createTask(storage, 'Buy groceries');
  const second = createTask(storage, 'Buy groceries');

  // When the user deletes one of the "Buy groceries" tasks
  const { removed, tasks } = deleteTask(storage, first.id);

  // Then the task list should contain exactly 1 task titled "Buy groceries"
  assert.equal(removed, true);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].title, 'Buy groceries');
  assert.equal(tasks[0].id, second.id);
});

test('Scenario 5: Delete the last task', () => {
  // Given the user has the following tasks: (one row)
  const storage = fakeStorage();
  const task = createTask(storage, 'Buy groceries');

  // When the user deletes the task "Buy groceries"
  const result = deleteTask(storage, task.id);

  // Then the user should see 0 tasks
  assert.equal(result.removed, true);
  assert.deepEqual(result.tasks, []);
  assert.deepEqual(listTasks(storage).tasks, []);
});

/* --------------------------------------------------------------- validation */

test('validateTitle trims surrounding whitespace', () => {
  assert.deepEqual(validateTitle('  Buy groceries  '), {
    ok: true,
    title: 'Buy groceries',
  });
});

test('validateTitle accepts the boundary lengths 1 and 200', () => {
  assert.equal(validateTitle('a').ok, true);
  assert.equal(validateTitle('a'.repeat(MAX_TITLE_LENGTH)).ok, true);
});

test('validateTitle rejects empty, whitespace-only and over-long titles', () => {
  for (const value of ['', '   ', '\n\t', 'a'.repeat(MAX_TITLE_LENGTH + 1)]) {
    const result = validateTitle(value);
    assert.equal(result.ok, false);
    assert.equal(typeof result.message, 'string');
  }
});

test('validateTitle rejects non-strings', () => {
  for (const value of [undefined, null, 42, {}, []]) {
    assert.equal(validateTitle(value).ok, false);
  }
});

test('buildTask never produces markup-safe-looking ids twice', () => {
  const ids = new Set(Array.from({ length: 50 }, () => buildTask('task').id));
  assert.equal(ids.size, 50);
});

/* ------------------------------------------------------------------ creation */

test('createTask throws ValidationError and does not write on invalid input', () => {
  const storage = fakeStorage();

  assert.throws(() => createTask(storage, '   '), ValidationError);
  assert.equal(storage.dump(), null);
});

test('createTask stores duplicate titles', () => {
  const storage = fakeStorage();

  createTask(storage, 'Buy groceries');
  createTask(storage, 'Buy groceries');

  const { tasks } = listTasks(storage);
  assert.equal(tasks.length, 2);
  assert.deepEqual(
    tasks.map((task) => task.title),
    ['Buy groceries', 'Buy groceries'],
  );
});

test('createTask prepends the newest task regardless of clock skew', () => {
  const storage = fakeStorage();

  createTask(storage, 'Written first', at('2026-11-14T10:00:00.000Z'));
  createTask(storage, 'Written second', at('2026-11-13T10:00:00.000Z'));

  // listTasks sorts by createdAt, so the older timestamp still sorts last.
  assert.deepEqual(
    listTasks(storage).tasks.map((task) => task.title),
    ['Written first', 'Written second'],
  );
});

/* ------------------------------------------------------------------ listing */

test('listTasks returns an empty list when nothing is stored', () => {
  const { tasks, corrupt } = listTasks(fakeStorage());
  assert.deepEqual(tasks, []);
  assert.equal(corrupt, false);
});

test('listTasks sorts newest first', () => {
  const storage = fakeStorage();

  createTask(storage, 'Older', at('2026-11-12T08:00:00.000Z'));
  createTask(storage, 'Newest', at('2026-11-14T08:00:00.000Z'));
  createTask(storage, 'Middle', at('2026-11-13T08:00:00.000Z'));

  assert.deepEqual(
    listTasks(storage).tasks.map((task) => task.title),
    ['Newest', 'Middle', 'Older'],
  );
});

test('listTasks keeps storage order for identical timestamps', () => {
  const storage = fakeStorage();
  const sameMoment = at('2026-11-14T08:00:00.000Z');

  createTask(storage, 'First', sameMoment);
  createTask(storage, 'Second', sameMoment);

  // createTask prepends, so the most recently created task stays first.
  assert.deepEqual(
    listTasks(storage).tasks.map((task) => task.title),
    ['Second', 'First'],
  );
});

test('listTasks reports corrupt JSON and returns no tasks', () => {
  const { tasks, corrupt } = listTasks(fakeStorage('not json'));
  assert.deepEqual(tasks, []);
  assert.equal(corrupt, true);
});

test('listTasks reports a non-array payload as corrupt', () => {
  for (const payload of ['{"tasks":[]}', '42', '"text"', 'null']) {
    const { tasks, corrupt } = listTasks(fakeStorage(payload));
    assert.deepEqual(tasks, []);
    assert.equal(corrupt, true);
  }
});

test('listTasks drops entries that are not valid tasks', () => {
  const payload = JSON.stringify([
    { id: 'a', title: '  Keep me  ', createdAt: '2026-11-14T08:00:00.000Z' },
    { id: '', title: 'Empty id', createdAt: '2026-11-14T08:00:00.000Z' },
    { title: 'Missing id', createdAt: '2026-11-14T08:00:00.000Z' },
    { id: 'b', title: '   ', createdAt: '2026-11-14T08:00:00.000Z' },
    null,
    'string',
    42,
  ]);

  const { tasks, corrupt } = listTasks(fakeStorage(payload));

  assert.equal(corrupt, false);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].title, 'Keep me');
});

test('listTasks tolerates a missing createdAt by keeping the task', () => {
  const payload = JSON.stringify([{ id: 'a', title: 'No timestamp' }]);
  const { tasks } = listTasks(fakeStorage(payload));

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].createdAt, '');
});

/* ------------------------------------------------------------------ deletion */

test('deleteTask returns the remaining list without a second read', () => {
  const storage = fakeStorage();
  createTask(storage, 'Keep me', at('2026-11-12T08:00:00.000Z'));
  createTask(storage, 'Remove me', at('2026-11-14T08:00:00.000Z'));
  const { id } = listTasks(storage).tasks.find(
    (task) => task.title === 'Remove me',
  );

  const { removed, tasks } = deleteTask(storage, id);

  assert.equal(removed, true);
  assert.deepEqual(tasks, listTasks(storage).tasks);
  assert.deepEqual(
    tasks.map((task) => task.title),
    ['Keep me'],
  );
});

test('deleteTask is a no-op for a stale id', () => {
  const storage = fakeStorage();
  createTask(storage, 'Buy groceries');
  const writesAfterCreate = storage.writeCount();

  const result = deleteTask(storage, 'not-an-existing-id');

  assert.equal(result.removed, false);
  assert.deepEqual(
    result.tasks.map((task) => task.title),
    ['Buy groceries'],
  );
  assert.equal(storage.writeCount(), writesAfterCreate);
  assert.match(storage.dump(), /Buy groceries/);
});

test('deleteTask ignores non-string, empty and whitespace-only ids', () => {
  for (const id of [undefined, null, 42, {}, '', '   ', '\n\t']) {
    const storage = fakeStorage();
    createTask(storage, 'Buy groceries');
    const writesAfterCreate = storage.writeCount();

    const result = deleteTask(storage, id);

    assert.equal(result.removed, false);
    assert.equal(result.tasks.length, 1);
    assert.equal(storage.writeCount(), writesAfterCreate);
  }
});

test('deleteTask does not overwrite corrupt stored data', () => {
  const storage = fakeStorage('not json');

  const result = deleteTask(storage, 'some-id');

  assert.equal(result.removed, false);
  assert.deepEqual(result.tasks, []);
  assert.equal(storage.dump(), 'not json');
});

/* -------------------------------------------------------------- persistence */

test('tasks survive a simulated reload', () => {
  const storage = fakeStorage();
  createTask(storage, 'Buy groceries', at('2026-11-14T08:00:00.000Z'));

  const reloaded = fakeStorage(storage.dump());

  assert.deepEqual(
    listTasks(reloaded).tasks.map((task) => task.title),
    ['Buy groceries'],
  );
});

test('a deletion survives a simulated reload', () => {
  const storage = fakeStorage();
  const removed = createTask(storage, 'Remove me');
  createTask(storage, 'Keep me');
  deleteTask(storage, removed.id);

  const reloaded = fakeStorage(storage.dump());

  assert.deepEqual(
    listTasks(reloaded).tasks.map((task) => task.title),
    ['Keep me'],
  );
});

test('clearTasks removes every stored task', () => {
  const storage = fakeStorage();
  createTask(storage, 'Buy groceries');

  clearTasks(storage);

  assert.equal(storage.dump(), null);
  assert.deepEqual(listTasks(storage).tasks, []);
});

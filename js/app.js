import { createLocalStoragePort } from './storage.js';
import {
  ValidationError,
  buildTask,
  createTask,
  deleteTask,
  listTasks,
} from './task-store.js';

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const STORAGE_WARNING =
  "Tasks can't be saved in this browser session. Changes may be lost on reload.";

let tasks = [];

function render() {
  const list = document.getElementById('task-list');
  const empty = document.getElementById('empty-state');

  list.replaceChildren();

  for (const task of tasks) {
    const item = document.createElement('li');
    item.dataset.id = task.id;

    const info = document.createElement('div');
    info.className = 'task-info';

    const title = document.createElement('span');
    title.className = 'task-title';
    title.textContent = task.title;

    const time = document.createElement('time');
    time.className = 'task-time';
    time.dateTime = task.createdAt;

    const parsed = new Date(task.createdAt);
    time.textContent = Number.isNaN(parsed.getTime())
      ? ''
      : dateFormatter.format(parsed);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'delete-task';
    remove.dataset.id = task.id;
    remove.textContent = 'Delete';
    remove.setAttribute('aria-label', `Delete task: ${task.title}`);

    info.append(title, time);
    item.append(info, remove);
    list.append(item);
  }

  empty.hidden = tasks.length > 0;
}

function setMessage(element, message) {
  element.textContent = message;
  element.hidden = message === '';
}

function init() {
  const port = createLocalStoragePort();

  const form = document.getElementById('task-form');
  const input = document.getElementById('task-title');
  const list = document.getElementById('task-list');
  const errorElement = document.getElementById('form-error');
  const warningElement = document.getElementById('storage-warning');

  const { tasks: loaded, corrupt } = listTasks(port);
  tasks = loaded;
  render();

  if (corrupt) {
    setMessage(
      warningElement,
      'Saved tasks could not be read, so they are not shown. Adding a task replaces the stored data.',
    );
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    setMessage(errorElement, '');

    let task;

    try {
      task = createTask(port, input.value);
    } catch (error) {
      if (error instanceof ValidationError) {
        setMessage(errorElement, error.message);
        input.focus();
        return;
      }

      // Storage is unavailable (disabled or full): keep the task for this session.
      task = buildTask(input.value);
      setMessage(warningElement, STORAGE_WARNING);
    }

    tasks = [task, ...tasks];
    render();

    input.value = '';
    input.focus();
  });

  list.addEventListener('click', (event) => {
    const button = event.target?.closest?.('button[data-id]');

    if (!button || !list.contains(button)) {
      return;
    }

    const id = button.dataset.id;
    const index = tasks.findIndex((task) => task.id === id);

    if (index === -1) {
      return;
    }

    // Focus the task that takes this row's place, or the input if none remains.
    const nextId = tasks[index + 1]?.id ?? tasks[index - 1]?.id ?? null;

    let remaining;

    try {
      ({ tasks: remaining } = deleteTask(port, id));
    } catch {
      // Storage is unavailable: keep the remaining list for this session.
      remaining = tasks.filter((task) => task.id !== id);
      setMessage(warningElement, STORAGE_WARNING);
    }

    tasks = remaining;
    render();

    if (nextId === null) {
      input.focus();
    } else {
      const nextButton = Array.from(
        list.querySelectorAll('button[data-id]'),
      ).find((candidate) => candidate.dataset.id === nextId);
      (nextButton ?? input).focus();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);

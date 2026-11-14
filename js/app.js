import { createLocalStoragePort } from './storage.js';
import {
  ValidationError,
  buildTask,
  createTask,
  listTasks,
} from './task-store.js';

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

let tasks = [];

function render() {
  const list = document.getElementById('task-list');
  const empty = document.getElementById('empty-state');

  list.replaceChildren();

  for (const task of tasks) {
    const item = document.createElement('li');

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

    item.append(title, time);
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
      setMessage(
        warningElement,
        "Tasks can't be saved in this browser session.",
      );
    }

    tasks = [task, ...tasks];
    render();

    input.value = '';
    input.focus();
  });
}

document.addEventListener('DOMContentLoaded', init);

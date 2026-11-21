import { expect, test } from '@playwright/test';

const STORAGE_KEY = 'taskadmin.tasks.v1';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
  await page.reload();
});

test('shows the empty state when no tasks are stored', async ({ page }) => {
  await expect(page.locator('#task-list li')).toHaveCount(0);
  await expect(page.locator('#empty-state')).toBeVisible();
});

test('creates a task and keeps it after a reload', async ({ page }) => {
  await page.getByLabel('Task title').fill('Write E2E tests');
  await page.getByRole('button', { name: 'Add task' }).click();

  const row = page.locator('#task-list li').filter({ hasText: 'Write E2E tests' });
  await expect(row).toHaveCount(1);
  await expect(page.locator('#empty-state')).toBeHidden();
  await expect(page.getByLabel('Task title')).toHaveValue('');

  const stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  expect(stored).toContain('Write E2E tests');

  await page.reload();
  await expect(
    page.locator('#task-list li').filter({ hasText: 'Write E2E tests' }),
  ).toHaveCount(1);
});

test('rejects an empty title', async ({ page }) => {
  await page.getByRole('button', { name: 'Add task' }).click();

  await expect(page.locator('#form-error')).toHaveText(
    'Enter a task title (1–200 characters).',
  );
  await expect(page.locator('#task-list li')).toHaveCount(0);
});

test('deletes only the selected task and persists the result', async ({ page }) => {
  await page.getByLabel('Task title').fill('Keep me');
  await page.getByRole('button', { name: 'Add task' }).click();
  await page.getByLabel('Task title').fill('Delete me');
  await page.getByRole('button', { name: 'Add task' }).click();

  await expect(page.locator('#task-list li')).toHaveCount(2);

  await page
    .locator('#task-list li')
    .filter({ hasText: 'Delete me' })
    .getByRole('button', { name: 'Delete task: Delete me' })
    .click();

  await expect(page.locator('#task-list li')).toHaveCount(1);
  await expect(
    page.locator('#task-list li').filter({ hasText: 'Keep me' }),
  ).toHaveCount(1);
  await expect(
    page.locator('#task-list li').filter({ hasText: 'Delete me' }),
  ).toHaveCount(0);

  await page.reload();
  await expect(page.locator('#task-list li')).toHaveCount(1);
  await expect(
    page.locator('#task-list li').filter({ hasText: 'Keep me' }),
  ).toHaveCount(1);
});

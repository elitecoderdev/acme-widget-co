import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('builds, discounts, edits and clears a real basket', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: /A little widget\.\s*A lot of possibility\./ }),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('empty-basket.png'), fullPage: true });
  await page.getByRole('button', { name: 'Add Red Widget to basket' }).click();
  await page.getByRole('button', { name: 'Add Red Widget to basket' }).click();
  await expect(page.getByTestId('quote-total')).toHaveText('$54.37');
  await expect(page.getByText('Applied', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('red-pair.png'), fullPage: true });
  await page.getByRole('button', { name: 'Increase Red Widget quantity' }).click();
  await expect(page.getByTestId('quote-total')).toHaveText('$85.32');
  await page.getByRole('button', { name: 'Decrease Red Widget quantity' }).click();
  await expect(page.getByTestId('quote-total')).toHaveText('$54.37');
  await page.getByRole('button', { name: 'Remove Red Widget' }).click();
  await expect(page.getByRole('heading', { name: 'Room for something good.' })).toBeVisible();
  await page.getByRole('button', { name: 'Add Blue Widget to basket' }).click();
  await expect(page.getByTestId('quote-total')).toHaveText('$12.90');
  await page.getByRole('button', { name: 'Clear basket' }).click();
  await expect(page.getByRole('heading', { name: 'Room for something good.' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('all supplied examples produce the required server totals', async ({ page }, testInfo) => {
  await page.goto('/');
  const samples = page.locator('.example-button');
  for (const [index, expected] of ['$37.85', '$54.37', '$60.85', '$98.27'].entries()) {
    await samples.nth(index).click();
    await expect(page.getByTestId('quote-total')).toHaveText(expected);
  }
  await expect(page.getByText('You’ve unlocked')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('free-delivery.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('recovers from a quote failure without losing the selected items', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.route('**/api/quotes', (route) => route.fulfill({ status: 503, body: '{}' }));
  await page.getByRole('button', { name: 'Add Green Widget to basket' }).click();
  await expect(page.getByRole('alert')).toContainText('Your items are still here');
  await page.screenshot({ path: testInfo.outputPath('quote-error.png'), fullPage: true });
  await page.unroute('**/api/quotes');
  await page.getByRole('button', { name: /Try estimate again/ }).click();
  await expect(page.getByTestId('quote-total')).toHaveText('$29.90');
});

test('supports keyboard use and has no automated WCAG AA violations', async ({ page }) => {
  await page.goto('/');
  const add = page.getByRole('button', { name: 'Add Blue Widget to basket' });
  await add.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('quote-total')).toHaveText('$12.90');
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

test('keeps transfers bounded and makes the basket reachable on every screen', async ({
  page,
  baseURL,
}, testInfo) => {
  const external: string[] = [];
  const applicationOrigin = new URL(baseURL!).origin;
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== applicationOrigin) external.push(request.url());
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Add Blue Widget to basket' }).click();
  await expect(page.getByTestId('quote-total')).toHaveText('$12.90');
  const jump = page.getByRole('link', { name: 'View basket, 1 item' });
  if (testInfo.project.name === 'mobile' || testInfo.project.name === 'small-phone') {
    await expect(jump).toBeVisible();
    await jump.click();
    await expect(page.locator('#basket')).toBeInViewport();
    const touchTargets = await page
      .locator('.quantity-control button, .remove-button')
      .evaluateAll((elements) =>
        elements.map((element) => {
          const bounds = element.getBoundingClientRect();
          return { width: bounds.width, height: bounds.height };
        }),
      );
    expect(touchTargets).toHaveLength(3);
    expect(touchTargets.every(({ width, height }) => width >= 44 && height >= 44)).toBe(true);
  } else {
    await expect(jump).toBeHidden();
  }
  const resources = await page.evaluate(() =>
    performance.getEntriesByType('resource').map((entry) => {
      const resource = entry as PerformanceResourceTiming;
      return {
        name: resource.name,
        encoded: resource.encodedBodySize,
        decoded: resource.decodedBodySize,
        duration: resource.duration,
      };
    }),
  );
  const scripts = resources.filter((entry) => entry.name.endsWith('.js'));
  const styles = resources.filter((entry) => entry.name.endsWith('.css'));
  expect(scripts.length).toBeGreaterThan(0);
  expect(scripts.reduce((sum, entry) => sum + entry.encoded, 0)).toBeLessThan(90 * 1024);
  expect(scripts.reduce((sum, entry) => sum + entry.decoded, 0)).toBeLessThan(300 * 1024);
  expect(styles.reduce((sum, entry) => sum + entry.encoded, 0)).toBeLessThan(12 * 1024);
  expect(external).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await testInfo.attach('resource-timings', {
    body: JSON.stringify(resources, null, 2),
    contentType: 'application/json',
  });
  await page.screenshot({ path: testInfo.outputPath('first-item.png'), fullPage: true });
});

test('documents catalog recovery and the quantity limit', async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    'Additional manual screenshots use the desktop layout.',
  );
  test.setTimeout(60_000);
  await page.route('**/api/catalog', (route) => route.fulfill({ status: 503, body: '{}' }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'A small pause.' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('catalog-error.png'), fullPage: true });
  await page.unroute('**/api/catalog');
  await page.getByRole('button', { name: 'Reload collection' }).click();
  const add = page.getByRole('button', { name: 'Add Red Widget to basket' });
  for (let quantity = 0; quantity < 100; quantity += 1) await add.click();
  await expect(add).toBeDisabled();
  await expect(page.getByTestId('quote-total')).toHaveText('$2,471.00');
  await expect(page.getByText('Your basket has reached the 100-item limit.')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('limit.png'), fullPage: true });
  await page.getByRole('button', { name: 'Decrease Red Widget quantity' }).click();
  await expect(add).toBeEnabled();
});

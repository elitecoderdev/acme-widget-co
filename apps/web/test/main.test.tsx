import { expect, it, vi } from 'vitest';

const root = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock('react-dom/client', () => ({ createRoot: vi.fn(() => root) }));

it('mounts the application in strict mode', async () => {
  document.body.innerHTML = '<div id="root"></div>';
  const { createRoot } = await import('react-dom/client');
  await import('../src/main');
  expect(createRoot).toHaveBeenCalledWith(document.getElementById('root'));
  expect(root.render).toHaveBeenCalledOnce();
});

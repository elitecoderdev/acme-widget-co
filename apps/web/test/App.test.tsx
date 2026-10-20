import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { storeApi } from '../src/api';
import type { BasketQuote, Catalog } from '../src/api';
import { catalog, createApi, deferred, quote } from './fixtures';

afterEach(() => {
  vi.restoreAllMocks();
});

async function loadStore(api = createApi()) {
  const user = userEvent.setup();
  render(<App api={api} />);
  await screen.findByRole('heading', { name: 'Find your everyday.' });
  return { user, api };
}

describe('storefront', () => {
  it('shows loading while the catalog request is pending', async () => {
    const pending = deferred<Catalog>();
    const api = createApi();
    vi.mocked(api.catalog).mockReturnValue(pending.promise);
    render(<App api={api} />);
    expect(screen.getByRole('status')).toHaveTextContent('Getting the collection ready');
    await act(async () => {
      pending.resolve(catalog);
    });
    expect(screen.getByRole('heading', { name: 'Find your everyday.' })).toBeVisible();
  });

  it('uses the production HTTP adapter by default', async () => {
    vi.spyOn(storeApi, 'catalog').mockResolvedValue(catalog);
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Find your everyday.' })).toBeVisible();
    expect(storeApi.catalog).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it('provides an actionable catalog failure state', async () => {
    const api = createApi();
    vi.mocked(api.catalog).mockRejectedValueOnce(new Error('Offline'));
    const user = userEvent.setup();
    render(<App api={api} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('We couldn’t load the collection');
    await user.click(screen.getByRole('button', { name: 'Reload collection' }));
    expect(await screen.findByRole('heading', { name: 'Find your everyday.' })).toBeVisible();
  });

  it('presents the catalog, offer, delivery tiers, and empty basket accessibly', async () => {
    const { api } = await loadStore();
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main');
    for (const product of catalog.products) {
      expect(screen.getByRole('article', { name: product.name })).toBeVisible();
      expect(screen.getByRole('button', { name: `Add ${product.name} to basket` })).toBeEnabled();
    }
    expect(screen.getByText(catalog.offer.title)).toBeVisible();
    expect(screen.getByText('Standard delivery')).toBeVisible();
    expect(screen.getByText('Orders $50.00+')).toBeVisible();
    expect(screen.getByText('On us. Enjoy free delivery.')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Room for something good.' })).toBeVisible();
    expect(screen.getByText('No payment or checkout required.')).toBeVisible();
    expect(api.quote).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: /View basket/ })).not.toBeInTheDocument();
  });

  it('adds widgets with the keyboard and shows authoritative pricing', async () => {
    const { user, api } = await loadStore();
    const addButton = screen.getByRole('button', { name: 'Add Red Widget to basket' });
    addButton.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByText('1 item in your basket')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View basket, 1 item' })).toHaveAttribute(
      'href',
      '#basket',
    );
    expect(screen.getByRole('complementary')).toHaveAttribute('id', 'basket');
    expect(screen.getByRole('complementary')).toHaveAttribute('tabindex', '-1');
    await user.click(screen.getByRole('button', { name: 'Increase Red Widget quantity' }));
    expect(screen.getByLabelText('Red Widget quantity')).toHaveTextContent('2');
    expect(screen.getByRole('link', { name: 'View basket, 2 items' })).toBeInTheDocument();
    expect(await screen.findByTestId('quote-total')).toHaveTextContent('$54.37');
    expect(screen.getByText('−$16.48')).toBeVisible();
    expect(screen.getByText('Applied')).toBeVisible();
    expect(screen.getByText('$40.58')).toBeVisible();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '55');
    expect(api.quote).toHaveBeenLastCalledWith(
      [{ code: 'R01', quantity: 2 }],
      expect.any(AbortSignal),
    );
  });

  it('uses catalog-provided promotional identity and sample basket prices', async () => {
    const api = createApi();
    vi.mocked(api.catalog).mockResolvedValue({
      ...catalog,
      offer: {
        ...catalog.offer,
        productCode: 'G01',
        badge: 'Green duo benefit',
        label: 'Green duo discount',
      },
      examples: [
        {
          label: 'API-selected combination',
          totalCents: 12345,
          items: [{ code: 'G01', quantity: 3 }],
        },
      ],
    });
    const { user } = await loadStore(api);
    expect(
      within(screen.getByRole('article', { name: 'Green Widget' })).getByText('Green duo benefit'),
    ).toBeVisible();
    expect(
      within(screen.getByRole('article', { name: 'Red Widget' })).queryByText('Green duo benefit'),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'API-selected combination $123.45' }));
    expect(api.quote).toHaveBeenLastCalledWith(
      [{ code: 'G01', quantity: 3 }],
      expect.any(AbortSignal),
    );
    expect(await screen.findByText('Green duo discount')).toBeVisible();
    expect(screen.queryByRole('button', { name: /A pair of reds/ })).not.toBeInTheDocument();
  });

  it('decreases quantities, removes one item, and clears the basket', async () => {
    const { user, api } = await loadStore();
    await user.click(screen.getByRole('button', { name: 'Add Red Widget to basket' }));
    await user.click(screen.getByRole('button', { name: 'Add Green Widget to basket' }));
    await user.click(screen.getByRole('button', { name: 'Increase Red Widget quantity' }));
    await user.click(screen.getByRole('button', { name: 'Decrease Red Widget quantity' }));
    expect(screen.getByLabelText('Red Widget quantity')).toHaveTextContent('1');
    await user.click(screen.getByRole('button', { name: 'Remove Red Widget' }));
    expect(screen.queryByRole('button', { name: 'Remove Red Widget' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Green Widget quantity')).toHaveTextContent('1');
    await user.click(screen.getByRole('button', { name: 'Clear basket' }));
    expect(screen.getByRole('heading', { name: 'Room for something good.' })).toBeVisible();
    expect(screen.queryByTestId('quote-total')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /View basket/ })).not.toBeInTheDocument();
    expect(api.quote).not.toHaveBeenLastCalledWith([], expect.anything());
  });

  it('removes the last item when its quantity reaches zero', async () => {
    const { user } = await loadStore();
    await user.click(screen.getByRole('button', { name: 'Add Blue Widget to basket' }));
    await user.click(screen.getByRole('button', { name: 'Decrease Blue Widget quantity' }));
    expect(screen.getByRole('heading', { name: 'Room for something good.' })).toBeVisible();
  });

  it('shows a loading estimate without inventing totals', async () => {
    const pending = deferred<BasketQuote>();
    const api = createApi();
    vi.mocked(api.quote).mockReturnValue(pending.promise);
    const { user } = await loadStore(api);
    await user.click(screen.getByRole('button', { name: 'Add Red Widget to basket' }));
    expect(screen.getByText('Updating your estimate…')).toBeVisible();
    expect(screen.queryByTestId('quote-total')).not.toBeInTheDocument();
    await act(async () => {
      pending.resolve(quote);
    });
    expect(screen.getByTestId('quote-total')).toHaveTextContent('$54.37');
  });

  it('retains selections on a quote failure and retries', async () => {
    const api = createApi();
    vi.mocked(api.quote).mockRejectedValueOnce(new Error('Offline'));
    const { user } = await loadStore(api);
    await user.click(screen.getByRole('button', { name: 'Add Red Widget to basket' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your items are still here');
    expect(screen.getByLabelText('Red Widget quantity')).toHaveTextContent('1');
    await user.click(screen.getByRole('button', { name: /Try estimate again/ }));
    expect(await screen.findByTestId('quote-total')).toHaveTextContent('$54.37');
  });

  it('shows free delivery and omits discounts when none apply', async () => {
    const api = createApi();
    vi.mocked(api.quote).mockResolvedValue({
      ...quote,
      discountCents: 0,
      merchandiseCents: 9980,
      deliveryCents: 0,
      totalCents: 9980,
      freeDeliveryRemainingCents: 0,
    });
    const { user } = await loadStore(api);
    await user.click(screen.getByRole('button', { name: 'Add Green Widget to basket' }));
    expect(await screen.findByTestId('quote-total')).toHaveTextContent('$99.80');
    expect(screen.getByText('Free', { exact: true })).toBeVisible();
    expect(screen.getByText('free delivery.', { exact: true })).toBeVisible();
    expect(screen.queryByText('Applied')).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });

  it('replaces the selection with each specified acceptance basket', async () => {
    const { user, api } = await loadStore();
    for (const example of catalog.examples) {
      await user.click(
        screen.getByRole('button', { name: new RegExp(example.label.replace('+', '\\+')) }),
      );
      await waitFor(() =>
        expect(api.quote).toHaveBeenLastCalledWith(example.items, expect.any(AbortSignal)),
      );
      const basket = screen.getByRole('complementary');
      expect(within(basket).getAllByRole('listitem')).toHaveLength(example.items.length);
    }
  });

  it('enforces the item limit while keeping decrement and remove usable', async () => {
    const { api, user } = await loadStore();
    const addButton = screen.getByRole('button', { name: 'Add Red Widget to basket' });
    await act(async () => {
      for (let index = 0; index < 100; index += 1) fireEvent.click(addButton);
    });
    expect(screen.getByText('Your basket has reached the 100-item limit.')).toBeVisible();
    for (const product of catalog.products)
      expect(screen.getByRole('button', { name: `Add ${product.name} to basket` })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Increase Red Widget quantity' })).toBeDisabled();
    expect(api.quote).toHaveBeenLastCalledWith(
      [{ code: 'R01', quantity: 100 }],
      expect.any(AbortSignal),
    );
    await user.click(screen.getByRole('button', { name: 'Decrease Red Widget quantity' }));
    expect(addButton).toBeEnabled();
    expect(
      screen.queryByText('Your basket has reached the 100-item limit.'),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Red Widget quantity')).toHaveTextContent('99');
  });
});

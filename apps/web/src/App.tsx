import { useState } from 'react';
import { storeApi } from './api';
import type { BasketItem, BasketQuote, Catalog, Product, StoreApi } from './api';
import { changeQuantity, countItems, MAX_ITEMS, money } from './basket';
import { useCatalog, useQuote } from './useStore';
import type { LoadState } from './useStore';

const palettes = {
  red: { light: '#f19a87', face: '#ce604a', side: '#9d4033', dark: '#77352e' },
  green: { light: '#b8c5a4', face: '#809573', side: '#586e51', dark: '#394e34' },
  blue: { light: '#a4c5de', face: '#6a9fc7', side: '#477b9f', dark: '#2e5576' },
};

function WidgetArt({ color }: { color: Product['color'] }) {
  const palette = palettes[color];
  return (
    <svg className="widget-art" viewBox="0 0 260 205" aria-hidden="true">
      <ellipse cx="137" cy="176" rx="76" ry="12" fill="#26322d" opacity=".09" />
      <path d="M58 57 172 36q8-1 13 5l24 29-120 28Z" fill={palette.light} />
      <path d="m178 39 29 30q3 4 3 10v72q0 7-7 10l-27 14V65Z" fill={palette.side} />
      <path d="M61 57 175 45q8-1 8 8v109q0 8-8 9L61 183q-9 1-9-8V67q0-9 9-10" fill={palette.face} />
      <path
        d="m66 66 103-11q5 0 5 5v97q0 5-5 6L66 174q-5 1-5-5V72q0-5 5-6Z"
        fill="none"
        stroke={palette.light}
        strokeWidth="1.2"
        opacity=".6"
      />
      <path d="m78 81 77-8v66l-77 8Z" fill={palette.dark} opacity=".24" />
      <path d="m85 88 63-7v51l-63 7Z" fill={palette.dark} opacity=".28" />
      <path d="m94 101 9-1 9 17 9-19 9-1-15 31-7 1Z" fill={palette.light} />
      <g fill={palette.dark}>
        <ellipse cx="70" cy="79" rx="3.4" ry="3.8" />
        <ellipse cx="165" cy="69" rx="3.4" ry="3.8" />
        <ellipse cx="70" cy="160" rx="3.4" ry="3.8" />
        <ellipse cx="165" cy="150" rx="3.4" ry="3.8" />
      </g>
      <path d="m190 88 10-4v51l-10 5Z" fill={palette.dark} opacity=".55" />
      <path d="m92 55 56-7" stroke="#fff" opacity=".35" strokeWidth="2" />
    </svg>
  );
}

function Header() {
  return (
    <header className="site-header">
      <a className="brand" href="#main" aria-label="Acme Widget Co home">
        <span className="brand-mark" aria-hidden="true">
          a
        </span>
        <span>
          acme<span className="brand-subtitle">WIDGET CO.</span>
        </span>
      </a>
      <nav aria-label="Main navigation">
        <a href="#collection">The collection</a>
        <a href="#how-it-works">How it works</a>
      </nav>
      <span className="header-note">
        <span className="status-dot" />
        Simple by design.
      </span>
    </header>
  );
}

function ProductCard({
  product,
  offer,
  add,
  disabled,
}: {
  product: Product;
  offer: Catalog['offer'];
  add: () => void;
  disabled: boolean;
}) {
  return (
    <article
      className={`product-card product-${product.color}`}
      aria-labelledby={`product-${product.code}`}
    >
      <div className="product-visual">
        <span className="product-code">{product.code}</span>
        {product.code === offer.productCode && <span className="offer-badge">{offer.badge}</span>}
        <WidgetArt color={product.color} />
        <span className="visual-caption">THE ORIGINAL</span>
      </div>
      <div className="product-details">
        <div className="product-title-row">
          <h3 id={`product-${product.code}`}>{product.name}</h3>
          <span className={`swatch swatch-${product.color}`} aria-hidden="true" />
        </div>
        <p>{product.description}</p>
        <div className="product-action">
          <span className="price">{money(product.priceCents)}</span>
          <button
            className="add-button"
            onClick={add}
            disabled={disabled}
            aria-label={`Add ${product.name} to basket`}
          >
            <span aria-hidden="true">+</span> Add
          </button>
        </div>
      </div>
    </article>
  );
}

function QuoteSummary({
  state,
  retry,
  offerLabel,
}: {
  state: LoadState<BasketQuote>;
  retry: () => void;
  offerLabel: string;
}) {
  if (state.status === 'loading')
    return (
      <div className="quote-message" role="status">
        <span className="spinner" />
        Updating your estimate…
      </div>
    );
  if (state.status === 'error')
    return (
      <div className="quote-error" role="alert">
        <p>We couldn’t calculate your estimate. Your items are still here.</p>
        <button className="text-button" onClick={retry}>
          Try estimate again <span aria-hidden="true">↗</span>
        </button>
      </div>
    );
  const quote = state.data;
  const deliveryProgress = Math.round(
    (quote.merchandiseCents / (quote.merchandiseCents + quote.freeDeliveryRemainingCents)) * 100,
  );
  return (
    <div className="quote-summary">
      <dl className="totals">
        <div>
          <dt>Subtotal</dt>
          <dd>{money(quote.subtotalCents)}</dd>
        </div>
        {quote.discountCents > 0 && (
          <div className="discount">
            <dt>
              {offerLabel} <span className="applied-badge">Applied</span>
            </dt>
            <dd>−{money(quote.discountCents)}</dd>
          </div>
        )}
        <div>
          <dt>Delivery</dt>
          <dd>{quote.deliveryCents === 0 ? 'Free' : money(quote.deliveryCents)}</dd>
        </div>
        <div className="total-row">
          <dt>
            Estimated total <span>USD</span>
          </dt>
          <dd data-testid="quote-total">{money(quote.totalCents)}</dd>
        </div>
      </dl>
      <div className="delivery-progress">
        <progress
          className="progress-track"
          aria-label="Progress toward free delivery"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={deliveryProgress}
          value={deliveryProgress}
          max={100}
        >
          {deliveryProgress}%
        </progress>
        <p>
          {quote.freeDeliveryRemainingCents === 0 ? (
            <>
              You’ve unlocked <strong>free delivery.</strong>
            </>
          ) : (
            <>
              <strong>{money(quote.freeDeliveryRemainingCents)}</strong> away from free delivery.
            </>
          )}
        </p>
      </div>
      <p className="quote-caption">
        <span aria-hidden="true">✓</span> Offers and delivery calculated automatically
      </p>
    </div>
  );
}

function Store({ catalog, api }: { catalog: Catalog; api: StoreApi }) {
  const [items, setItems] = useState<BasketItem[]>([]);
  const { state, retry } = useQuote(api, items);
  const itemCount = countItems(items);
  const atLimit = itemCount >= MAX_ITEMS;
  const change = (code: string, delta: -1 | 1) =>
    setItems((current) => changeQuantity(current, code, delta));

  return (
    <>
      <section className="intro" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">EVERYDAY ESSENTIALS. EXCEPTIONALLY SIMPLE.</p>
          <h1 id="page-title">
            A little widget.
            <br />A lot of possibility.
          </h1>
          <p className="intro-copy">
            Original widgets. One simple idea. Find your favorites
            <br className="desktop-break" /> and we’ll take care of the little details.
          </p>
        </div>
        <div className="intro-detail">
          <span className="collection-number">
            01—{String(catalog.products.length).padStart(2, '0')}
          </span>
          <span>THE ORIGINAL COLLECTION</span>
          <span className="detail-line" />
        </div>
      </section>
      <div className="store-layout">
        <div className="collection-column">
          <section id="collection" aria-labelledby="collection-title">
            <div className="section-heading">
              <h2 id="collection-title">Find your everyday.</h2>
              <span>{catalog.products.length} thoughtfully simple widgets</span>
            </div>
            <div className="product-grid">
              {catalog.products.map((product) => (
                <ProductCard
                  key={product.code}
                  product={product}
                  offer={catalog.offer}
                  add={() => change(product.code, 1)}
                  disabled={atLimit}
                />
              ))}
            </div>
            <div className="offer-strip">
              <span className="offer-symbol" aria-hidden="true">
                ½
              </span>
              <div>
                <h3>{catalog.offer.title}</h3>
                <p>{catalog.offer.description}</p>
              </div>
              <span className="offer-auto">AUTOMATICALLY APPLIED</span>
            </div>
          </section>
          <section id="how-it-works" className="delivery-section" aria-labelledby="delivery-title">
            <div className="section-heading">
              <h2 id="delivery-title">Good things, delivered.</h2>
              <span>Based on your total after offers</span>
            </div>
            <div className="delivery-tiers">
              {catalog.deliveryRules.map((rule, index) => (
                <div className="delivery-tier" key={rule.minimumCents}>
                  <span className="tier-number">0{index + 1}</span>
                  <div>
                    <h3>
                      {rule.minimumCents === 0
                        ? 'Standard delivery'
                        : `Orders ${money(rule.minimumCents)}+`}
                    </h3>
                    <p>
                      {rule.chargeCents === 0
                        ? 'On us. Enjoy free delivery.'
                        : `${money(rule.chargeCents)} delivery`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="examples-section" aria-labelledby="examples-title">
            <div className="section-heading">
              <h2 id="examples-title">A few good combinations.</h2>
              <span>Try a sample basket</span>
            </div>
            <div className="example-grid">
              {catalog.examples.map((example) => (
                <button
                  className="example-button"
                  key={example.label}
                  onClick={() => setItems(example.items)}
                >
                  <span>
                    {example.label} <strong>{money(example.totalCents)}</strong>
                  </span>
                  <span aria-hidden="true">↗</span>
                </button>
              ))}
            </div>
            <p className="sample-note">
              Sample baskets replace your current selection. Prices include offers and delivery.
            </p>
          </section>
        </div>
        <aside id="basket" className="basket-panel" aria-labelledby="basket-title" tabIndex={-1}>
          <div className="basket-heading">
            <div>
              <h2 id="basket-title">
                Your basket <span className="basket-count">{itemCount}</span>
              </h2>
              <p>A little something, just for you.</p>
            </div>
            <svg width="22" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 8h14l1 13H4L5 8Z" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 9V6a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </div>
          <div className="basket-announcement" role="status" aria-live="polite">
            {itemCount} {itemCount === 1 ? 'item' : 'items'} in your basket
          </div>
          {items.length === 0 ? (
            <div className="empty-basket">
              <div className="empty-art" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <h3>Room for something good.</h3>
              <p>
                Pick a widget to get started.
                <br />
                We’ll work out the rest.
              </p>
              <a href="#collection" className="text-button">
                Explore the collection <span aria-hidden="true">↗</span>
              </a>
            </div>
          ) : (
            <>
              <ul className="basket-items">
                {items.map((item) => {
                  const product = catalog.products.find((entry) => entry.code === item.code)!;
                  return (
                    <li className="basket-item" key={item.code}>
                      <div className={`basket-thumbnail product-${product.color}`}>
                        <WidgetArt color={product.color} />
                      </div>
                      <div className="basket-item-info">
                        <div className="basket-item-top">
                          <h3>{product.name}</h3>
                          <button
                            className="remove-button"
                            aria-label={`Remove ${product.name}`}
                            onClick={() =>
                              setItems((current) =>
                                current.filter((entry) => entry.code !== item.code),
                              )
                            }
                          >
                            <span aria-hidden="true">×</span>
                          </button>
                        </div>
                        <p>{money(product.priceCents)} each</p>
                        <div className="basket-item-bottom">
                          <div className="quantity-control">
                            <button
                              aria-label={`Decrease ${product.name} quantity`}
                              onClick={() => change(item.code, -1)}
                            >
                              −
                            </button>
                            <span aria-label={`${product.name} quantity`}>{item.quantity}</span>
                            <button
                              aria-label={`Increase ${product.name} quantity`}
                              disabled={atLimit}
                              onClick={() => change(item.code, 1)}
                            >
                              +
                            </button>
                          </div>
                          <span>{money(product.priceCents * item.quantity)}</span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {atLimit && (
                <p className="limit-message" role="status">
                  Your basket has reached the {MAX_ITEMS}-item limit.
                </p>
              )}
              <QuoteSummary state={state} retry={retry} offerLabel={catalog.offer.label} />
              <button className="clear-button" onClick={() => setItems([])}>
                Clear basket
              </button>
            </>
          )}
          <div className="basket-footer">
            <span className="estimate-dot" />
            <p>
              A transparent estimate.
              <br />
              <span>No payment or checkout required.</span>
            </p>
          </div>
        </aside>
      </div>
      {itemCount > 0 && (
        <a
          className="mobile-basket-jump"
          href="#basket"
          aria-label={`View basket, ${itemCount} ${itemCount === 1 ? 'item' : 'items'}`}
        >
          <span className="mobile-basket-count" aria-hidden="true">
            {itemCount}
          </span>
          <span>View basket</span>
          <span className="mobile-basket-arrow" aria-hidden="true">
            ↓
          </span>
        </a>
      )}
    </>
  );
}

export function App({ api = storeApi }: { api?: StoreApi }) {
  const { state, retry } = useCatalog(api);
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Header />
      <main id="main" className="page-shell">
        {state.status === 'loading' && (
          <div className="page-message" role="status">
            <span className="spinner" />
            Getting the collection ready…
          </div>
        )}
        {state.status === 'error' && (
          <div className="page-message error-state" role="alert">
            <h1>A small pause.</h1>
            <p>We couldn’t load the collection. Please try again.</p>
            <button className="primary-button" onClick={retry}>
              Reload collection
            </button>
          </div>
        )}
        {state.status === 'ready' && <Store catalog={state.data} api={api} />}
      </main>
      <footer className="site-footer">
        <span>Acme Widget Co.</span>
        <span className="site-credit">
          Designed, implemented &amp; documented by elitecoderdev — Luis Jimenez
        </span>
        <span>All prices in USD.</span>
      </footer>
    </>
  );
}

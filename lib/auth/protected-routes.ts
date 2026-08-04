/**
 * Route prefixes that require an active, authenticated session.
 *
 * Centralising this list makes it harder to accidentally leave a new
 * admin/portal route unprotected. When a new top-level route group is
 * added under app/, add its URL prefix here if it should be gated.
 */
export const PROTECTED_ROUTE_PREFIXES = [
  '/dashboard',
  '/clients',
  '/invoices',
  '/settings',
  '/portal',
  '/quote-requests',
  '/emails',
  '/picker',
  '/driver',
  // Admin product/campaign management and recently-deleted recovery.
  '/admin',
  '/deleted',
] as const

/**
 * Exact admin product routes that need authentication.
 * Public product detail pages live at /products/{code} and must stay
 * crawlable, so /products is NOT used as a protected prefix.
 * Staff product CRUD now lives under /admin/products (covered by the
 * /admin prefix above); these patterns remain for legacy redirects.
 */
export const PROTECTED_PRODUCT_ROUTES = [
  /^\/products\/new$/,
  /^\/products\/seo$/,
  /^\/products\/[^/]+\/edit$/,
  /^\/products$/,
  /^\/admin\/products(?:\/.*)?$/,
  /^\/admin\/campaigns(?:\/.*)?$/,
] as const

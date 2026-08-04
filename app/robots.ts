// app/robots.ts
// Search-engine directives. Public marketing routes are crawlable;
// authenticated and admin routes are blocked so we don't waste crawl
// budget and don't leak private URLs.

import type { MetadataRoute } from 'next'
import { ADMIN_LOGIN_PATH } from '@/lib/auth/login-paths'

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') || 'https://www.starhawkbm.com'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        // `*` plus the major AI/answer-engine crawlers, all bound to the
        // SAME allow/disallow rule. Listing the AI bots explicitly signals
        // that their crawlers are welcome to read the public catalogue
        // (so the site can be cited in Gemini/AI Overviews/Perplexity),
        // while still keeping /api and auth routes blocked for everyone.
        userAgent: [
          '*',
          'GPTBot',
          'Google-Extended',
          'PerplexityBot',
          'ClaudeBot',
          'anthropic-ai',
          'Applebot-Extended',
          'CCBot',
          'Bytespider',
        ],
        // Slash-less paths — Next.js runs with `trailingSlash: false`,
        // so any trailing-slash variant 301s to the slash-less URL.
        allow: [
          '/',
          '/quote',
          '/products',
          '/catalogue',
          '/case-studies',
          '/blog',
          '/locations',
          '/services',
          '/about',
          '/contact',
          '/tools',
          '/guides',
          '/delivery',
          '/trade-account',
          '/reviews',
          '/glossary',
          '/sustainability',
          '/privacy',
          '/terms',
          '/returns',
        ],
        // ADMIN_LOGIN_PATH is sourced from env (default '/admin-login').
        // Disallowing it here keeps the operator sign-in page out of
        // search results even when the URL has been rotated.
        disallow: ['/api/', ADMIN_LOGIN_PATH, '/login', '/portal', '/invoices', '/invite', '/dashboard', '/admin'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
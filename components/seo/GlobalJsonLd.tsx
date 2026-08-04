// components/seo/GlobalJsonLd.tsx
// Global schema.org graph emitted once per page in the root layout.
// Provides the canonical Organization / LocalBusiness / WebSite entities that
// other pages reference via `@id` (e.g. `#business` on location pages).

import { loadSeoConfig, SITE_URL } from '@/lib/seo/company-seo'
import { loadCompany, getPrimaryChannelValue } from '@/lib/company'
import { toOpeningHoursSpecification } from '@/lib/opening-hours'
import { getConfiguredLogoPath } from '@/lib/logo'
import { JsonLd } from '@/components/seo/JsonLd'

export async function GlobalJsonLd() {
  const [seo, company, configuredLogoPath] = await Promise.all([
    loadSeoConfig().catch(() => null),
    loadCompany().catch(() => null),
    getConfiguredLogoPath().catch(() => '/Logo.png'),
  ])

  const siteUrl = seo?.siteUrl ?? SITE_URL
  const siteName = seo?.siteName ?? 'Star Hawk Builders Merchant'
  const phone = company ? getPrimaryChannelValue(company.phones) : null
  const email = company ? getPrimaryChannelValue(company.emails) : null

  const sameAs = seo?.sameAs && seo.sameAs.length > 0 ? seo.sameAs : []
  const logoPath = configuredLogoPath === '/Logo.webp' ? '/Logo.png' : configuredLogoPath
  const logo = logoPath.startsWith('http') ? logoPath : `${siteUrl}${logoPath}`

  const openingHours = company ? toOpeningHoursSpecification(company.openingHours) : []

  const address = company
    ? {
        '@type': 'PostalAddress' as const,
        streetAddress: company.address.streetAddress,
        addressLocality: company.address.addressLocality,
        addressRegion: company.address.addressRegion,
        postalCode: company.address.postalCode,
        addressCountry: 'GB',
      }
    : undefined

  const geo =
    seo?.geo?.latitude && seo?.geo?.longitude
      ? {
          '@type': 'GeoCoordinates' as const,
          latitude: seo.geo.latitude,
          longitude: seo.geo.longitude,
        }
      : undefined

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${siteUrl}/#website`,
        name: siteName,
        url: `${siteUrl}/`,
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${siteUrl}/catalogue?q={search_term_string}`,
          },
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'Organization',
        '@id': `${siteUrl}/#organization`,
        name: siteName,
        url: `${siteUrl}/`,
        logo,
        sameAs,
      },
      {
        '@type': ['LocalBusiness', 'BuildingMaterialsStore'],
        '@id': `${siteUrl}/#business`,
        name: siteName,
        url: `${siteUrl}/`,
        ...(phone ? { telephone: phone } : {}),
        ...(email ? { email } : {}),
        ...(address ? { address } : {}),
        ...(geo ? { geo } : {}),
        ...(openingHours.length > 0 ? { openingHoursSpecification: openingHours } : {}),
        ...(seo?.priceRange ? { priceRange: seo.priceRange } : {}),
        ...(seo?.mapsUrl ? { hasMap: seo.mapsUrl } : {}),
        sameAs,
      },
    ],
  }

  return <JsonLd id="ld-global" data={jsonLd} />
}

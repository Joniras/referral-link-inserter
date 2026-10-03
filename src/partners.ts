import {partnersFallback, type PartnersFeed, type PublicPartner} from './partners-fallback.js'

export type {PartnersFeed, PublicPartner}

export const PARTNERS_FEED_URL =
  'https://rechnerlotsen.com/data/affiliate-partners.json'

export const SUPPORT_BASE_URL = 'https://rechnerlotsen.com/support'

/** Refresh partner list at most every 6 hours. */
export const PARTNERS_REFRESH_MS = 6 * 60 * 60 * 1000

export type ConsentMode = 'always' | 'session' | 'snoozed' | 'never' | 'unset'

/**
 * Click-intercept action for a stored consent mode.
 * Landing already skips snoozed/never; click path must match (ignore, not ask).
 * `session` is legacy (until browser close); new „Ja, diesmal“ is one-shot without storage.
 */
export function clickActionForConsent(
  consent: ConsentMode,
): 'redirect' | 'ask' | 'ignore' {
  if (consent === 'always' || consent === 'session') {
    return 'redirect'
  }

  if (consent === 'snoozed' || consent === 'never') {
    return 'ignore'
  }

  return 'ask'
}

export const STORAGE_KEYS = {
  partnersCache: 'partnersCache',
  partnersFetchedAt: 'partnersFetchedAt',
  consentAlways: 'supportConsentAlways',
  consentNever: 'supportConsentNever',
  consentSnoozeUntil: 'supportConsentSnoozeUntil',
} as const

/** „Erstmal nicht“ — ask again after a few days. */
export const CONSENT_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000

export function getFallbackFeed(): PartnersFeed {
  return partnersFallback
}

export function hostMatches(hostname: string, host: string): boolean {
  const h = hostname.toLowerCase().replace(/^www\./, '')
  const target = host.toLowerCase().replace(/^www\./, '')
  return h === target || h.endsWith(`.${target}`)
}

export function findPartner(
  feed: PartnersFeed,
  urlString: string,
): {key: string; partner: PublicPartner} | undefined {
  let url: URL
  try {
    url = new URL(urlString)
  } catch {
    return undefined
  }

  for (const [key, partner] of Object.entries(feed.partners)) {
    if (partner.hosts.some((host) => hostMatches(url.hostname, host))) {
      return {key, partner}
    }
  }

  return undefined
}

/** Known affiliate query params; feed `param` wins when present. */
export function affiliateParamFor(key: string, partner?: PublicPartner): string {
  if (partner?.param && partner.param.trim()) {
    return partner.param.trim()
  }

  if (key === 'ebay') {
    return 'campid'
  }

  return 'tag'
}

/** True when the URL already carries any non-empty affiliate param (foreign or ours). */
export function hasExistingAffiliateTag(
  urlString: string,
  param: string,
): boolean {
  try {
    const url = new URL(urlString)
    const value = url.searchParams.get(param)
    return Boolean(value && value.trim())
  } catch {
    return false
  }
}

/** Build /support hop. `quiet` skips thank-you chrome for returning consented users. */
export function buildSupportUrl(
  dest: string,
  partnerKey: string,
  options: {quiet?: boolean} = {},
): string {
  const url = new URL(SUPPORT_BASE_URL)
  url.searchParams.set('dest', dest)
  url.searchParams.set('partner', partnerKey)
  if (options.quiet) {
    url.searchParams.set('quiet', '1')
  }

  return url.toString()
}

export function isValidPartnersFeed(value: unknown): value is PartnersFeed {
  if (!value || typeof value !== 'object') {
    return false
  }

  const feed = value as PartnersFeed
  if (typeof feed.version !== 'number' || !feed.partners || typeof feed.partners !== 'object') {
    return false
  }

  for (const partner of Object.values(feed.partners)) {
    if (!partner || typeof partner.label !== 'string' || !Array.isArray(partner.hosts)) {
      return false
    }
  }

  return true
}

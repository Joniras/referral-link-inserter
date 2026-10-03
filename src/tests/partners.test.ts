import test from 'ava'
import {
  affiliateParamFor,
  buildSupportUrl,
  clickActionForConsent,
  findPartner,
  getFallbackFeed,
  hasExistingAffiliateTag,
  hostMatches,
  isValidPartnersFeed,
} from '../partners.js'

test('hostMatches covers subdomains and www', (t) => {
  t.true(hostMatches('www.amazon.de', 'amazon.de'))
  t.true(hostMatches('smile.amazon.de', 'amazon.de'))
  t.true(hostMatches('amazon.de', 'amazon.de'))
  t.false(hostMatches('notamazon.de', 'amazon.de'))
  t.false(hostMatches('amazon.de.evil.com', 'amazon.de'))
})

test('findPartner resolves amazon and ebay from fallback feed', (t) => {
  const feed = getFallbackFeed()
  const amazon = findPartner(feed, 'https://www.amazon.de/dp/B00TEST1234')
  t.truthy(amazon)
  t.is(amazon?.key, 'amazon')
  t.is(amazon?.partner.label, 'Amazon')

  const ebay = findPartner(feed, 'https://www.ebay.at/itm/123456789012')
  t.truthy(ebay)
  t.is(ebay?.key, 'ebay')

  t.is(findPartner(feed, 'https://example.com/'), undefined)
})

test('buildSupportUrl encodes dest and partner', (t) => {
  const url = buildSupportUrl('https://www.amazon.de/dp/B00TEST1234', 'amazon')
  const parsed = new URL(url)
  t.is(parsed.origin, 'https://rechnerlotsen.com')
  t.is(parsed.pathname, '/support')
  t.is(parsed.searchParams.get('partner'), 'amazon')
  t.is(parsed.searchParams.get('dest'), 'https://www.amazon.de/dp/B00TEST1234')
  t.is(parsed.searchParams.get('quiet'), null)
})

test('buildSupportUrl quiet flag for returning consent', (t) => {
  const url = buildSupportUrl('https://www.amazon.de/dp/B00TEST', 'amazon', {quiet: true})
  t.is(new URL(url).searchParams.get('quiet'), '1')
})

test('clickActionForConsent matches landing for snooze/never', (t) => {
  t.is(clickActionForConsent('always'), 'redirect')
  t.is(clickActionForConsent('session'), 'redirect')
  t.is(clickActionForConsent('snoozed'), 'ignore')
  t.is(clickActionForConsent('never'), 'ignore')
  t.is(clickActionForConsent('unset'), 'ask')
})

test('hasExistingAffiliateTag detects foreign tags', (t) => {
  t.true(
    hasExistingAffiliateTag(
      'https://www.amazon.de/dp/B00TEST1234?tag=other-affiliate-21',
      'tag',
    ),
  )
  t.false(hasExistingAffiliateTag('https://www.amazon.de/dp/B00TEST1234', 'tag'))
  t.true(
    hasExistingAffiliateTag('https://www.ebay.de/itm/123?campid=1234567890', 'campid'),
  )
})

test('affiliateParamFor prefers feed param', (t) => {
  t.is(affiliateParamFor('amazon'), 'tag')
  t.is(affiliateParamFor('ebay'), 'campid')
  t.is(affiliateParamFor('skyscanner', {label: 'Sky', hosts: [], param: 'ref'}), 'ref')
})

test('isValidPartnersFeed validates shape', (t) => {
  t.true(isValidPartnersFeed(getFallbackFeed()))
  t.false(isValidPartnersFeed(null))
  t.false(isValidPartnersFeed({version: 1, partners: {amazon: {label: 'x'}}}))
})

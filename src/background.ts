import {
  clearConsent,
  loadPartnersFeed,
  refreshPartnersIfNeeded,
  resolveConsent,
  setConsentAlways,
  setConsentNever,
  setConsentSession,
  setConsentSnooze,
} from './consent.js'
import {
  affiliateParamFor,
  buildSupportUrl,
  clickActionForConsent,
  findPartner,
  hasExistingAffiliateTag,
  type PartnersFeed,
} from './partners.js'

const navigatingTabs = new Set<number>()
/** Last committed main-frame URL per tab — used to detect support→shop and in-shop browsing. */
const lastCommittedUrl = new Map<number, string>()
const LAST_URL_KEY = (tabId: number) => `navLastUrl:${tabId}`

function isSupportUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (
      parsed.hostname.endsWith('rechnerlotsen.com') &&
      parsed.pathname.startsWith('/support')
    )
  } catch {
    return url.includes('rechnerlotsen.com/support')
  }
}

function partnerKeyFor(feed: PartnersFeed, url: string): string | undefined {
  return findPartner(feed, url)?.key
}

/** Persist last URL so MV3 service-worker restarts still skip in-shop navigations. */
async function rememberCommittedUrl(tabId: number, url: string): Promise<void> {
  lastCommittedUrl.set(tabId, url)
  if (!chrome.storage?.session) {
    return
  }

  await new Promise<void>((resolve) => {
    chrome.storage.session.set({[LAST_URL_KEY(tabId)]: url}, () => {
      resolve()
    })
  })
}

async function recallCommittedUrl(tabId: number): Promise<string | undefined> {
  const cached = lastCommittedUrl.get(tabId)
  if (cached) {
    return cached
  }

  if (!chrome.storage?.session) {
    return undefined
  }

  const key = LAST_URL_KEY(tabId)
  const stored = await new Promise<Record<string, string>>((resolve) => {
    chrome.storage.session.get(key, (result) => {
      resolve(result as Record<string, string>)
    })
  })
  const url = stored[key]
  if (url) {
    lastCommittedUrl.set(tabId, url)
  }

  return url
}

async function forgetTab(tabId: number): Promise<void> {
  lastCommittedUrl.delete(tabId)
  navigatingTabs.delete(tabId)
  if (!chrome.storage?.session) {
    return
  }

  await new Promise<void>((resolve) => {
    chrome.storage.session.remove(LAST_URL_KEY(tabId), () => {
      resolve()
    })
  })
}

if (typeof chrome !== 'undefined') {
  const boot = async () => {
    await refreshPartnersIfNeeded(chrome)
  }

  boot().catch((error) => {
    console.warn('Partner feed refresh failed', error)
  })

  chrome.runtime.onInstalled.addListener(() => {
    void refreshPartnersIfNeeded(chrome, {force: true})
  })

  if (chrome.runtime.onStartup) {
    chrome.runtime.onStartup.addListener(() => {
      void refreshPartnersIfNeeded(chrome)
    })
  }

  chrome.tabs.onRemoved.addListener((tabId) => {
    void forgetTab(tabId)
  })

  chrome.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId !== 0) {
      return
    }

    void rememberCommittedUrl(details.tabId, details.url)
  })

  chrome.webNavigation.onBeforeNavigate.addListener((details) => {
    if (details.frameId !== 0) {
      return
    }

    void (async () => {
      try {
        if (navigatingTabs.has(details.tabId)) {
          return
        }

        const url = details.url
        if (isSupportUrl(url)) {
          return
        }

        const feed = await loadPartnersFeed(chrome)
        const match = findPartner(feed, url)
        if (!match) {
          return
        }

        const param = affiliateParamFor(match.key, match.partner)
        if (hasExistingAffiliateTag(url, param)) {
          return
        }

        const previous = await recallCommittedUrl(details.tabId)
        // Coming back from our thank-you page (with or without a tag) — do not bounce.
        if (previous && isSupportUrl(previous)) {
          return
        }

        // Already browsing this partner (product→product) — only intercept entry navigations.
        if (previous && partnerKeyFor(feed, previous) === match.key) {
          return
        }

        const consent = await resolveConsent(chrome)
        if (consent !== 'always' && consent !== 'session') {
          return
        }

        // Returning consented user — quiet hop (minimal /support chrome).
        const supportUrl = buildSupportUrl(url, match.key, {quiet: true})
        navigatingTabs.add(details.tabId)
        chrome.tabs.update(details.tabId, {url: supportUrl}, () => {
          setTimeout(() => {
            navigatingTabs.delete(details.tabId)
          }, 2000)
        })
      } catch (error) {
        console.warn('webNavigation handler failed', error)
      }
    })()
  })

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    void (async () => {
      try {
        switch (message?.type) {
          case 'getPartners': {
            const feed = await loadPartnersFeed(chrome)
            sendResponse({ok: true, feed})
            break
          }

          case 'refreshPartners': {
            const result = await refreshPartnersIfNeeded(chrome, {force: true})
            sendResponse({ok: true, ...result})
            break
          }

          case 'getConsent': {
            const consent = await resolveConsent(chrome)
            sendResponse({ok: true, consent})
            break
          }

          case 'setConsent': {
            if (message.value === 'always') {
              await setConsentAlways(chrome)
            } else if (message.value === 'session') {
              await setConsentSession(chrome)
            } else if (message.value === 'snooze') {
              await setConsentSnooze(chrome)
            } else if (message.value === 'never') {
              await setConsentNever(chrome)
            }

            sendResponse({ok: true})
            break
          }

          case 'clearConsent': {
            await clearConsent(chrome)
            sendResponse({ok: true})
            break
          }

          case 'resolveClick': {
            const feed = await loadPartnersFeed(chrome)
            const match = findPartner(feed, message.url)
            if (!match) {
              sendResponse({ok: true, action: 'ignore'})
              break
            }

            const param = affiliateParamFor(match.key, match.partner)
            if (hasExistingAffiliateTag(message.url, param)) {
              sendResponse({ok: true, action: 'ignore'})
              break
            }

            const pageUrl =
              typeof message.pageUrl === 'string' ? message.pageUrl : undefined
            if (pageUrl) {
              const pagePartner = findPartner(feed, pageUrl)
              if (pagePartner?.key === match.key) {
                sendResponse({ok: true, action: 'ignore'})
                break
              }

              if (hasExistingAffiliateTag(pageUrl, param)) {
                sendResponse({ok: true, action: 'ignore'})
                break
              }
            }

            const consent = await resolveConsent(chrome)
            const action = clickActionForConsent(consent)
            if (action === 'redirect') {
              sendResponse({
                ok: true,
                action: 'redirect',
                // Already consented — quiet hop so repeat support barely shows /support.
                supportUrl: buildSupportUrl(message.url, match.key, {quiet: true}),
                partnerKey: match.key,
                label: match.partner.label,
              })
              break
            }

            if (action === 'ignore') {
              // Match landing: after „Nie“ / „Erstmal nicht“, do not re-show the dialog.
              sendResponse({ok: true, action: 'ignore'})
              break
            }

            sendResponse({
              ok: true,
              action: 'ask',
              partnerKey: match.key,
              label: match.partner.label,
            })
            break
          }

          default: {
            sendResponse({ok: false, error: 'unknown_message'})
          }
        }
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    })()
    return true
  })
}

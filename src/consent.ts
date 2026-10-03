import {
  type ConsentMode,
  type PartnersFeed,
  CONSENT_SNOOZE_MS,
  PARTNERS_FEED_URL,
  PARTNERS_REFRESH_MS,
  STORAGE_KEYS,
  getFallbackFeed,
  isValidPartnersFeed,
} from './partners.js'

type ChromeLike = {
  storage: {
    local: {
      get: (keys: string | string[], cb: (result: Record<string, any>) => void) => void
      set: (items: Record<string, unknown>, cb?: () => void) => void
      remove: (keys: string | string[], cb?: () => void) => void
    }
    sync: {
      get: (keys: string | string[], cb: (result: Record<string, any>) => void) => void
      set: (items: Record<string, unknown>, cb?: () => void) => void
      remove: (keys: string | string[], cb?: () => void) => void
    }
    session?: {
      get: (keys: string | string[], cb: (result: Record<string, any>) => void) => void
      set: (items: Record<string, unknown>, cb?: () => void) => void
      remove: (keys: string | string[], cb?: () => void) => void
    }
  }
}

function localGet(chromeApi: ChromeLike, keys: string[]): Promise<Record<string, any>> {
  return new Promise((resolve) => {
    chromeApi.storage.local.get(keys, resolve)
  })
}

function localSet(chromeApi: ChromeLike, items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    chromeApi.storage.local.set(items, () => {
      resolve()
    })
  })
}

function syncGet(chromeApi: ChromeLike, keys: string[]): Promise<Record<string, any>> {
  return new Promise((resolve) => {
    chromeApi.storage.sync.get(keys, resolve)
  })
}

function syncSet(chromeApi: ChromeLike, items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    chromeApi.storage.sync.set(items, () => {
      resolve()
    })
  })
}

export async function fetchPartnersFeed(fetchImpl: typeof fetch = fetch): Promise<PartnersFeed> {
  const response = await fetchImpl(PARTNERS_FEED_URL, {
    cache: 'no-cache',
    credentials: 'omit',
  })
  if (!response.ok) {
    throw new Error(`Partners feed HTTP ${response.status}`)
  }

  const data: unknown = await response.json()
  if (!isValidPartnersFeed(data)) {
    throw new Error('Partners feed schema invalid')
  }

  return data
}

export async function loadPartnersFeed(chromeApi: ChromeLike): Promise<PartnersFeed> {
  const stored = await localGet(chromeApi, [STORAGE_KEYS.partnersCache])
  if (isValidPartnersFeed(stored[STORAGE_KEYS.partnersCache])) {
    return stored[STORAGE_KEYS.partnersCache] as PartnersFeed
  }

  return getFallbackFeed()
}

export async function refreshPartnersIfNeeded(
  chromeApi: ChromeLike,
  options: {force?: boolean; fetchImpl?: typeof fetch} = {},
): Promise<{feed: PartnersFeed; updated: boolean; error?: string; fetchedAt?: number}> {
  const stored = await localGet(chromeApi, [
    STORAGE_KEYS.partnersCache,
    STORAGE_KEYS.partnersFetchedAt,
  ])
  const fetchedAt = Number(stored[STORAGE_KEYS.partnersFetchedAt] || 0)
  const cacheValid =
    isValidPartnersFeed(stored[STORAGE_KEYS.partnersCache]) &&
    Date.now() - fetchedAt < PARTNERS_REFRESH_MS

  if (!options.force && cacheValid) {
    return {
      feed: stored[STORAGE_KEYS.partnersCache] as PartnersFeed,
      updated: false,
      fetchedAt,
    }
  }

  try {
    const feed = await fetchPartnersFeed(options.fetchImpl)
    const now = Date.now()
    await localSet(chromeApi, {
      [STORAGE_KEYS.partnersCache]: feed,
      [STORAGE_KEYS.partnersFetchedAt]: now,
    })
    return {feed, updated: true, fetchedAt: now}
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const fallback = isValidPartnersFeed(stored[STORAGE_KEYS.partnersCache])
      ? (stored[STORAGE_KEYS.partnersCache] as PartnersFeed)
      : getFallbackFeed()
    return {feed: fallback, updated: false, error: message, fetchedAt}
  }
}

export async function resolveConsent(chromeApi: ChromeLike): Promise<ConsentMode> {
  const sync = await syncGet(chromeApi, [
    STORAGE_KEYS.consentAlways,
    STORAGE_KEYS.consentNever,
    STORAGE_KEYS.consentSnoozeUntil,
  ])

  if (sync[STORAGE_KEYS.consentNever] === true) {
    return 'never'
  }

  if (sync[STORAGE_KEYS.consentAlways] === true) {
    return 'always'
  }

  const snoozeUntil = Number(sync[STORAGE_KEYS.consentSnoozeUntil] || 0)
  if (snoozeUntil > Date.now()) {
    return 'snoozed'
  }

  if (chromeApi.storage.session) {
    const session = await new Promise<Record<string, any>>((resolve) => {
      chromeApi.storage.session!.get('supportConsentSession', resolve)
    })
    if (session['supportConsentSession'] === true) {
      return 'session'
    }
  }

  const local = await localGet(chromeApi, ['supportConsentSessionLocal'])
  if (local['supportConsentSessionLocal'] === true) {
    return 'session'
  }

  return 'unset'
}

export async function setConsentAlways(chromeApi: ChromeLike): Promise<void> {
  await syncSet(chromeApi, {
    [STORAGE_KEYS.consentAlways]: true,
    [STORAGE_KEYS.consentNever]: false,
    [STORAGE_KEYS.consentSnoozeUntil]: 0,
  })
}

/**
 * Legacy „session until browser close“ consent.
 * New opt-in „Ja, diesmal“ is a true one-shot (no storage) — dialog navigates once
 * and does not call this. Kept so existing session prefs still auto-redirect.
 */
export async function setConsentSession(chromeApi: ChromeLike): Promise<void> {
  await syncSet(chromeApi, {
    [STORAGE_KEYS.consentAlways]: false,
    [STORAGE_KEYS.consentNever]: false,
    [STORAGE_KEYS.consentSnoozeUntil]: 0,
  })

  if (chromeApi.storage.session) {
    await new Promise<void>((resolve) => {
      chromeApi.storage.session!.set({supportConsentSession: true}, () => {
        resolve()
      })
    })
    return
  }

  await localSet(chromeApi, {supportConsentSessionLocal: true})
}

export async function setConsentSnooze(
  chromeApi: ChromeLike,
  durationMs: number = CONSENT_SNOOZE_MS,
): Promise<void> {
  await syncSet(chromeApi, {
    [STORAGE_KEYS.consentAlways]: false,
    [STORAGE_KEYS.consentNever]: false,
    [STORAGE_KEYS.consentSnoozeUntil]: Date.now() + durationMs,
  })
}

export async function setConsentNever(chromeApi: ChromeLike): Promise<void> {
  await syncSet(chromeApi, {
    [STORAGE_KEYS.consentAlways]: false,
    [STORAGE_KEYS.consentNever]: true,
    [STORAGE_KEYS.consentSnoozeUntil]: 0,
  })
}

export async function clearConsent(chromeApi: ChromeLike): Promise<void> {
  await new Promise<void>((resolve) => {
    chromeApi.storage.sync.remove(
      [STORAGE_KEYS.consentAlways, STORAGE_KEYS.consentNever, STORAGE_KEYS.consentSnoozeUntil],
      () => {
        resolve()
      },
    )
  })
  if (chromeApi.storage.session) {
    await new Promise<void>((resolve) => {
      chromeApi.storage.session!.remove('supportConsentSession', () => {
        resolve()
      })
    })
  }

  await new Promise<void>((resolve) => {
    chromeApi.storage.local.remove('supportConsentSessionLocal', () => {
      resolve()
    })
  })
}

import test from 'ava'
import sinon from 'sinon'
import {
  fetchPartnersFeed,
  loadPartnersFeed,
  refreshPartnersIfNeeded,
  resolveConsent,
  setConsentAlways,
  setConsentNever,
  setConsentSession,
  setConsentSnooze,
  clearConsent,
} from '../consent.js'
import {STORAGE_KEYS, getFallbackFeed} from '../partners.js'

function createChromeMock(initial: {
  local?: Record<string, any>
  sync?: Record<string, any>
  session?: Record<string, any>
} = {}) {
  const localStore: Record<string, any> = {...(initial.local ?? {})}
  const syncStore: Record<string, any> = {...(initial.sync ?? {})}
  const sessionStore: Record<string, any> = {...(initial.session ?? {})}

  return {
    storage: {
      local: {
        get: sinon.stub().callsFake((keys: string | string[], cb: (r: any) => void) => {
          const list = Array.isArray(keys) ? keys : [keys]
          const out: Record<string, any> = {}
          for (const key of list) {
            if (key in localStore) {
              out[key] = localStore[key]
            }
          }

          cb(out)
        }),
        set: sinon.stub().callsFake((items: Record<string, unknown>, cb?: () => void) => {
          Object.assign(localStore, items)
          cb?.()
        }),
        remove: sinon.stub().callsFake((keys: string | string[], cb?: () => void) => {
          const list = Array.isArray(keys) ? keys : [keys]
          for (const key of list) {
            delete localStore[key]
          }

          cb?.()
        }),
      },
      sync: {
        get: sinon.stub().callsFake((keys: string | string[], cb: (r: any) => void) => {
          const list = Array.isArray(keys) ? keys : [keys]
          const out: Record<string, any> = {}
          for (const key of list) {
            if (key in syncStore) {
              out[key] = syncStore[key]
            }
          }

          cb(out)
        }),
        set: sinon.stub().callsFake((items: Record<string, unknown>, cb?: () => void) => {
          Object.assign(syncStore, items)
          cb?.()
        }),
        remove: sinon.stub().callsFake((keys: string | string[], cb?: () => void) => {
          const list = Array.isArray(keys) ? keys : [keys]
          for (const key of list) {
            delete syncStore[key]
          }

          cb?.()
        }),
      },
      session: {
        get: sinon.stub().callsFake((keys: string | string[], cb: (r: any) => void) => {
          const list = Array.isArray(keys) ? keys : [keys]
          const out: Record<string, any> = {}
          for (const key of list) {
            if (key in sessionStore) {
              out[key] = sessionStore[key]
            }
          }

          cb(out)
        }),
        set: sinon.stub().callsFake((items: Record<string, unknown>, cb?: () => void) => {
          Object.assign(sessionStore, items)
          cb?.()
        }),
        remove: sinon.stub().callsFake((keys: string | string[], cb?: () => void) => {
          const list = Array.isArray(keys) ? keys : [keys]
          for (const key of list) {
            delete sessionStore[key]
          }

          cb?.()
        }),
      },
    },
    _localStore: localStore,
    _syncStore: syncStore,
  }
}

test('fetchPartnersFeed parses valid JSON', async (t) => {
  const feed = getFallbackFeed()
  const fetchImpl = sinon.stub().resolves({
    ok: true,
    json: async () => feed,
  }) as unknown as typeof fetch

  const result = await fetchPartnersFeed(fetchImpl)
  t.is(result.version, feed.version)
  t.truthy(result.partners['amazon'])
})

test('loadPartnersFeed uses cache then fallback', async (t) => {
  const feed = getFallbackFeed()
  const chromeWithCache = createChromeMock({
    local: {[STORAGE_KEYS.partnersCache]: feed},
  })
  t.deepEqual(await loadPartnersFeed(chromeWithCache as any), feed)

  const chromeEmpty = createChromeMock()
  const loaded = await loadPartnersFeed(chromeEmpty as any)
  t.is(loaded.partners['amazon']?.label, 'Amazon')
})

test('refreshPartnersIfNeeded writes cache on success', async (t) => {
  const feed = {
    version: 1,
    updatedAt: '2026-09-24',
    partners: {amazon: {label: 'Amazon', hosts: ['amazon.de']}},
  }
  const chromeApi = createChromeMock()
  const fetchImpl = sinon.stub().resolves({
    ok: true,
    json: async () => feed,
  }) as unknown as typeof fetch

  const result = await refreshPartnersIfNeeded(chromeApi as any, {force: true, fetchImpl})
  t.true(result.updated)
  t.deepEqual(chromeApi._localStore[STORAGE_KEYS.partnersCache], feed)
})

test('refreshPartnersIfNeeded falls back on fetch error', async (t) => {
  const chromeApi = createChromeMock()
  const fetchImpl = sinon.stub().rejects(new Error('network')) as unknown as typeof fetch
  const result = await refreshPartnersIfNeeded(chromeApi as any, {force: true, fetchImpl})
  t.false(result.updated)
  t.truthy(result.error)
  t.is(result.feed.partners['amazon']?.label, 'Amazon')
})

test('consent always and clear', async (t) => {
  const chromeApi = createChromeMock()
  t.is(await resolveConsent(chromeApi as any), 'unset')
  await setConsentAlways(chromeApi as any)
  t.is(await resolveConsent(chromeApi as any), 'always')
  await clearConsent(chromeApi as any)
  t.is(await resolveConsent(chromeApi as any), 'unset')
})

test('consent never and snooze', async (t) => {
  const chromeApi = createChromeMock()
  await setConsentNever(chromeApi as any)
  t.is(await resolveConsent(chromeApi as any), 'never')
  await clearConsent(chromeApi as any)

  await setConsentSnooze(chromeApi as any, 60_000)
  t.is(await resolveConsent(chromeApi as any), 'snoozed')
  await clearConsent(chromeApi as any)
  t.is(await resolveConsent(chromeApi as any), 'unset')
})

test('legacy session consent still resolves until cleared', async (t) => {
  const chromeApi = createChromeMock()
  await setConsentSession(chromeApi as any)
  t.is(await resolveConsent(chromeApi as any), 'session')
  await clearConsent(chromeApi as any)
  t.is(await resolveConsent(chromeApi as any), 'unset')
})

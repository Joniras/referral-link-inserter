import {
  PARTNERS_FEED_URL,
  STORAGE_KEYS,
  affiliateParamFor,
  getFallbackFeed,
  type PartnersFeed,
} from './partners.js'

function sendMessage<T>(message: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: T) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }

      resolve(response)
    })
  })
}

function formatConsent(value: string): string {
  switch (value) {
    case 'always': {
      return 'Immer unterstützen (always)'
    }

    case 'session': {
      return 'Nur diese Browser-Sitzung (ältere Einstellung)'
    }

    case 'snoozed': {
      return 'Erstmal nicht — wir fragen in ein paar Tagen nochmal'
    }

    case 'never': {
      return 'Nie fragen'
    }

    default: {
      return 'Noch nicht gewählt'
    }
  }
}

function formatConsentEffect(value: string): string {
  switch (value) {
    case 'always': {
      return 'Partner-Links und Adressleisten-Aufrufe gehen still über rechnerlotsen.com/support (kurze Weiterleitung). „Ja, diesmal“ speichert nichts und gilt nur für einen Klick.'
    }

    case 'session': {
      return 'Wie „immer“, aber nur bis der Browser geschlossen wird (ältere „diesmal“-Einstellung). Neue „Ja, diesmal“-Klicks speichern nichts mehr.'
    }

    case 'snoozed': {
      return 'Kein Popup und keine Weiterleitung, bis die Pause abgelaufen ist (3 Tage). Klicks gehen normal zum Shop.'
    }

    case 'never': {
      return 'Kein Popup und keine Weiterleitung. Kann hier zurückgesetzt werden.'
    }

    default: {
      return 'Beim nächsten Partner-Link erscheint das Opt-in. Esc schließt es und führt trotzdem zum Shop (ohne Support).'
    }
  }
}

async function refreshConsentUi(): Promise<void> {
  const status = document.querySelector('#consent-status')
  const effect = document.querySelector('#consent-effect')
  const response = await sendMessage<{ok: boolean; consent?: string}>({type: 'getConsent'})
  const consent = response.consent || 'unset'
  if (status) {
    status.textContent = formatConsent(consent)
  }

  if (effect) {
    effect.textContent = formatConsentEffect(consent)
  }
}

function renderPartners(feed: PartnersFeed): void {
  const list = document.querySelector('#partners-list')
  if (!list) {
    return
  }

  list.replaceChildren()

  for (const [key, partner] of Object.entries(feed.partners)) {
    const block = document.createElement('div')
    block.className = 'partner'

    const title = document.createElement('h3')
    title.textContent = `${partner.label} (${key})`
    block.append(title)

    const dl = document.createElement('dl')
    dl.className = 'debug'

    const param = affiliateParamFor(key, partner)
    const rows: Array<[string, string]> = [
      ['Key', key],
      ['Affiliate-Param', `${param}=… (ID nur auf der Website)`],
      ['Hosts', `${partner.hosts.length}`],
    ]

    for (const [label, value] of rows) {
      const dt = document.createElement('dt')
      dt.textContent = label
      const dd = document.createElement('dd')
      dd.textContent = value
      dl.append(dt, dd)
    }

    block.append(dl)

    const hosts = document.createElement('ul')
    hosts.className = 'hosts'
    for (const host of partner.hosts) {
      const li = document.createElement('li')
      li.textContent = host
      hosts.append(li)
    }

    block.append(hosts)
    list.append(block)
  }
}

async function refreshPartnersUi(): Promise<void> {
  const stored = await new Promise<Record<string, any>>((resolve) => {
    chrome.storage.local.get(
      [STORAGE_KEYS.partnersCache, STORAGE_KEYS.partnersFetchedAt],
      resolve,
    )
  })

  const cached = stored[STORAGE_KEYS.partnersCache] as PartnersFeed | undefined
  const fetchedAt = stored[STORAGE_KEYS.partnersFetchedAt] as number | undefined
  const usingCache = Boolean(cached?.partners)
  const feed = usingCache ? cached! : getFallbackFeed()

  const setText = (id: string, value: string) => {
    const el = document.querySelector(`#${id}`)
    if (el) {
      el.textContent = value
    }
  }

  setText(
    'feed-source',
    usingCache ? 'chrome.storage.local (von Website geladen)' : 'Bundled Fallback (noch kein erfolgreicher Sync)',
  )
  setText('feed-url', PARTNERS_FEED_URL)
  setText('feed-version', String(feed.version ?? '—'))
  setText('feed-updated', feed.updatedAt || '—')
  setText(
    'feed-synced',
    fetchedAt ? new Date(fetchedAt).toLocaleString('de-AT') : 'noch nie',
  )
  setText('feed-count', String(Object.keys(feed.partners || {}).length))

  renderPartners(feed)
}

document.addEventListener('DOMContentLoaded', () => {
  void refreshConsentUi()
  void refreshPartnersUi()

  document.querySelector('#reset-consent')?.addEventListener('click', () => {
    void (async () => {
      const feedback = document.querySelector('#consent-feedback')
      await sendMessage({type: 'clearConsent'})
      await refreshConsentUi()
      if (feedback) {
        feedback.textContent = 'Einwilligung zurückgesetzt.'
      }
    })()
  })

  document.querySelector('#refresh-partners')?.addEventListener('click', () => {
    void (async () => {
      const feedback = document.querySelector('#partners-feedback')
      const result = await sendMessage<{
        ok: boolean
        updated?: boolean
        error?: string
      }>({type: 'refreshPartners'})
      await refreshPartnersUi()
      if (feedback) {
        feedback.textContent = result.error
          ? `Aktualisierung fehlgeschlagen: ${result.error} (Cache/Fallback aktiv)`
          : result.updated
            ? 'Partner-Liste aktualisiert.'
            : 'Partner-Liste ist bereits aktuell.'
      }
    })()
  })
})

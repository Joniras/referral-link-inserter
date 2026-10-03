type PublicPartner = {
  label: string
  hosts: string[]
  param?: string
}

type PartnersFeed = {
  version: number
  updatedAt: string
  partners: Record<string, PublicPartner>
}

type ResolveResponse =
  | {ok: true; action: 'ignore'}
  | {
      ok: true
      action: 'redirect'
      supportUrl: string
      partnerKey: string
      label: string
    }
  | {ok: true; action: 'ask'; partnerKey: string; label: string}
  | {ok: false; error?: string}

const OVERLAY_ID = 'rl-support-optin-root'

let partnersFeed: PartnersFeed | undefined
let landingPromptShown = false

/** Pending original destination so Esc/backdrop dismiss still completes the click. */
let dismissDestUrl: string | undefined
let dismissOpenInNewTab = false
let dismissAlreadyOnDest = false

function assetUrl(path: string): string {
  return chrome.runtime.getURL(path)
}

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

function hostMatches(hostname: string, host: string): boolean {
  const h = hostname.toLowerCase().replace(/^www\./, '')
  const target = host.toLowerCase().replace(/^www\./, '')
  return h === target || h.endsWith(`.${target}`)
}

function affiliateParamFor(key: string, partner?: PublicPartner): string {
  if (partner?.param && partner.param.trim()) {
    return partner.param.trim()
  }

  if (key === 'ebay') {
    return 'campid'
  }

  return 'tag'
}

function hasExistingAffiliateTag(urlString: string, param: string): boolean {
  try {
    const url = new URL(urlString)
    const value = url.searchParams.get(param)
    return Boolean(value && value.trim())
  } catch {
    return false
  }
}

function findPartner(
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

async function refreshLocalFeed(): Promise<void> {
  try {
    const response = await sendMessage<{ok: boolean; feed?: PartnersFeed}>({
      type: 'getPartners',
    })
    if (response?.ok && response.feed) {
      partnersFeed = response.feed
    }
  } catch {
    // Keep last known feed.
  }
}

void refreshLocalFeed()
setInterval(() => {
  void refreshLocalFeed()
}, 30 * 60 * 1000)

function findAnchor(target: EventTarget | null): HTMLAnchorElement | null {
  if (!(target instanceof Element)) {
    return null
  }

  return target.closest('a[href]')
}

function shouldIgnoreModifierClick(event: MouseEvent): boolean {
  return (
    event.defaultPrevented ||
    event.button > 1 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
}

function clearDismissState(): void {
  dismissDestUrl = undefined
  dismissOpenInNewTab = false
  dismissAlreadyOnDest = false
}

/** Close overlay without navigating (chosen action or dismiss handles navigation). */
function removeOverlayOnly(): void {
  document.querySelector(`#${OVERLAY_ID}`)?.remove()
  document.removeEventListener('keydown', onEscapeKey, true)
  clearDismissState()
}

/**
 * Esc / backdrop: cancel support opt-in, but still go to the original untagged URL
 * so the user does not lose their click.
 */
function dismissOverlayContinueUntagged(): void {
  const destUrl = dismissDestUrl
  const openInNewTab = dismissOpenInNewTab
  const alreadyOnDest = dismissAlreadyOnDest
  removeOverlayOnly()
  if (!destUrl || alreadyOnDest) {
    return
  }

  if (openInNewTab) {
    window.open(destUrl, '_blank', 'noopener,noreferrer')
  } else {
    window.location.assign(destUrl)
  }
}

function onEscapeKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    dismissOverlayContinueUntagged()
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function isSupportPage(): boolean {
  return (
    window.location.hostname.endsWith('rechnerlotsen.com') &&
    window.location.pathname.startsWith('/support')
  )
}

function wireSupportOptOut(): void {
  if (!isSupportPage()) {
    return
  }

  document.addEventListener(
    'click',
    (event) => {
      const target = event.target
      if (!(target instanceof Element)) {
        return
      }

      const button = target.closest('[data-rl-reset-consent]')
      if (!(button instanceof HTMLElement)) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      const dest = button.getAttribute('data-dest') || ''
      void sendMessage({type: 'clearConsent'})
        .catch(() => undefined)
        .finally(() => {
          window.dispatchEvent(new CustomEvent('rl-support-cancel'))
          if (dest) {
            window.location.replace(dest)
          }
        })
    },
    true,
  )
}

wireSupportOptOut()

function showOptInOverlay(options: {
  label: string
  partnerKey: string
  destUrl: string
  openInNewTab: boolean
  alreadyOnDest?: boolean
}): void {
  removeOverlayOnly()

  dismissDestUrl = options.destUrl
  dismissOpenInNewTab = options.openInNewTab
  dismissAlreadyOnDest = Boolean(options.alreadyOnDest)

  const host = document.createElement('div')
  host.id = OVERLAY_ID
  host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;'
  const shadow = host.attachShadow({mode: 'open'})

  const logoSrc = assetUrl('brand/logo-icon.png')
  const fontSrc = assetUrl('fonts/Jost-VariableFont_wght.woff2')

  shadow.innerHTML = `
    <style>
      @font-face {
        font-family: "Jost";
        src: url("${fontSrc}") format("woff2");
        font-weight: 100 900;
        font-style: normal;
        font-display: swap;
      }

      :host, * { box-sizing: border-box; }

      .backdrop {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        background:
          radial-gradient(ellipse 80% 50% at 15% 0%, rgba(0, 120, 212, 0.28), transparent 55%),
          radial-gradient(ellipse 70% 45% at 100% 100%, rgba(152, 216, 170, 0.22), transparent 50%),
          rgba(10, 22, 40, 0.52);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        font-family: "Jost", "Segoe UI", system-ui, sans-serif;
        animation: rl-fade-in 180ms cubic-bezier(0.16, 1, 0.3, 1);
      }

      @keyframes rl-fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      @keyframes rl-rise {
        from { opacity: 0; transform: translateY(12px) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }

      .card {
        position: relative;
        width: min(440px, 100%);
        overflow: hidden;
        border-radius: 20px;
        background: #f9fcfe;
        color: #4a5d70;
        border: 1px solid rgba(10, 22, 40, 0.1);
        box-shadow:
          0 28px 70px -24px rgba(10, 22, 40, 0.45),
          0 0 0 1px rgba(255, 255, 255, 0.4) inset;
        padding: 28px 26px 22px;
        animation: rl-rise 220ms cubic-bezier(0.16, 1, 0.3, 1);
      }

      .card::before {
        content: "";
        position: absolute;
        inset: 0;
        pointer-events: none;
        background:
          radial-gradient(ellipse 90% 60% at 0% -10%, rgba(0, 120, 212, 0.14), transparent 55%),
          radial-gradient(ellipse 70% 50% at 110% 110%, rgba(152, 216, 170, 0.2), transparent 50%);
      }

      .inner { position: relative; }

      .brand {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 18px;
      }

      .brand img {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        box-shadow: 0 6px 16px rgba(0, 120, 212, 0.22);
      }

      .brand-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .kicker {
        margin: 0;
        color: #005a9e;
        font-size: 0.72rem;
        font-weight: 600;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .brand-name {
        margin: 0;
        color: #0a1628;
        font-size: 1rem;
        font-weight: 650;
        letter-spacing: -0.02em;
      }

      .title {
        margin: 0 0 10px;
        color: #0a1628;
        font-size: 1.35rem;
        font-weight: 650;
        letter-spacing: -0.03em;
        line-height: 1.2;
      }

      .body {
        margin: 0 0 22px;
        font-size: 0.98rem;
        line-height: 1.55;
        color: #4a5d70;
      }

      .body strong {
        color: #0a1628;
        font-weight: 650;
      }

      .actions {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      button {
        appearance: none;
        border: 0;
        border-radius: 999px;
        min-height: 48px;
        padding: 12px 18px;
        font: inherit;
        font-size: 0.98rem;
        font-weight: 600;
        letter-spacing: -0.01em;
        cursor: pointer;
        transition: background-color 160ms ease, color 160ms ease, border-color 160ms ease, transform 120ms ease;
      }

      button:active { transform: scale(0.985); }

      .primary {
        background: #0078d4;
        color: #fff;
      }
      .primary:hover { background: #005a9e; }

      .secondary {
        background: #d2e4f2;
        color: #0a1628;
      }
      .secondary:hover { background: #c2dff5; }

      .ghost {
        background: transparent;
        color: #6b7f92;
        font-size: 0.88rem;
        line-height: 1.35;
        min-height: 44px;
        white-space: normal;
      }
      .ghost:hover {
        background: rgba(10, 22, 40, 0.05);
        color: #2a3d52;
      }
      .ghost.muted {
        color: #8a9aab;
        font-weight: 500;
        min-height: 40px;
      }
      .ghost.muted:hover {
        color: #4a5d70;
      }

      .footnote {
        margin: 16px 0 0;
        font-size: 0.78rem;
        line-height: 1.4;
        color: #6b7f92;
        text-align: center;
      }
    </style>
    <div class="backdrop" part="backdrop">
      <div class="card" role="dialog" aria-modal="true" aria-labelledby="rl-optin-title">
        <div class="inner">
          <div class="brand">
            <img src="${logoSrc}" alt="" width="44" height="44" />
            <div class="brand-text">
              <p class="kicker">Open Source</p>
              <p class="brand-name">Partner Support</p>
            </div>
          </div>
          <h2 class="title" id="rl-optin-title">OpenSource Partner Support?</h2>
          <p class="body">
            Du warst gerade dabei, zu <strong>${escapeHtml(options.label)}</strong> zu gehen.
            Mit der Provision verbessern wir unseren Service und unterstützen zugleich
            Open-Source-Projekte, auf die wir setzen — ohne Mehrkosten für Dich.
          </p>
          <div class="actions">
            <button type="button" class="primary" data-action="always">Ja, immer</button>
            <button type="button" class="secondary" data-action="once">Ja, diesmal</button>
            <button type="button" class="ghost" data-action="snooze">Erstmal nicht (wir fragen in ein paar Tagen nochmal)</button>
            <button type="button" class="ghost muted" data-action="never">Nie</button>
          </div>
          <p class="footnote">
            Der Preis bleibt gleich. Gilt für unsere Partner-Shops (z. B. Amazon, eBay).
            Du kannst das jederzeit in den Erweiterungsoptionen ändern.
          </p>
        </div>
      </div>
    </div>
  `

  const go = (url: string) => {
    removeOverlayOnly()
    if (options.openInNewTab) {
      window.open(url, '_blank', 'noopener,noreferrer')
    } else {
      window.location.assign(url)
    }
  }

  shadow.querySelector('.backdrop')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) {
      dismissOverlayContinueUntagged()
    }
  })

  document.addEventListener('keydown', onEscapeKey, true)

  for (const button of shadow.querySelectorAll('button[data-action]')) {
    button.addEventListener('click', () => {
      void (async () => {
        const action = (button as HTMLButtonElement).dataset['action']
        if (action === 'snooze' || action === 'never') {
          await sendMessage({
            type: 'setConsent',
            value: action === 'never' ? 'never' : 'snooze',
          })
          if (options.alreadyOnDest) {
            removeOverlayOnly()
            return
          }

          go(options.destUrl)
          return
        }

        if (action === 'always') {
          await sendMessage({type: 'setConsent', value: 'always'})
        }
        // „Ja, diesmal“ = true one-shot: do not store session/always.
        // Only this navigation goes through /support; later clicks ask again.

        // First opt-in from dialog: keep a brief thank-you (no quiet=1).
        const supportUrl = `https://rechnerlotsen.com/support?dest=${encodeURIComponent(options.destUrl)}&partner=${encodeURIComponent(options.partnerKey)}`
        go(supportUrl)
      })()
    })
  }

  document.documentElement.append(host)
  ;(shadow.querySelector('button.primary') as HTMLButtonElement | null)?.focus()
}

async function maybePromptOnPartnerLanding(): Promise<void> {
  if (landingPromptShown || isSupportPage() || document.querySelector(`#${OVERLAY_ID}`)) {
    return
  }

  if (!partnersFeed) {
    await refreshLocalFeed()
  }

  if (!partnersFeed) {
    return
  }

  const match = findPartner(partnersFeed, window.location.href)
  if (!match) {
    return
  }

  const param = affiliateParamFor(match.key, match.partner)
  if (hasExistingAffiliateTag(window.location.href, param)) {
    return
  }

  const consentResponse = await sendMessage<{ok: boolean; consent?: string}>({
    type: 'getConsent',
  })
  if (!consentResponse?.ok) {
    return
  }

  if (consentResponse.consent === 'always' || consentResponse.consent === 'session') {
    // Entry redirects are handled by webNavigation. Re-routing here caused an
    // infinite loop when /support forwarded without an affiliate tag (empty ID).
    return
  }

  if (consentResponse.consent === 'never' || consentResponse.consent === 'snoozed') {
    return
  }

  if (consentResponse.consent !== 'unset') {
    return
  }

  // If we just came from the thank-you page, don't ask again on this load.
  if (document.referrer.includes('rechnerlotsen.com/support')) {
    return
  }

  landingPromptShown = true
  showOptInOverlay({
    label: match.partner.label,
    partnerKey: match.key,
    destUrl: window.location.href,
    openInNewTab: false,
    alreadyOnDest: true,
  })
}

void refreshLocalFeed().then(() => {
  void maybePromptOnPartnerLanding().catch(() => undefined)
})

document.addEventListener(
  'click',
  (event) => {
    if (shouldIgnoreModifierClick(event)) {
      return
    }

    const anchor = findAnchor(event.target)
    if (!anchor?.href) {
      return
    }

    let absolute: URL
    try {
      absolute = new URL(anchor.href, window.location.href)
    } catch {
      return
    }

    if (absolute.protocol !== 'http:' && absolute.protocol !== 'https:') {
      return
    }

    if (absolute.hostname.endsWith('rechnerlotsen.com') && absolute.pathname.startsWith('/support')) {
      return
    }

    const feed = partnersFeed
    const match = feed ? findPartner(feed, absolute.href) : undefined
    if (!match || !feed) {
      return
    }

    const param = affiliateParamFor(match.key, match.partner)
    // Destination already tagged (ours or foreign) — leave it alone.
    if (hasExistingAffiliateTag(absolute.href, param)) {
      return
    }

    // Already shopping on this partner: Amazon/eBay strip tags from many
    // in-site links; do not re-ask or bounce through /support again.
    const currentPartner = findPartner(feed, window.location.href)
    if (currentPartner?.key === match.key) {
      return
    }

    // Current page already carries a tag for this partner (rare cross-host case).
    if (hasExistingAffiliateTag(window.location.href, param)) {
      return
    }

    const openInNewTab = anchor.target === '_blank'
    event.preventDefault()
    event.stopPropagation()

    void sendMessage<ResolveResponse>({
      type: 'resolveClick',
      url: absolute.href,
      pageUrl: window.location.href,
    })
      .then((response) => {
        if (!response?.ok || response.action === 'ignore') {
          if (openInNewTab) {
            window.open(absolute.href, '_blank', 'noopener,noreferrer')
          } else {
            window.location.assign(absolute.href)
          }

          return
        }

        if (response.action === 'redirect') {
          if (openInNewTab) {
            window.open(response.supportUrl, '_blank', 'noopener,noreferrer')
          } else {
            window.location.assign(response.supportUrl)
          }

          return
        }

        showOptInOverlay({
          label: response.label,
          partnerKey: response.partnerKey,
          destUrl: absolute.href,
          openInNewTab,
        })
      })
      .catch(() => {
        window.location.assign(absolute.href)
      })
  },
  true,
)

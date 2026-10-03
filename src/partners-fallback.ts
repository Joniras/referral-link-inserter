export type PublicPartner = {
  label: string
  hosts: string[]
  /** Affiliate query param name (public; not the ID). */
  param?: string
}

export type PartnersFeed = {
  version: number
  updatedAt: string
  partners: Record<string, PublicPartner>
}

/** Bundled snapshot used when the live feed is unreachable. */
export const partnersFallback: PartnersFeed = {
  version: 1,
  updatedAt: '2026-09-24',
  partners: {
    amazon: {
      label: 'Amazon',
      param: 'tag',
      hosts: [
        'amazon.de',
        'amazon.com',
        'amazon.co.uk',
        'amazon.fr',
        'amazon.it',
        'amazon.es',
        'amazon.nl',
        'amazon.ca',
        'amazon.com.au',
        'amazon.com.br',
        'amazon.com.mx',
        'amazon.com.tr',
        'amazon.com.ar',
        'amazon.ae',
        'amazon.sg',
        'amazon.sa',
        'amazon.co.jp',
        'amazon.at',
      ],
    },
    ebay: {
      label: 'eBay',
      param: 'campid',
      hosts: [
        'ebay.de',
        'ebay.at',
        'ebay.com',
        'ebay.co.uk',
        'ebay.fr',
        'ebay.it',
        'ebay.es',
        'ebay.ca',
        'ebay.com.au',
      ],
    },
  },
}

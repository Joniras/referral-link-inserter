type StorageItems = Record<string, any>

document.addEventListener('DOMContentLoaded', async () => {
  await restoreOptions()
  const inputElement = document.querySelector<HTMLInputElement>(
    '#amazon-affiliate-id',
  )
  if (inputElement) {
    inputElement.addEventListener('input', handleInputChange)
  }
  const ebayInputElement = document.querySelector<HTMLInputElement>(
    '#ebay-affiliate-id',
  )
  if (ebayInputElement) {
    ebayInputElement.addEventListener('input', handleInputChange)
  }
})

let amazonAffiliateId = ''
let ebayAffiliateId = ''

export async function saveOptions(): Promise<void> {
  await chrome.storage.sync.set({amazonAffiliateId, ebayAffiliateId})
  console.log('Options saved:', {amazonAffiliateId, ebayAffiliateId})
}

export async function restoreOptions(): Promise<void> {
  const items: StorageItems = await new Promise((resolve) => {
    chrome.storage.sync.get({amazonAffiliateId: '', ebayAffiliateId: ''}, resolve)
  })

  const amazonAffiliateIdInput = document.querySelector<HTMLInputElement>(
    '#amazon-affiliate-id',
  )
  if (amazonAffiliateIdInput) {
    amazonAffiliateIdInput.value = items['amazonAffiliateId'] || ''
    amazonAffiliateIdInput.setAttribute(
      'placeholder',
      items['amazonAffiliateId']?.length > 0
        ? items['amazonAffiliateId']
        : 'Enter your Amazon affiliate ID',
    )
    amazonAffiliateId = items['amazonAffiliateId']
  }

  const ebayAffiliateIdInput = document.querySelector<HTMLInputElement>(
    '#ebay-affiliate-id',
  )
  if (ebayAffiliateIdInput) {
    ebayAffiliateIdInput.value = items['ebayAffiliateId'] || ''
    ebayAffiliateIdInput.setAttribute(
      'placeholder',
      items['ebayAffiliateId']?.length > 0
        ? items['ebayAffiliateId']
        : 'Enter your eBay campaign ID',
    )
    ebayAffiliateId = items['ebayAffiliateId']
  }
}

export async function handleInputChange(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement
  if (target) {
    if (target.id === 'amazon-affiliate-id') {
      amazonAffiliateId = target.value
    }
    if (target.id === 'ebay-affiliate-id') {
      ebayAffiliateId = target.value
    }
    await saveOptions()
  }
}

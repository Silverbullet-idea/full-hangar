export const CATEGORIES = [
  { label: 'All Aircraft', value: null },
  { label: 'Single Engine', value: 'single' },
  { label: 'Multi-Engine', value: 'multi' },
  { label: 'Turboprop', value: 'turboprop' },
  { label: 'Jet', value: 'jet' },
  { label: 'Helicopter', value: 'helicopter' },
  { label: 'Light Sport', value: 'lsp' },
  { label: 'Amphibian', value: 'sea' },
] as const

export const TOP_MENU_MIN_COUNT = 10

export type CategoryValue = (typeof CATEGORIES)[number]['value']

export type ListingSourceKey =
  | 'trade-a-plane'
  | 'controller'
  | 'aerotrader'
  | 'aircraftforsale'
  | 'aso'
  | 'globalair'
  | 'barnstormers'
  | 'controller_cdp'
  | 'unknown'

const includesAny = (text: string, terms: string[]) => {
  const normalized = text.toLowerCase()
  return terms.some((term) => normalized.includes(term.toLowerCase()))
}

export const deriveModelFamily = (modelRaw: string) => {
  const model = modelRaw.trim().toUpperCase()
  if (!model) return ''
  const firstToken = model.split(/\s+/)[0] ?? model
  const digits = firstToken.match(/\d{2,4}/)?.[0]
  if (digits) return digits
  const alphaNumericRoot = firstToken.match(/^[A-Z]{1,3}\d{2,4}/)?.[0]
  if (alphaNumericRoot) return alphaNumericRoot
  return firstToken.replace(/[^A-Z0-9]/g, '')
}

export const inferCategoriesForMakeModel = (makeRaw: string, modelRaw: string): Array<Exclude<CategoryValue, null>> => {
  const make = makeRaw.toLowerCase()
  const model = modelRaw.toLowerCase()
  const categories: Array<Exclude<CategoryValue, null>> = []

  if (
    includesAny(model, ['twin', 'seneca', 'aztec', 'baron', '310', '340', '402', '414', '421']) ||
    includesAny(make, ['tecnam p2006', 'diamond da42', 'diamond da62'])
  ) categories.push('multi')

  if (
    includesAny(make, ['pilatus', 'tbm', 'daher']) ||
    includesAny(model, ['king air', 'caravan', 'meridian', 'kodiak'])
  ) categories.push('turboprop')

  if (
    includesAny(make, ['citation', 'learjet', 'gulfstream', 'embraer', 'bombardier', 'dassault', 'hawker']) ||
    includesAny(model, ['citation', 'phenom', 'hondajet', 'eclipse', 'premier'])
  ) categories.push('jet')

  if (
    includesAny(make, ['robinson', 'bell', 'sikorsky', 'eurocopter', 'airbus helicopter', 'md helicopters', 'schweizer'])
  ) categories.push('helicopter')

  if (
    includesAny(model, ['lsa', 'light sport']) ||
    includesAny(make, ['flight design', 'tecnam', 'jabiru', 'pipistrel'])
  ) categories.push('lsp')

  if (includesAny(model, ['sea', 'float', 'amphibian', 'seaplane']) || includesAny(make, ['icon', 'lake'])) {
    categories.push('sea')
  }

  if (categories.length === 0) categories.push('single')
  return categories
}

export const normalizeSourceKey = (sourceRaw: string): ListingSourceKey => {
  const value = sourceRaw.trim().toLowerCase()
  if (!value) return 'unknown'
  if (value === 'tap' || value === 'trade-a-plane' || value === 'tradaplane') return 'trade-a-plane'
  if (value === 'controller_cdp') return 'controller_cdp'
  if (value === 'controller' || value === 'ctrl' || value.startsWith('controller_')) return 'controller'
  if (value === 'aerotrader' || value === 'aero_trader') return 'aerotrader'
  if (value === 'aircraftforsale' || value === 'aircraft_for_sale' || value === 'afs') return 'aircraftforsale'
  if (value === 'aso') return 'aso'
  if (value === 'globalair' || value === 'global_air') return 'globalair'
  if (value === 'barnstormers') return 'barnstormers'
  return 'unknown'
}

export const collectImageCandidates = (listing: any) => {
  const candidates: string[] = []

  const addImage = (value: unknown) => {
    if (typeof value !== 'string') return
    const trimmed = value.trim()
    if (!trimmed) return
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return
    candidates.push(trimmed)
  }

  addImage(listing.primary_image_url)

  const rawImageUrls = listing.image_urls
  if (Array.isArray(rawImageUrls)) {
    rawImageUrls.forEach(addImage)
  } else if (typeof rawImageUrls === 'string' && rawImageUrls.trim()) {
    try {
      const parsed = JSON.parse(rawImageUrls)
      if (Array.isArray(parsed)) parsed.forEach(addImage)
      else addImage(rawImageUrls)
    } catch {
      addImage(rawImageUrls)
    }
  }

  return Array.from(new Set(candidates))
}

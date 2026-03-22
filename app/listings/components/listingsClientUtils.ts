export const CATEGORIES = [
  { label: 'All Aircraft', value: null },
  { label: 'Single Engine', value: 'single' },
  { label: 'Multi-Engine', value: 'multi' },
  { label: 'SE Turboprop', value: 'se_turboprop' },
  { label: 'ME Turboprop', value: 'me_turboprop' },
  { label: 'Jet', value: 'jet' },
  { label: 'Helicopter', value: 'helicopter' },
  { label: 'Light Sport', value: 'lsp' },
  { label: 'Amphibian', value: 'sea' },
] as const

export const TOP_MENU_MIN_COUNT = 10

export type CategoryValue = (typeof CATEGORIES)[number]['value'] | 'turboprop'

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

const HELICOPTER_MAKE_TERMS = [
  'robinson',
  'bell',
  'sikorsky',
  'eurocopter',
  'airbus helicopter',
  'airbus helicopters',
  'md helicopters',
  'schweizer',
  'agusta',
  'agustawestland',
  'leonardo',
  'enstrom',
  'kaman',
  'hughes helicopter',
]

const HELICOPTER_MODEL_TERMS = [
  'r22',
  'r44',
  'r66',
  'ec120',
  'ec130',
  'ec135',
  'h125',
  'as350',
  'uh-',
  'aw109',
  'aw119',
  'aw139',
  'md500',
  'rotorcraft',
  'helicopter',
]

const hasWholeWord = (text: string, word: string) => {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`\\b${escaped}\\b`, "i").test(text)
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
  const isHelicopter =
    includesAny(make, HELICOPTER_MAKE_TERMS) ||
    includesAny(model, HELICOPTER_MODEL_TERMS)

  // Rotorcraft should only appear in the helicopter lane and never leak into fixed-wing categories.
  if (isHelicopter) {
    categories.push('helicopter')
    return categories
  }

  const isMultiEngineModel = includesAny(model, ['twin', 'seneca', 'aztec', 'baron', '310', '340', '402', '414', '421'])
  const isMultiEngineMake = includesAny(make, ['tecnam p2006', 'diamond da42', 'diamond da62'])
  const isSingleTurboprop =
    includesAny(make, ['pilatus', 'tbm', 'daher', 'socata', 'quest']) ||
    includesAny(model, [
      'pc-12',
      'pc12',
      'tbm',
      'caravan',
      'grand caravan',
      '208',
      'kodiak',
      'meridian',
      'm500',
      'm600',
      'jetprop',
      'turbine',
      'setp',
    ])
  const isMultiTurboprop =
    includesAny(model, [
      'king air',
      'conquest',
      'cheyenne',
      'mu-2',
      'mu2',
      'twin otter',
      'commander 690',
      'metro',
      'metroliner',
      '441',
    ]) ||
    includesAny(make, ['mitsubishi', 'swearingen'])

  const isJet =
    includesAny(make, ['citation', 'learjet', 'gulfstream', 'embraer', 'bombardier', 'dassault', 'hawker']) ||
    includesAny(model, ['citation', 'phenom', 'hondajet', 'eclipse', 'premier', 'pc-24', 'pc24'])

  if (
    isMultiEngineModel ||
    isMultiEngineMake
  ) categories.push('multi')

  if (!isJet) {
    if (isSingleTurboprop && !isMultiTurboprop) categories.push('se_turboprop')
    if (isMultiTurboprop) categories.push('me_turboprop')
  }

  if (
    isJet
  ) categories.push('jet')

  if (
    includesAny(make, HELICOPTER_MAKE_TERMS) ||
    includesAny(model, HELICOPTER_MODEL_TERMS)
  ) categories.push('helicopter')

  if (
    includesAny(model, ['lsa', 'light sport']) ||
    includesAny(make, ['flight design', 'tecnam', 'jabiru', 'pipistrel'])
  ) categories.push('lsp')

  const isAmphibian =
    includesAny(model, ['seaplane', 'amphib', 'float', 'flying boat', 'searey', 'sea rey', 'a5']) ||
    hasWholeWord(model, 'amphibian') ||
    includesAny(make, ['icon', 'lake', 'seawind', 'progressive aerodyne'])

  if (isAmphibian) {
    categories.push('sea')
  }

  if (categories.length === 0) categories.push('single')
  return categories
}

export const normalizeTopMenuMakeLabel = (makeRaw: string, modelRaw: string) => {
  const make = makeRaw.trim()
  const model = modelRaw.trim().toLowerCase()
  if (!make) return make
  const lower = make.toLowerCase()

  // Guard against fragmented make labels from some sources.
  if (lower === 'grand' && model.includes('caravan')) return 'Cessna'
  if (lower === 'm-class' || lower === 'm class') return 'Piper'
  if (lower === 'king air') return 'Beechcraft'

  return make
}

export const isLikelyHelicopterMake = (makeRaw: string) => {
  const make = makeRaw.trim().toLowerCase()
  if (!make) return false
  return includesAny(make, HELICOPTER_MAKE_TERMS)
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

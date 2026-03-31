/**
 * Seller intake wizard — shared form state and submission shape.
 * Platform-specific extras are folded into `description_intelligence.seller_form_extras`
 * until dedicated DB columns exist.
 */

export type SellerSaleType = "for_sale" | "for_lease" | "fractional"

export type SellerCondition = "used" | "new" | "project" | "not_specified"

export type UsefulLoadUnit = "lb" | "kg"

export type SellerType = "private" | "broker"

export const FRACTIONAL_SHARE_OPTIONS = [
  "none",
  "1/2",
  "1/3",
  "1/4",
  "1/5",
  "1/6",
  "1/7",
  "1/8",
  "1/9",
  "1/10",
  "1/11",
  "1/12",
  "1/13",
  "1/14",
  "1/15",
  "1/16",
  "1/17",
  "1/18",
  "1/19",
  "1/20",
] as const

export const SELLER_COUNTRY_OPTIONS = [
  "United States",
  "Canada",
  "Mexico",
  "United Kingdom",
  "Australia",
  "Germany",
  "France",
  "Brazil",
  "Other",
] as const

export const US_STATE_OPTIONS: { code: string; name: string }[] = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
  { code: "DC", name: "District of Columbia" },
]

export const CA_PROVINCE_OPTIONS = [
  { code: "AB", name: "Alberta" },
  { code: "BC", name: "British Columbia" },
  { code: "MB", name: "Manitoba" },
  { code: "NB", name: "New Brunswick" },
  { code: "NL", name: "Newfoundland and Labrador" },
  { code: "NS", name: "Nova Scotia" },
  { code: "ON", name: "Ontario" },
  { code: "PE", name: "Prince Edward Island" },
  { code: "QC", name: "Quebec" },
  { code: "SK", name: "Saskatchewan" },
  { code: "NT", name: "Northwest Territories" },
  { code: "NU", name: "Nunavut" },
  { code: "YT", name: "Yukon" },
]

export const TIME_STATUS_OPTIONS = ["TSOH", "SMOH", "SNEW", "Unknown"] as const

export type SellerPhotoMeta = {
  id: string
  name: string
  size: number
}

export type SellerLogMeta = {
  id: string
  name: string
  size: number
}

/** Full wizard state — includes scaffolding fields plus TAP / Controller / ASO parity keys. */
export type SellerFormData = {
  year: number | null
  make: string
  model: string
  n_number: string
  serial_number: string
  sale_type: SellerSaleType
  condition: SellerCondition
  model_suffix: string
  fractional_share: string | null
  country: string
  state: string
  region_or_province: string
  city: string
  seller_type: SellerType
  seller_name: string
  company_name: string
  total_time_airframe: number | null
  engine1_make_model: string
  engine1_serial: string
  engine1_time_status: string
  engine1_hours: number | null
  engine1_tbo: number | null
  show_engine2: boolean
  engine2_make_model: string
  engine2_serial: string
  engine2_time_status: string
  engine2_hours: number | null
  engine2_tbo: number | null
  engine1_program: string
  engine2_program: string
  prop_make_model: string
  prop_serial: string
  prop_time_status: string
  prop_hours: number | null
  prop_tbo: number | null
  show_prop2: boolean
  prop2_make_model: string
  prop2_serial: string
  prop2_time_status: string
  prop2_hours: number | null
  prop2_tbo: number | null
  show_apu: boolean
  apu_make_model: string
  apu_notes: string
  useful_load: number | null
  useful_load_unit: UsefulLoadUnit
  annual_due_month: string
  damage_history: boolean
  damage_notes: string
  listing_description: string
  avionics_highlights: string
  contact_email: string
  contact_phone: string
  contact_phone2: string
  fax: string
  web_address: string
  photos: SellerPhotoMeta[]
  logs: SellerLogMeta[]
  photo_types: Record<string, string>
  photo_captions: Record<string, string>
  log_types: Record<string, string>
  show_registration_in_listing: boolean
  pre_buy_available: boolean
  display_seller_name: boolean
  display_serial_number: boolean
  display_web_address: boolean
  display_contact_button: boolean
  display_phone2: boolean
  display_fax: boolean
  asking_price: number | null
  price_negotiable: boolean
  price_extension: string
  monthly_lease_price: number | null
}

export const initialSellerFormData: SellerFormData = {
  year: null,
  make: "",
  model: "",
  n_number: "",
  serial_number: "",
  sale_type: "for_sale",
  condition: "used",
  model_suffix: "",
  fractional_share: null,
  country: "United States",
  state: "",
  region_or_province: "",
  city: "",
  seller_type: "private",
  seller_name: "",
  company_name: "",
  total_time_airframe: null,
  engine1_make_model: "",
  engine1_serial: "",
  engine1_time_status: "SMOH",
  engine1_hours: null,
  engine1_tbo: null,
  show_engine2: false,
  engine2_make_model: "",
  engine2_serial: "",
  engine2_time_status: "SMOH",
  engine2_hours: null,
  engine2_tbo: null,
  engine1_program: "",
  engine2_program: "",
  prop_make_model: "",
  prop_serial: "",
  prop_time_status: "TSOH",
  prop_hours: null,
  prop_tbo: null,
  show_prop2: false,
  prop2_make_model: "",
  prop2_serial: "",
  prop2_time_status: "TSOH",
  prop2_hours: null,
  prop2_tbo: null,
  show_apu: false,
  apu_make_model: "",
  apu_notes: "",
  useful_load: null,
  useful_load_unit: "lb",
  annual_due_month: "",
  damage_history: false,
  damage_notes: "",
  listing_description: "",
  avionics_highlights: "",
  contact_email: "",
  contact_phone: "",
  contact_phone2: "",
  fax: "",
  web_address: "",
  photos: [],
  logs: [],
  photo_types: {},
  photo_captions: {},
  log_types: {},
  show_registration_in_listing: true,
  pre_buy_available: true,
  display_seller_name: true,
  display_serial_number: true,
  display_web_address: true,
  display_contact_button: true,
  display_phone2: true,
  display_fax: true,
  asking_price: null,
  price_negotiable: false,
  price_extension: "",
  monthly_lease_price: null,
}

export type SellerSubmissionPayload = {
  year: number | null
  make: string
  model: string
  n_number: string | null
  serial_number: string | null
  asking_price: number | null
  sale_type: SellerSaleType
  city: string | null
  state: string | null
  country: string | null
  region_or_province: string | null
  total_time_airframe: number | null
  description: string | null
  contact_email: string | null
  contact_phone: string | null
  photo_file_names: string[]
  log_file_names: string[]
  description_intelligence: {
    seller_form_extras: Record<string, unknown>
  }
}

/** Build JSON-serializable submission payload (files referenced by name; upload via multipart later). */
export function buildSellerSubmissionPayload(form: SellerFormData): SellerSubmissionPayload {
  const seller_form_extras: Record<string, unknown> = {
    condition: form.condition,
    model_suffix: form.model_suffix,
    fractional_share: form.sale_type === "fractional" ? form.fractional_share : null,
    prop2_make_model: form.prop2_make_model,
    prop2_serial: form.prop2_serial,
    prop2_time_status: form.prop2_time_status,
    prop2_hours: form.prop2_hours,
    prop2_tbo: form.prop2_tbo,
    engine1_program: form.engine1_program,
    engine2_program: form.engine2_program,
    apu_make_model: form.apu_make_model,
    apu_notes: form.apu_notes,
    useful_load_unit: form.useful_load_unit,
    useful_load: form.useful_load,
    monthly_lease_price: form.sale_type === "for_lease" ? form.monthly_lease_price : null,
    photo_types: form.photo_types,
    photo_captions: form.photo_captions,
    log_types: form.log_types,
    display_seller_name: form.display_seller_name,
    display_serial_number: form.display_serial_number,
    display_web_address: form.display_web_address,
    display_contact_button: form.display_contact_button,
    display_phone2: form.display_phone2,
    display_fax: form.display_fax,
    show_engine2: form.show_engine2,
    show_prop2: form.show_prop2,
    show_apu: form.show_apu,
    engine1_make_model: form.engine1_make_model,
    engine1_serial: form.engine1_serial,
    engine1_time_status: form.engine1_time_status,
    engine1_hours: form.engine1_hours,
    engine1_tbo: form.engine1_tbo,
    engine2_make_model: form.engine2_make_model,
    engine2_serial: form.engine2_serial,
    engine2_time_status: form.engine2_time_status,
    engine2_hours: form.engine2_hours,
    engine2_tbo: form.engine2_tbo,
    prop_make_model: form.prop_make_model,
    prop_serial: form.prop_serial,
    prop_time_status: form.prop_time_status,
    prop_hours: form.prop_hours,
    prop_tbo: form.prop_tbo,
    seller_type: form.seller_type,
    seller_name: form.seller_name,
    company_name: form.company_name,
    annual_due_month: form.annual_due_month,
    damage_history: form.damage_history,
    damage_notes: form.damage_notes,
    avionics_highlights: form.avionics_highlights,
    contact_phone2: form.contact_phone2,
    fax: form.fax,
    web_address: form.web_address,
    show_registration_in_listing: form.show_registration_in_listing,
    pre_buy_available: form.pre_buy_available,
    price_negotiable: form.price_negotiable,
    price_extension: form.price_extension,
  }

  const description = [form.listing_description, form.avionics_highlights ? `\n\nAvionics: ${form.avionics_highlights}` : ""]
    .join("")
    .trim()

  return {
    year: form.year,
    make: form.make.trim(),
    model: form.model.trim(),
    n_number: form.n_number.trim() || null,
    serial_number: form.serial_number.trim() || null,
    asking_price: form.asking_price,
    sale_type: form.sale_type,
    city: form.city.trim() || null,
    state: form.country === "United States" || form.country === "Canada" ? form.state.trim() || null : null,
    country: form.country.trim() || null,
    region_or_province:
      form.country !== "United States" && form.country !== "Canada" ? form.region_or_province.trim() || null : null,
    total_time_airframe: form.total_time_airframe,
    description: description || null,
    contact_email: form.contact_email.trim() || null,
    contact_phone: form.contact_phone.trim() || null,
    photo_file_names: form.photos.map((p) => p.name),
    log_file_names: form.logs.map((l) => l.name),
    description_intelligence: { seller_form_extras },
  }
}

/**
 * Country -> time zone mapping used to define a tournament's local "day".
 *
 * Keys are the 3-letter codes returned by the tennis API (mostly IOC codes);
 * ISO alpha-3 variants are included where they differ. Countries spanning
 * several zones use the zone where most tournaments are held.
 */

const COUNTRY_TIMEZONES: Record<string, string> = {
  // Americas
  USA: "America/New_York",
  CAN: "America/Toronto",
  MEX: "America/Mexico_City",
  BRA: "America/Sao_Paulo",
  ARG: "America/Argentina/Buenos_Aires",
  CHI: "America/Santiago",
  CHL: "America/Santiago",
  COL: "America/Bogota",
  PER: "America/Lima",
  ECU: "America/Guayaquil",
  URU: "America/Montevideo",
  URY: "America/Montevideo",
  PAR: "America/Asuncion",
  PRY: "America/Asuncion",
  BOL: "America/La_Paz",
  VEN: "America/Caracas",
  DOM: "America/Santo_Domingo",
  PUR: "America/Puerto_Rico",
  PRI: "America/Puerto_Rico",
  GUA: "America/Guatemala",
  GTM: "America/Guatemala",
  CRC: "America/Costa_Rica",
  CRI: "America/Costa_Rica",
  PAN: "America/Panama",
  ESA: "America/El_Salvador",
  SLV: "America/El_Salvador",
  JAM: "America/Jamaica",
  BAH: "America/Nassau",
  BHS: "America/Nassau",
  BAR: "America/Barbados",
  BRB: "America/Barbados",
  TTO: "America/Port_of_Spain",

  // Europe
  GBR: "Europe/London",
  IRL: "Europe/Dublin",
  POR: "Europe/Lisbon",
  PRT: "Europe/Lisbon",
  ESP: "Europe/Madrid",
  FRA: "Europe/Paris",
  MON: "Europe/Monaco",
  MCO: "Europe/Monaco",
  BEL: "Europe/Brussels",
  NED: "Europe/Amsterdam",
  NLD: "Europe/Amsterdam",
  LUX: "Europe/Luxembourg",
  GER: "Europe/Berlin",
  DEU: "Europe/Berlin",
  SUI: "Europe/Zurich",
  CHE: "Europe/Zurich",
  AUT: "Europe/Vienna",
  ITA: "Europe/Rome",
  SMR: "Europe/San_Marino",
  MLT: "Europe/Malta",
  DEN: "Europe/Copenhagen",
  DNK: "Europe/Copenhagen",
  NOR: "Europe/Oslo",
  SWE: "Europe/Stockholm",
  FIN: "Europe/Helsinki",
  EST: "Europe/Tallinn",
  LAT: "Europe/Riga",
  LVA: "Europe/Riga",
  LTU: "Europe/Vilnius",
  POL: "Europe/Warsaw",
  CZE: "Europe/Prague",
  SVK: "Europe/Bratislava",
  HUN: "Europe/Budapest",
  SLO: "Europe/Ljubljana",
  SVN: "Europe/Ljubljana",
  CRO: "Europe/Zagreb",
  HRV: "Europe/Zagreb",
  BIH: "Europe/Sarajevo",
  SRB: "Europe/Belgrade",
  MNE: "Europe/Podgorica",
  MKD: "Europe/Skopje",
  ALB: "Europe/Tirane",
  GRE: "Europe/Athens",
  GRC: "Europe/Athens",
  BUL: "Europe/Sofia",
  BGR: "Europe/Sofia",
  ROU: "Europe/Bucharest",
  MDA: "Europe/Chisinau",
  UKR: "Europe/Kyiv",
  BLR: "Europe/Minsk",
  RUS: "Europe/Moscow",
  CYP: "Asia/Nicosia",
  TUR: "Europe/Istanbul",
  GEO: "Asia/Tbilisi",
  ARM: "Asia/Yerevan",
  AZE: "Asia/Baku",

  // Middle East & Africa
  ISR: "Asia/Jerusalem",
  EGY: "Africa/Cairo",
  TUN: "Africa/Tunis",
  MAR: "Africa/Casablanca",
  ALG: "Africa/Algiers",
  DZA: "Africa/Algiers",
  RSA: "Africa/Johannesburg",
  ZAF: "Africa/Johannesburg",
  NGR: "Africa/Lagos",
  NGA: "Africa/Lagos",
  KEN: "Africa/Nairobi",
  ANG: "Africa/Luanda",
  AGO: "Africa/Luanda",
  UAE: "Asia/Dubai",
  ARE: "Asia/Dubai",
  QAT: "Asia/Qatar",
  KSA: "Asia/Riyadh",
  SAU: "Asia/Riyadh",
  BRN: "Asia/Bahrain",
  BHR: "Asia/Bahrain",
  KUW: "Asia/Kuwait",
  KWT: "Asia/Kuwait",
  OMA: "Asia/Muscat",
  OMN: "Asia/Muscat",
  JOR: "Asia/Amman",
  LBN: "Asia/Beirut",
  IRI: "Asia/Tehran",
  IRN: "Asia/Tehran",

  // Asia
  KAZ: "Asia/Almaty",
  UZB: "Asia/Tashkent",
  IND: "Asia/Kolkata",
  PAK: "Asia/Karachi",
  SRI: "Asia/Colombo",
  LKA: "Asia/Colombo",
  BAN: "Asia/Dhaka",
  BGD: "Asia/Dhaka",
  NEP: "Asia/Kathmandu",
  NPL: "Asia/Kathmandu",
  THA: "Asia/Bangkok",
  VIE: "Asia/Ho_Chi_Minh",
  VNM: "Asia/Ho_Chi_Minh",
  MAS: "Asia/Kuala_Lumpur",
  MYS: "Asia/Kuala_Lumpur",
  SGP: "Asia/Singapore",
  INA: "Asia/Jakarta",
  IDN: "Asia/Jakarta",
  PHI: "Asia/Manila",
  PHL: "Asia/Manila",
  CHN: "Asia/Shanghai",
  HKG: "Asia/Hong_Kong",
  MAC: "Asia/Macau",
  TPE: "Asia/Taipei",
  TWN: "Asia/Taipei",
  KOR: "Asia/Seoul",
  JPN: "Asia/Tokyo",
  MGL: "Asia/Ulaanbaatar",
  MNG: "Asia/Ulaanbaatar",

  // Oceania
  AUS: "Australia/Sydney",
  NZL: "Pacific/Auckland",
  FIJ: "Pacific/Fiji",
  FJI: "Pacific/Fiji",
};

/**
 * City overrides for countries spanning several time zones.
 * Keys: normalized city name (lowercase, accents stripped, punctuation -> space).
 */
const CITY_TIMEZONES: Record<string, Record<string, string>> = {
  USA: {
    austin: "America/Chicago",
    "fort worth": "America/Chicago",
    dallas: "America/Chicago",
    houston: "America/Chicago",
    "san antonio": "America/Chicago",
    waco: "America/Chicago",
    lubbock: "America/Chicago",
    tulsa: "America/Chicago",
    memphis: "America/Chicago",
    chicago: "America/Chicago",
    champaign: "America/Chicago",
    edwardsville: "America/Chicago",
    "little rock": "America/Chicago",
    "st louis": "America/Chicago",
    "indian wells": "America/Los_Angeles",
    "los angeles": "America/Los_Angeles",
    "san diego": "America/Los_Angeles",
    bakersfield: "America/Los_Angeles",
    calabasas: "America/Los_Angeles",
    "rancho santa fe": "America/Los_Angeles",
    "newport beach": "America/Los_Angeles",
    berkeley: "America/Los_Angeles",
    stockton: "America/Los_Angeles",
    tiburon: "America/Los_Angeles",
    fresno: "America/Los_Angeles",
    sacramento: "America/Los_Angeles",
    "las vegas": "America/Los_Angeles",
    portland: "America/Los_Angeles",
    seattle: "America/Los_Angeles",
    phoenix: "America/Phoenix",
    scottsdale: "America/Phoenix",
    denver: "America/Denver",
    boise: "America/Boise",
    honolulu: "Pacific/Honolulu",
  },
  CAN: {
    vancouver: "America/Vancouver",
    calgary: "America/Edmonton",
    edmonton: "America/Edmonton",
    winnipeg: "America/Winnipeg",
    saskatoon: "America/Regina",
  },
  AUS: {
    perth: "Australia/Perth",
    brisbane: "Australia/Brisbane",
    "gold coast": "Australia/Brisbane",
    cairns: "Australia/Brisbane",
    townsville: "Australia/Brisbane",
    adelaide: "Australia/Adelaide",
    darwin: "Australia/Darwin",
  },
  MEX: {
    cancun: "America/Cancun",
    "los cabos": "America/Mazatlan",
    tijuana: "America/Tijuana",
  },
  BRA: {
    manaus: "America/Manaus",
  },
};

export const DEFAULT_TIMEZONE = "UTC";

const cityKey = (city: string) =>
  city
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Get the IANA time zone for a 3-letter country code (falls back to UTC),
 * refined by city for countries spanning several zones.
 */
export function getCountryTimezone(
  countryCode: string | null | undefined,
  city?: string | null,
): string {
  if (!countryCode) return DEFAULT_TIMEZONE;
  const code = countryCode.toUpperCase();
  const byCity = city ? CITY_TIMEZONES[code]?.[cityKey(city)] : undefined;
  return byCity ?? COUNTRY_TIMEZONES[code] ?? DEFAULT_TIMEZONE;
}

/**
 * Local calendar date (YYYY-MM-DD) of an instant in the given time zone
 */
export function getLocalDateString(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Local weekday (0 = Sunday ... 6 = Saturday) in the given time zone
 */
export function getLocalWeekday(date: Date, timeZone: string): number {
  const short = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(date);
  return WEEKDAYS.indexOf(short);
}

/**
 * Local Hijri date (Umm al-Qura calendar) in the given time zone
 */
export function getHijriDate(
  date: Date,
  timeZone: string,
): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US-u-ca-islamic-umalqura", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/**
 * Local calendar date (YYYY-MM-DD) of an instant in a country's time zone
 */
export function getCountryLocalDate(
  date: Date,
  countryCode: string | null | undefined,
  city?: string | null,
): string {
  return getLocalDateString(date, getCountryTimezone(countryCode, city));
}

export const MOBBIN_BASE_URL = "https://mobbin.com";
export const SUPABASE_URL = "https://ujasntkfphywizsdaapi.supabase.co";
export const DEFAULT_PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 50;
export const CHARACTER_LIMIT = 25000;

/** Public publishable key embedded in Mobbin's client JS. Required for Supabase auth API calls. */
export const SUPABASE_ANON_KEY = "sb_publishable_LbI2-4spKrYx1xHKrI4YyQ_rC-csyUz";

/** Cookie name prefix used by Supabase for this project. */
export const SUPABASE_COOKIE_PREFIX = "sb-ujasntkfphywizsdaapi-auth-token";

/** Refresh the token this many seconds before it actually expires. */
export const TOKEN_REFRESH_BUFFER_SECONDS = 300;

/** Maximum image size in bytes to fetch (10MB). */
export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

/** Timeout for image fetch requests in milliseconds. */
export const IMAGE_FETCH_TIMEOUT_MS = 15_000;

/** Allowed hostname patterns for screen image URLs (SSRF prevention). */
export const ALLOWED_IMAGE_HOSTS = [
  "ujasntkfphywizsdaapi.supabase.co",
  "bytescale.mobbin.com",
];

/** Bytescale CDN base for fetching screen images. */
export const BYTESCALE_CDN_BASE = "https://bytescale.mobbin.com/FW25bBB/image/mobbin.com/prod";

/** Supabase storage path prefix that gets stripped when converting to CDN URLs. */
export const SUPABASE_STORAGE_PREFIX = "/storage/v1/object/public/";

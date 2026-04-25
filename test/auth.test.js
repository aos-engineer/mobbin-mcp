import test from "node:test";
import assert from "node:assert/strict";

const {
  MobbinAuth,
  inferCookiePrefixFromSupabaseUrl,
  extractNextStaticScriptUrls,
  extractMobbinRuntimeConfigFromBundle,
} = await import("../dist/services/auth.js");
const { redactSensitiveText } = await import("../dist/utils/security.js");

const session = {
  access_token: "access-token",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: "refresh-token",
  user: {
    id: "user-1",
    email: "user@example.com",
  },
};

test("auth parser accepts raw JSON session input", async () => {
  const auth = MobbinAuth.fromCookie(JSON.stringify(session));

  assert.equal(auth.getSession().access_token, session.access_token);

  const cookieValue = await auth.getCookieValue();
  assert.match(cookieValue, /sb-ujasntkfphywizsdaapi-auth-token=/);
  assert.match(cookieValue, /base64-/);
});

test("auth parser accepts chunked auth cookies with a different project ref", () => {
  const encoded = encodeURIComponent(JSON.stringify(session));
  const midpoint = Math.ceil(encoded.length / 2);
  const cookie =
    `sb-customprojectref-auth-token.0=${encoded.slice(0, midpoint)}; ` +
    `sb-customprojectref-auth-token.1=${encoded.slice(midpoint)}`;

  const auth = MobbinAuth.fromCookie(cookie);
  assert.equal(auth.getSession().refresh_token, session.refresh_token);
});

test("auth parser accepts a single unchunked auth cookie", () => {
  const cookie = `sb-customprojectref-auth-token=${encodeURIComponent(JSON.stringify(session))}`;
  const auth = MobbinAuth.fromCookie(cookie);

  assert.equal(auth.getSession().user.email, session.user.email);
});

test("auth parser accepts base64-prefixed chunked auth cookies", () => {
  const encoded = `base64-${Buffer.from(JSON.stringify(session), "utf8").toString("base64url")}`;
  const midpoint = Math.ceil(encoded.length / 2);
  const cookie =
    `sb-customprojectref-auth-token.0=${encoded.slice(0, midpoint)}; ` +
    `sb-customprojectref-auth-token.1=${encoded.slice(midpoint)}`;

  const auth = MobbinAuth.fromCookie(cookie);
  assert.equal(auth.getSession().access_token, session.access_token);
});

test("can infer a cookie prefix from the Supabase project URL", () => {
  assert.equal(
    inferCookiePrefixFromSupabaseUrl("https://ujasntkfphywizsdaapi.supabase.co"),
    "sb-ujasntkfphywizsdaapi-auth-token",
  );
});

test("can extract Next.js chunk URLs from Mobbin html", () => {
  const html = `
    <html>
      <script src="/_next/static/chunks/main-app-abc.js?dpl=123" async></script>
      <script src="/_next/static/chunks/app/layout-def.js?dpl=123" async></script>
    </html>
  `;

  assert.deepEqual(extractNextStaticScriptUrls(html), [
    "/_next/static/chunks/main-app-abc.js?dpl=123",
    "/_next/static/chunks/app/layout-def.js?dpl=123",
  ]);
});

test("can extract live Mobbin Supabase config from a bundle", () => {
  const bundle = `
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"sb_publishable_live_key",
    NEXT_PUBLIC_SUPABASE_URL:"https://ujasntkfphywizsdaapi.supabase.co",
  `;

  assert.deepEqual(extractMobbinRuntimeConfigFromBundle(bundle), {
    supabaseAnonKey: "sb_publishable_live_key",
    supabaseUrl: "https://ujasntkfphywizsdaapi.supabase.co",
    supabaseCookiePrefix: "sb-ujasntkfphywizsdaapi-auth-token",
  });
});

test("redacts obvious auth secrets from upstream response text", () => {
  const text =
    'refresh_token=secret-token access_token="another-secret" sb-ujasntkfphywizsdaapi-auth-token.0=abc123 eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def';

  const redacted = redactSensitiveText(text, 500);
  assert.match(redacted, /refresh_token=\[REDACTED\]/);
  assert.match(redacted, /access_token=\[REDACTED\]/);
  assert.match(redacted, /sb-ujasntkfphywizsdaapi-auth-token\.0=\[REDACTED\]/);
  assert.match(redacted, /\[REDACTED_JWT\]/);
});

import test from "node:test";
import assert from "node:assert/strict";

const { MobbinAuth } = await import("../dist/services/auth.js");

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
  assert.match(cookieValue, /sb-ujasntkfphywizsdaapi-auth-token\.0=/);
  assert.match(cookieValue, /sb-ujasntkfphywizsdaapi-auth-token\.1=/);
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

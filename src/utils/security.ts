export function redactSensitiveText(input: string, maxLength: number = 200): string {
  const truncated = input.slice(0, maxLength);

  return truncated
    .replace(
      /\b(access_token|refresh_token|apikey|api_key|authorization)\b\s*[:=]\s*["']?[^"',\s}]+/gi,
      (_match, key: string) => `${key}=[REDACTED]`,
    )
    .replace(/(sb-[a-z0-9]+-auth-token(?:\.\d+)?=)[^;,\s]+/gi, "$1[REDACTED]")
    .replace(/\beyJ[A-Za-z0-9._-]{20,}\b/g, "[REDACTED_JWT]");
}

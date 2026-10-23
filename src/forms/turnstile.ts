import type { Turnstile } from "./forms.service";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function createTurnstile(
  secret: string,
  fetchImpl: typeof fetch = fetch,
): Turnstile {
  return {
    async verify(token, ip) {
      if (!token) return false;
      const body = new URLSearchParams({ secret, response: token });
      if (ip) body.set("remoteip", ip);
      try {
        const res = await fetchImpl(VERIFY_URL, {
          method: "POST",
          body,
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return false;
        const json = (await res.json()) as { success?: boolean };
        return json.success === true;
      } catch {
        // Fail closed: an unverifiable token is treated as a bot.
        return false;
      }
    },
  };
}

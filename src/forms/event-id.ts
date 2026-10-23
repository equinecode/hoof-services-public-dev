import { createHash } from "node:crypto";
import type { FormKind } from "./schemas";

// Crockford base32: no I, L, O, U, so references survive being read aloud.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function base32(bytes: Buffer, length: number): string {
  let out = "";
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < length) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    if (out.length >= length) break;
  }
  return out;
}

const sha = (input: string) => createHash("sha256").update(input).digest();

/**
 * Deterministic duplicate key for a submission, so a retry (or double click)
 * lands on the same outbox row (ADR-001 §2) and gets the same reference back.
 *
 * - signup: one per (list, email), forever.
 * - contact / advertising inquiry: one per (form, email, content) per UTC day,
 *   so the same message can't be spammed but a later, new inquiry goes through.
 */
export function submissionReference(
  form: FormKind,
  fields: { email: string; list?: string; message?: string },
  now: Date,
): string {
  const day = now.toISOString().slice(0, 10);
  const seed =
    form === "signup"
      ? `${form}|${fields.list}|${fields.email}`
      : `${form}|${fields.email}|${sha(fields.message ?? "").toString("hex")}|${day}`;
  return `HM-${base32(sha(seed), 10)}`;
}

/** `${entity}:${publicId}:created` — ADR-001 §2 for create events. */
export function buildFormEventId(entity: string, reference: string): string {
  return `${entity}:${reference}:created`;
}

/** A stable reference for honeypot hits, so bots can't tell they were dropped. */
export function decoyReference(seed: string): string {
  return `HM-${base32(sha(`decoy|${seed}`), 10)}`;
}

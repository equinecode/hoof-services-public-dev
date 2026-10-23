import { z } from "zod";

// Control characters (except tab/newline) have no place in a form field.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const text = (min: number, max: number) =>
  z
    .string()
    .transform((v) => v.replace(CONTROL_CHARS, "").trim())
    .pipe(z.string().min(min).max(max));

const optionalText = (max: number) =>
  z
    .string()
    .transform((v) => v.replace(CONTROL_CHARS, "").trim())
    .pipe(z.string().max(max))
    .optional()
    .transform((v) => (v ? v : undefined));

const email = z
  .string()
  .transform((v) => v.trim().toLowerCase())
  .pipe(z.string().max(254).email());

/** Anti-spam fields shared by every form; never forwarded in the event. */
const guard = {
  /** Honeypot: hidden from people, filled in by bots. */
  website: z.string().max(500).optional(),
  turnstileToken: z.string().max(2048).optional(),
};

export const contactSchema = z
  .object({
    name: text(1, 100),
    email,
    organization: optionalText(150),
    topic: z.enum(["general", "partnership", "press", "other"]).default("general"),
    message: text(10, 4000),
    ...guard,
  })
  .strict();

export const advertisingInquirySchema = z
  .object({
    name: text(1, 100),
    email,
    company: text(1, 150),
    phone: optionalText(30),
    websiteUrl: optionalText(300),
    budgetRange: z.enum(["under_1k", "1k_5k", "5k_25k", "over_25k", "unsure"]).default("unsure"),
    message: text(10, 4000),
    ...guard,
  })
  .strict();

/** Newsletter and app-launch waitlist (D-176 "newsletter/signup"). */
export const signupSchema = z
  .object({
    email,
    list: z.enum(["newsletter", "waitlist"]),
    ...guard,
  })
  .strict();

export type FormKind = "contact" | "advertising-inquiry" | "signup";

export const FORM_DEFINITIONS = {
  contact: { schema: contactSchema, entity: "contact_request" },
  "advertising-inquiry": { schema: advertisingInquirySchema, entity: "advertising_inquiry" },
  signup: { schema: signupSchema, entity: "signup_request" },
} as const;

export function isFormKind(value: string): value is FormKind {
  return Object.hasOwn(FORM_DEFINITIONS, value);
}

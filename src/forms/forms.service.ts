import { randomUUID } from "node:crypto";
import { getRequestId } from "@equinecode/hoof-observability";
import { buildFormEventId, decoyReference, submissionReference } from "./event-id";
import { FORM_DEFINITIONS, type FormKind } from "./schemas";

export type FormEventInput = {
  eventId: string;
  detailType: string;
  payload: Record<string, unknown>;
  correlationId?: string;
};

/** Durable handoff. Implemented by the outbox; resolves only once the row is committed. */
export interface FormEventSink {
  enqueue(event: FormEventInput): Promise<void>;
}

export type Turnstile = { verify(token: string | undefined, ip?: string): Promise<boolean> };

export type SubmitResult =
  | { ok: true; reference: string }
  | { ok: false; reason: "validation"; fields: Record<string, string[]> }
  | { ok: false; reason: "captcha" };

export type FormsServiceOptions = {
  sink: FormEventSink;
  turnstile?: Turnstile;
  now?: () => Date;
};

export class FormsService {
  private readonly sink: FormEventSink;
  private readonly turnstile?: Turnstile;
  private readonly now: () => Date;

  constructor(options: FormsServiceOptions) {
    this.sink = options.sink;
    this.turnstile = options.turnstile;
    this.now = options.now ?? (() => new Date());
  }

  /**
   * Validates, then durably accepts one submission. Resolves ok only after the
   * outbox insert commits (D-178); a thrown error means nothing was accepted
   * and the caller should show a retryable failure.
   */
  async submit(form: FormKind, body: unknown, ip?: string): Promise<SubmitResult> {
    const parsed = FORM_DEFINITIONS[form].schema.safeParse(body);
    if (!parsed.success) {
      return { ok: false, reason: "validation", fields: parsed.error.flatten().fieldErrors };
    }
    const { website, turnstileToken, ...fields } = parsed.data as Record<string, unknown> & {
      website?: string;
      turnstileToken?: string;
      email: string;
    };

    if (website) {
      // Honeypot hit: look accepted, store nothing.
      return { ok: true, reference: decoyReference(fields.email) };
    }
    if (this.turnstile && !(await this.turnstile.verify(turnstileToken, ip))) {
      return { ok: false, reason: "captcha" };
    }

    const receivedAt = this.now();
    const reference = submissionReference(
      form,
      fields as { email: string; list?: string; message?: string },
      receivedAt,
    );
    const { entity } = FORM_DEFINITIONS[form];

    await this.sink.enqueue({
      eventId: buildFormEventId(entity, reference),
      detailType: `${entity}.created`,
      payload: {
        publicId: reference,
        ...fields,
        createdAt: receivedAt.toISOString(),
        updatedAt: receivedAt.toISOString(),
      },
      correlationId: getRequestId() ?? randomUUID(),
    });

    return { ok: true, reference };
  }
}

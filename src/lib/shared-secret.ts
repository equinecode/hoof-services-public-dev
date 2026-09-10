import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time string compare for shared-secret checks. Lengths are
 * compared first — `timingSafeEqual` throws on mismatched buffer lengths
 * rather than returning `false`, and a caller-controlled length still leaks
 * nothing beyond "right length or not," which the callers of this function
 * already tolerate.
 */
export function timingSafeStringEqual(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

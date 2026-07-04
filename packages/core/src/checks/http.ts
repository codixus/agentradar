// Outbound-fetch hardening limits shared across packages/core's checks.
// Defense-in-depth defaults for the CLI's trust model (the caller picks the
// scan target, curl-equivalent); they become load-bearing once core is
// imported behind a web endpoint that accepts attacker-supplied URLs. See
// codixus/agentsight#1.

export const MAX_REDIRECTS = 5;
export const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MiB

// Reads a response body as text but stops once maxBytes have been consumed,
// cancelling the stream instead of buffering an unbounded body via res.text().
// A multibyte character straddling the truncation point may be clipped -- an
// acceptable cost for a body we are truncating anyway.
export async function readCappedText(
  res: Response,
  maxBytes = MAX_BODY_BYTES,
): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let received = 0;
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (received + value.byteLength > maxBytes) {
      out += decoder.decode(value.subarray(0, maxBytes - received), {
        stream: true,
      });
      await reader.cancel();
      break;
    }
    received += value.byteLength;
    out += decoder.decode(value, { stream: true });
  }
  out += decoder.decode();
  return out;
}

// Native rate limit bindings (wrangler.jsonc): extract endpoints key on the
// session token at 6 per 60s, session issuance keys on client IP at 3 per
// 60s. The binding is permissive and eventually consistent; the Anthropic
// workspace spend cap is the control that bounds the blast radius.

export async function enforceLimit(
  limiter: RateLimit,
  key: string,
  cors: Record<string, string>,
): Promise<Response | null> {
  const { success } = await limiter.limit({ key });
  if (success) return null;
  return new Response(
    JSON.stringify({
      error: "rate_limited",
      message: "The kitchen is slammed, try again in a bit.",
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": "60",
        ...cors,
      },
    },
  );
}

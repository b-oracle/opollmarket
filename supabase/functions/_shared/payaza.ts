export function encodePayazaAuth(secretKey: string): string {
  return `Payaza ${btoa(secretKey)}`;
}

export function buildPayazaWebhookUrl(baseUrl: string, token?: string | null): string {
  const cleanBaseUrl = baseUrl.replace(/\/$/, "");
  const functionUrl = `${cleanBaseUrl}/functions/v1/payaza-webhook`;

  if (!token) {
    return functionUrl;
  }

  const encodedToken = encodeURIComponent(token);
  return `${functionUrl}/${encodedToken}?token=${encodedToken}`;
}

function safeDecodeUrlSegment(value: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function resolvePayazaWebhookTokens(req: Request) {
  const url = new URL(req.url);
  const queryToken = url.searchParams.get("token");
  const headerToken =
    req.headers.get("x-payaza-webhook-token") ||
    req.headers.get("payaza-webhook-token") ||
    req.headers.get("x-webhook-token");

  const pathSegments = url.pathname.split("/").filter(Boolean);
  const functionIndex = pathSegments.lastIndexOf("payaza-webhook");
  const rawPathToken =
    functionIndex >= 0 && pathSegments.length > functionIndex + 1
      ? pathSegments[functionIndex + 1]
      : null;
  const pathToken = safeDecodeUrlSegment(rawPathToken);

  const candidateTokens = [queryToken, pathToken, headerToken].filter(
    (token): token is string => typeof token === "string" && token.length > 0,
  );

  return {
    url,
    queryToken,
    pathToken,
    headerToken,
    candidateTokens,
  };
}
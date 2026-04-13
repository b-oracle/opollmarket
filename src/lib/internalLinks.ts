const STATIC_INTERNAL_HOSTS = new Set(["opoll.org", "www.opoll.org", "opollmarket.com", "www.opollmarket.com"]);

const isLovableHost = (host: string) =>
  host.endsWith(".lovable.app") || host.endsWith(".lovableproject.com");

const isKnownInternalHost = (host: string) => {
  const currentHost = typeof window !== "undefined" ? window.location.hostname : "";
  return host === currentHost || STATIC_INTERNAL_HOSTS.has(host) || isLovableHost(host);
};

export const getInternalPathFromUrl = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    if (!isKnownInternalHost(parsed.hostname)) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
};

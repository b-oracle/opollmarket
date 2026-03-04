import { useEffect } from "react";

interface SEOHeadProps {
  title?: string;
  description?: string;
  path?: string;
  image?: string;
  type?: "website" | "article";
  noindex?: boolean;
}

const BASE_URL = "https://opollmarket.lovable.app";
const DEFAULT_TITLE = "OPOLL — Social Prediction Market";
const DEFAULT_DESC = "Swipe through markets. Predict. Win big. The TikTok-style prediction market platform for real-world events.";
const DEFAULT_IMAGE = "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/3ad5da2e-b2b7-45c9-8f18-e725eba6acbb/id-preview-d19aaf91--fbc135e2-c42c-4d3f-bb3e-e7385ced809f.lovable.app-1772571562655.png";

const SEOHead = ({
  title,
  description = DEFAULT_DESC,
  path = "/",
  image = DEFAULT_IMAGE,
  type = "website",
  noindex = false,
}: SEOHeadProps) => {
  const fullTitle = title ? `${title} | OPOLL` : DEFAULT_TITLE;
  const canonicalUrl = `${BASE_URL}${path}`;

  useEffect(() => {
    // Title
    document.title = fullTitle;

    // Helper to set/create meta tags
    const setMeta = (attr: string, key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    // Standard meta
    setMeta("name", "description", description);
    if (noindex) {
      setMeta("name", "robots", "noindex, nofollow");
    } else {
      const existing = document.querySelector('meta[name="robots"]');
      if (existing) existing.remove();
    }

    // Open Graph
    setMeta("property", "og:title", fullTitle);
    setMeta("property", "og:description", description);
    setMeta("property", "og:image", image);
    setMeta("property", "og:url", canonicalUrl);
    setMeta("property", "og:type", type);
    setMeta("property", "og:site_name", "OPOLL");

    // Twitter
    setMeta("name", "twitter:title", fullTitle);
    setMeta("name", "twitter:description", description);
    setMeta("name", "twitter:image", image);
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:site", "@opollmarket");

    // Canonical link
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", canonicalUrl);

    return () => {
      // Reset to defaults on unmount
      document.title = DEFAULT_TITLE;
    };
  }, [fullTitle, description, image, canonicalUrl, type, noindex]);

  return null;
};

export default SEOHead;

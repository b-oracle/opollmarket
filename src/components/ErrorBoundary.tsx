import { Component, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Loader2 } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  isAutoReloading: boolean;
}

// Use localStorage with a timestamp window so the counter survives across
// reloads in PWA/standalone contexts where sessionStorage can be wiped on
// each navigation, which previously caused infinite chunk-reload loops.
const RELOAD_WINDOW_MS = 10 * 60 * 1000;
const RELOAD_KEY = "chunk_reload_at";

const getChunkReloadCount = () => {
  try {
    const raw = window.localStorage?.getItem(RELOAD_KEY) ?? "";
    if (!raw) return 0;
    const ts = parseInt(raw, 10);
    if (!Number.isFinite(ts)) return 0;
    if (Date.now() - ts > RELOAD_WINDOW_MS) return 0;
    return 1;
  } catch {
    return 0;
  }
};

const setChunkReloadCount = (_count: number) => {
  try {
    window.localStorage?.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // ignore storage access errors
  }
};

const clearChunkReloadCount = () => {
  try {
    window.localStorage?.removeItem(RELOAD_KEY);
  } catch {
    // ignore storage access errors
  }
};

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, isAutoReloading: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    const isChunkError =
      error.message?.includes("Failed to fetch dynamically imported module") ||
      error.message?.includes("Importing a module script failed") ||
      error.message?.includes("error loading dynamically imported module");
    const reloadCount = getChunkReloadCount();

    // Avoid auto-reload inside Lovable preview iframe — sessionStorage can be
    // cleared between reloads, causing infinite refresh loops.
    let inPreviewIframe = false;
    try {
      inPreviewIframe =
        window.self !== window.top ||
        window.location.hostname.includes("id-preview--") ||
        window.location.hostname.includes("lovableproject.com");
    } catch {
      inPreviewIframe = true;
    }

    if (isChunkError && reloadCount < 2 && !inPreviewIframe) {
      return { hasError: true, error, isAutoReloading: true };
    }
    return { hasError: true, error, isAutoReloading: false };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);

    if (!this.state.isAutoReloading) return;

    const reloadCount = getChunkReloadCount();
    setChunkReloadCount(reloadCount + 1);

    const cleanup = async () => {
      try {
        if ("serviceWorker" in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((r) => r.unregister()));
        }
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      } catch {
        // ignore
      }
      window.location.reload();
    };
    cleanup();
  }

  handleReset = () => {
    clearChunkReloadCount();
    this.setState({ hasError: false, error: undefined, isAutoReloading: false });
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      if (this.state.isAutoReloading) {
        return (
          <div className="min-h-screen flex items-center justify-center bg-background p-6">
            <div className="text-center space-y-4">
              <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto" />
              <p className="text-sm text-muted-foreground">Updating app…</p>
            </div>
          </div>
        );
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-foreground">Something went wrong</h1>
              <p className="text-sm text-muted-foreground">
                An unexpected error occurred. Please try refreshing the page.
              </p>
            </div>
            {this.state.error && (
              <div className="p-3 rounded-xl bg-muted/50 border border-border">
                <p className="text-xs text-muted-foreground font-mono break-all">
                  {this.state.error.message}
                </p>
              </div>
            )}
            <button
              onClick={this.handleReset}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm transition-all hover:opacity-90 active:scale-95"
            >
              <RefreshCw className="w-4 h-4" />
              Return Home
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

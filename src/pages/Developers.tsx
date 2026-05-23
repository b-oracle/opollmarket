import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Code2, Terminal, Globe, Webhook, Puzzle, Paintbrush, Copy, Check, ExternalLink, Zap, BookOpen } from "lucide-react";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import SEOHead from "@/components/SEOHead";
import { toast } from "sonner";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID || "dqtjuhqndncanfwgjwva";
const API_BASE = `https://${PROJECT_ID}.supabase.co/functions/v1`;

const CopyBlock = ({ code, label }: { code: string; label?: string }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative group">
      {label && <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1 block">{label}</span>}
      <pre className="bg-muted/50 border border-border rounded-lg p-2 sm:p-3 overflow-x-auto text-[10px] sm:text-[11px] leading-relaxed font-mono text-foreground/90 max-w-full">
        {code}
      </pre>
      <button
        onClick={copy}
        className="absolute top-2 right-2 p-1.5 rounded-md bg-background/80 border border-border text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {copied ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}
      </button>
    </div>
  );
};

const Section = ({ icon: Icon, title, id, children }: { icon: any; title: string; id: string; children: React.ReactNode }) => (
  <section id={id} className="scroll-mt-16 sm:scroll-mt-20">
    <h2 className="text-base sm:text-lg font-bold flex items-center gap-2 mb-3 sm:mb-4 pt-4 sm:pt-6 border-t border-border">
      <Icon className="w-5 h-5 text-primary" />
      {title}
    </h2>
    <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">{children}</div>
  </section>
);

const navItems = [
  { id: "quickstart", label: "Quick Start", icon: Zap },
  { id: "auth", label: "Authentication", icon: Code2 },
  { id: "endpoints", label: "API Endpoints", icon: Terminal },
  { id: "sdk", label: "JavaScript SDK", icon: BookOpen },
  { id: "embeds", label: "Embed Widgets", icon: Globe },
  { id: "webhooks", label: "Webhooks", icon: Webhook },
  { id: "wordpress", label: "WordPress", icon: Puzzle },
  { id: "whitelabel", label: "White-Label", icon: Paintbrush },
];

const Developers = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background" style={{ paddingBottom: 'calc(1rem + var(--content-bottom))' }}>
      <SEOHead
        title="Developer Docs — OPollmarket API & SDK"
        description="Integrate OPollmarket prediction markets into your app with our REST API, JavaScript SDK, embeddable widgets, and WordPress plugin."
      />
      <TopBar />

      <div className="max-w-3xl mx-auto px-3 sm:px-4" style={{ paddingTop: 'calc(var(--content-top) + 0.75rem)' }}>
        {/* Header */}
        <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
          <button onClick={() => navigate(-1)} className="p-1.5 sm:p-2 rounded-xl glass hover:bg-muted/50 transition-colors shrink-0">
            <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-2xl font-black tracking-tight truncate">Developer Documentation</h1>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 shrink-0">API v1.0</span>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground truncate">Integrate OPollmarket prediction markets into your platform</p>
          </div>
        </div>

        {/* Nav pills */}
        <div className="flex flex-wrap gap-1 sm:gap-1.5 mb-6 sm:mb-8 sticky top-[3.5rem] z-10 bg-background/95 backdrop-blur-sm py-2 sm:py-3 -mx-3 sm:-mx-4 px-3 sm:px-4">
          {navItems.map((n) => (
            <a
              key={n.id}
              href={`#${n.id}`}
              className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-xs font-medium bg-muted/50 border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <n.icon className="w-3 h-3 hidden sm:block" />
              {n.label}
            </a>
          ))}
        </div>

        <div className="space-y-2">
          {/* Quick Start */}
          <Section icon={Zap} title="Quick Start" id="quickstart">
            <p className="text-foreground font-medium">Get up and running in 3 steps:</p>
            <ol className="list-decimal list-inside space-y-2 pl-1">
              <li><strong>Get an API key</strong> — Contact the OPollmarket team or request one from the admin panel.</li>
              <li><strong>Include the SDK</strong> — Add one script tag to your page.</li>
              <li><strong>Fetch markets</strong> — Call the API or use the SDK to list and display markets.</li>
            </ol>
            <CopyBlock
              label="Minimal example"
              code={`<script src="${API_BASE}/sdk-js"></script>
<script>
  const opoll = new OPollmarket({ apiKey: 'YOUR_API_KEY' });
  opoll.getMarkets({ limit: 5 }).then(({ markets }) => {
    markets.forEach(m => console.log(m.title, m.yes_price));
  });
</script>`}
            />
          </Section>

          {/* Authentication */}
          <Section icon={Code2} title="Authentication" id="auth">
            <p>All API requests (except embed data) require an <code className="text-foreground bg-muted px-1.5 py-0.5 rounded text-xs">X-API-Key</code> header.</p>
            <CopyBlock
              label="Header format"
              code={`X-API-Key: opoll_a1b2c3d4e5f6...`}
            />
            <p>For actions that modify user data (placing predictions, deposits), you also need a user <strong>Bearer token</strong> in the <code className="text-foreground bg-muted px-1.5 py-0.5 rounded text-xs">Authorization</code> header.</p>
            <CopyBlock
              code={`Authorization: Bearer eyJhbGciOiJIUzI1NiIs...`}
            />
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-xs">
              <strong className="text-primary">Rate Limiting:</strong> Each API key has a configurable rate limit (default 60 requests/minute). Exceeding this returns <code>429 Too Many Requests</code>.
            </div>

            <h3 className="text-sm font-semibold text-foreground mt-4">Error Responses</h3>
            <p>All errors return a JSON body with a single <code className="text-foreground bg-muted px-1.5 py-0.5 rounded text-xs">error</code> field:</p>
            <CopyBlock code={`{ "error": "Invalid or missing API key" }`} />
            <div className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden mt-2">
              {[
                { code: "400", desc: "Bad Request — missing or invalid parameters" },
                { code: "401", desc: "Unauthorized — missing or invalid API key" },
                { code: "403", desc: "Forbidden — API key lacks required permission" },
                { code: "404", desc: "Not Found — resource does not exist" },
                { code: "429", desc: "Too Many Requests — rate limit exceeded" },
                { code: "500", desc: "Internal Server Error" },
                { code: "503", desc: "Service Unavailable — API disabled via feature toggle" },
              ].map((s) => (
                <div key={s.code} className="p-2 sm:p-3 flex items-start gap-3">
                  <code className="text-[11px] font-mono text-primary bg-primary/5 px-2 py-0.5 rounded shrink-0">{s.code}</code>
                  <span className="text-xs text-muted-foreground">{s.desc}</span>
                </div>
              ))}
            </div>

            <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 text-xs mt-3">
              <strong className="text-amber-500">Availability:</strong> The public API can be globally disabled by the platform admin. When disabled, all endpoints return <code>503 Service Unavailable</code>.
            </div>
          </Section>

          {/* API Endpoints */}
          <Section icon={Terminal} title="API Endpoints" id="endpoints">
            <p>Base URL: <code className="text-foreground bg-muted px-1.5 py-0.5 rounded text-xs">{API_BASE}/api-public?action=</code></p>

            {[
              {
                method: "GET", action: "markets",
                desc: "List active markets with optional filtering.",
                params: "category, limit (max 100), offset, status",
                response: `{ "markets": [...], "count": 20 }`,
              },
              {
                method: "GET", action: "market",
                desc: "Get a single market by ID, including options for multi-choice markets.",
                params: "id (required)",
                response: `{ "market": { "id": "...", "title": "...", "yes_price": 0.65, "options": [...] } }`,
              },
              {
                method: "GET", action: "balance",
                desc: "Get authenticated user's balance (scoped via Bearer token).",
                params: "Bearer token required",
                response: `{ "balance": { "amount": 100.50, "bonus_balance": 5.00, "currency": "USDT" } }`,
              },
              {
                method: "GET", action: "positions",
                desc: "Get authenticated user's open positions with market data.",
                params: "Bearer token required",
                response: `{ "positions": [{ "market_id": "...", "side": "yes", "shares": 10, ... }] }`,
              },
              {
                method: "GET", action: "embed-data",
                desc: "Get market data for embed widgets. Public — no API key required.",
                params: "id (required)",
                response: `{ "market": { "id": "...", "title": "...", "yes_price": 0.65, "options": [...] } }`,
              },
              {
                method: "GET", action: "categories",
                desc: "List all active market categories.",
                params: "None",
                response: `{ "categories": ["Sports", "Crypto", "Politics", ...] }`,
              },
              {
                method: "GET", action: "trending",
                desc: "Fetch markets ranked by trending score.",
                params: "limit (max 50, default 20)",
                response: `{ "markets": [{ "id": "...", "title": "...", "trending_score": 85.2, ... }] }`,
              },
              {
                method: "GET", action: "search",
                desc: "Full-text search across market titles and descriptions.",
                params: "q (required, min 2 chars), limit (max 50), status",
                response: `{ "markets": [...], "count": 5 }`,
              },
              {
                method: "GET", action: "market-trades",
                desc: "Fetch recent confirmed trades for a specific market.",
                params: "marketId (required), limit (max 100), offset",
                response: `{ "trades": [{ "type": "buy", "side": "yes", "amount": 10, ... }], "count": 50 }`,
              },
              {
                method: "GET", action: "trade-history",
                desc: "Authenticated user's transaction log.",
                params: "Bearer token required, type (optional filter), limit, offset",
                response: `{ "trades": [{ "type": "buy", "amount": 25, "market_id": "...", ... }], "count": 20 }`,
              },
              {
                method: "POST", action: "place-bet",
                desc: "Place a prediction on a market. Requires user Bearer token.",
                params: "Body: { marketId, side, amount, optionId? }",
                response: `{ "success": true, "transaction_id": "..." }`,
              },
              {
                method: "POST", action: "sell-position",
                desc: "Close/exit an open position. Requires user Bearer token.",
                params: "Body: { positionId }",
                response: `{ "success": true, "netProceeds": 12.50, "exitFee": 0.65 }`,
              },
              {
                method: "POST", action: "boost-market",
                desc: "Programmatically boost a market's visibility. Requires trade permission.",
                params: "Body: { marketId, tier: 'flash'|'standard'|'whale' }",
                response: `{ "boost_id": "...", "pay_address": "...", "pay_amount": 20 }`,
              },
              {
                method: "POST", action: "create-user",
                desc: "Create a new user account.",
                params: "Body: { email, password }",
                response: `{ "user": { "id": "...", "email": "..." } }`,
              },
              {
                method: "POST", action: "create-market",
                desc: "Create a new prediction market. Requires user Bearer token + trade permission.",
                params: "Body: { title, description, category, endDate, marketType?, options?, imageUrl?, resolutionSource?, initialLiquidity? }",
                response: `{ "market": { "id": "...", "title": "...", "status": "pending" } }`,
              },
              {
                method: "POST", action: "deposit",
                desc: "Initiate a crypto deposit. Requires user Bearer token.",
                params: "Body: { amount, currency? }",
                response: `{ "pay_address": "...", "payment_id": "..." }`,
              },
              {
                method: "GET", action: "comments",
                desc: "Read comments for a market. Supports pagination.",
                params: "Query: market_id (required), limit?, offset?",
                response: `{ "comments": [{ "id": "...", "author_name": "...", "content": "...", "likes_count": 3 }], "count": 12 }`,
              },
              {
                method: "POST", action: "comments",
                desc: "Post a comment on a market. Requires user Bearer token + trade permission.",
                params: "Body: { market_id, content, parent_id? }",
                response: `{ "comment": { "id": "...", "content": "...", "created_at": "..." } }`,
              },
              {
                method: "GET", action: "price-history",
                desc: "Fetch historical trade prices for charting. Optionally filter by date.",
                params: "Query: market_id (required), limit?, since? (ISO timestamp)",
                response: `{ "trades": [{ "timestamp": "...", "side": "yes", "price": 0.65 }], "current": { "yes_price": 0.72 }, "count": 50 }`,
              },
              {
                method: "GET/POST", action: "webhooks",
                desc: "View or update your API key's webhook configuration.",
                params: "GET: none | POST Body: { webhookUrl, webhookSecret? }",
                response: `{ "success": true, "message": "Webhook configuration updated" }`,
              },
            ].map((ep) => (
              <div key={ep.action} className="bg-card border border-border rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${ep.method === "GET" ? "bg-primary/10 text-primary" : "bg-amber-500/10 text-amber-500"}`}>
                    {ep.method}
                  </span>
                  <code className="text-xs font-mono text-foreground">?action={ep.action}</code>
                </div>
                <p className="text-xs">{ep.desc}</p>
                <p className="text-[10px] text-muted-foreground"><strong>Params:</strong> {ep.params}</p>
                <CopyBlock label="Response" code={ep.response} />
              </div>
            ))}

            <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3 text-xs">
              <strong className="text-destructive">Permissions:</strong> API keys have scoped permissions — <code>read</code>, <code>trade</code>, <code>deposit</code>, or <code>all</code>. Attempting an action without the required permission returns <code>403 Forbidden</code>.
            </div>
          </Section>

          {/* JavaScript SDK */}
          <Section icon={BookOpen} title="JavaScript SDK" id="sdk">
            <p>Drop-in client library that wraps all API endpoints.</p>
            <CopyBlock
              label="Include via script tag"
              code={`<script src="${API_BASE}/sdk-js"></script>`}
            />
            <CopyBlock
              label="Initialize"
              code={`const opoll = new OPollmarket({ apiKey: 'YOUR_API_KEY' });`}
            />

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Available Methods</h3>
              {[
                { method: "getMarkets(params?)", desc: "List markets. Params: { category, limit, offset, status }" },
                { method: "getMarket(id)", desc: "Get a single market by ID." },
                { method: "getBalance(userId)", desc: "Get user balance." },
                { method: "getPositions(userId)", desc: "Get user open positions." },
                { method: "setUserToken(jwt)", desc: "Set the user's auth token for authenticated actions." },
                { method: "placeBet({ marketId, side, amount, optionId? })", desc: "Place a prediction (requires user token)." },
                { method: "createUser({ email, password })", desc: "Create a new user account." },
                { method: "deposit({ amount, currency? })", desc: "Initiate a deposit (requires user token)." },
                { method: "embedMarket(marketId, targetEl)", desc: "Render an embedded market widget into a DOM element." },
              ].map((m) => (
              <div key={m.method} className="flex flex-col sm:flex-row gap-1 sm:gap-3 items-start">
                  <code className="text-[10px] sm:text-[11px] font-mono text-primary bg-primary/5 px-2 py-0.5 rounded shrink-0 break-all">{m.method}</code>
                  <span className="text-xs text-muted-foreground">{m.desc}</span>
                </div>
              ))}
            </div>

            <CopyBlock
              label="Full example"
              code={`const opoll = new OPollmarket({ apiKey: 'opoll_abc123...' });

// List crypto markets
const { markets } = await opoll.getMarkets({ category: 'crypto', limit: 10 });

// Get specific market
const { market } = await opoll.getMarket('market-uuid-here');

// Authenticate user and place a prediction
opoll.setUserToken('user-jwt-token');
const result = await opoll.placeBet({
  marketId: 'market-uuid',
  side: 'yes',
  amount: 10
});
console.log('Trade placed:', result);`}
            />
          </Section>

          {/* Embed Widgets */}
          <Section icon={Globe} title="Embed Widgets" id="embeds">
            <h3 className="text-sm font-semibold text-foreground">Market Card</h3>
            <p>Embed a single market as an interactive card on any website.</p>
            <CopyBlock
              label="Basic embed"
              code={`<iframe 
  src="https://opoll.org/embed/market/MARKET_ID"
  width="400" height="320" frameborder="0"
  style="border-radius: 12px; max-width: 100%"
  loading="lazy"
></iframe>`}
            />
            <CopyBlock
              label="With white-label branding"
              code={`<iframe 
  src="https://opoll.org/embed/market/MARKET_ID?key=YOUR_API_KEY"
  width="400" height="320" frameborder="0"
  style="border-radius: 12px; max-width: 100%"
></iframe>`}
            />

            <h3 className="text-sm font-semibold text-foreground mt-6">Market Ticker</h3>
            <p>A horizontal scrolling ticker showing trending markets — perfect for news sites and sidebars.</p>
            <CopyBlock
              code={`<iframe 
  src="https://opoll.org/embed/ticker?limit=10"
  width="100%" height="56" frameborder="0"
  style="border-radius: 8px; max-width: 100%"
  loading="lazy"
></iframe>`}
            />

            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-xs mt-3">
              <strong className="text-primary">Public Data:</strong> The embed data endpoint (<code>?action=embed-data</code>) is publicly accessible without an API key, making it suitable for server-side rendering of market previews.
            </div>

            <h3 className="text-sm font-semibold text-foreground mt-6">SDK Embed Helper</h3>
            <p>Use the SDK to programmatically render a market widget into any DOM element.</p>
            <CopyBlock
              code={`<div id="market-widget"></div>
<script>
  opoll.embedMarket('MARKET_ID', '#market-widget');
</script>`}
            />
          </Section>

          {/* Webhooks */}
          <Section icon={Webhook} title="Webhooks" id="webhooks">
            <p>Receive real-time notifications when events occur on the platform. Configure your webhook URL in the API key settings.</p>

            <h3 className="text-sm font-semibold text-foreground">Events</h3>
            <div className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden">
              {[
                { event: "market.resolved", desc: "Fired when a market is resolved. Includes winner info, resolved side, and market details." },
              ].map((e) => (
                <div key={e.event} className="p-3 flex items-start gap-3">
                  <code className="text-[11px] font-mono text-primary bg-primary/5 px-2 py-0.5 rounded shrink-0">{e.event}</code>
                  <span className="text-xs text-muted-foreground">{e.desc}</span>
                </div>
              ))}
            </div>

            <h3 className="text-sm font-semibold text-foreground mt-4">Payload Format</h3>
            <CopyBlock
              code={`{
  "event": "market.resolved",
  "timestamp": "2026-03-18T12:00:00.000Z",
  "market_id": "uuid-here",
  "data": {
    "title": "Will BTC hit $100k?",
    "resolved_side": "yes",
    "status": "resolved"
  }
}`}
            />

            <h3 className="text-sm font-semibold text-foreground mt-4">Signature Verification</h3>
            <p>Every webhook includes an <code className="text-foreground bg-muted px-1.5 py-0.5 rounded text-xs">X-OPollmarket-Signature</code> header containing an HMAC-SHA256 signature of the payload, signed with your webhook secret.</p>
            <CopyBlock
              label="Verify in Node.js"
              code={`const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  return 'sha256=' + expected === signature;
}`}
            />

            <h3 className="text-sm font-semibold text-foreground mt-4">Headers</h3>
            <div className="bg-card border border-border rounded-xl p-3 space-y-1 text-xs">
              <p><code className="text-primary">X-OPollmarket-Event</code> — The event type (e.g., <code>market.resolved</code>)</p>
              <p><code className="text-primary">X-OPollmarket-Signature</code> — HMAC-SHA256 signature: <code>sha256=&lt;hex&gt;</code></p>
              <p><code className="text-primary">Content-Type</code> — <code>application/json</code></p>
            </div>

            <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 text-xs">
              <strong className="text-amber-500">Timeout:</strong> Webhook delivery times out after 10 seconds. Return a 2xx status to confirm receipt. Failed deliveries are logged and can be retried.
            </div>
          </Section>

          {/* WordPress */}
          <Section icon={Puzzle} title="WordPress Plugin" id="wordpress">
            <p>Install our WordPress plugin to embed markets with shortcodes — no coding required.</p>
            <CopyBlock
              label="Download"
              code={`${API_BASE}/wp-plugin`}
            />
            <p>Upload the <code className="text-foreground bg-muted px-1.5 py-0.5 rounded text-xs">opoll-embed.php</code> file to your WordPress plugins directory and activate it.</p>

            <h3 className="text-sm font-semibold text-foreground mt-4">Shortcodes</h3>
            <div className="space-y-3">
              <CopyBlock label="Embed a market" code={`[opoll market="MARKET_ID" height="320" theme="dark"]`} />
              <CopyBlock label="Market ticker" code={`[opoll_ticker limit="10" height="56"]`} />
              <CopyBlock label="Load SDK with API key" code={`[opoll_sdk api_key="YOUR_API_KEY"]`} />
            </div>
          </Section>

          {/* White-Label */}
          <Section icon={Paintbrush} title="White-Label Mode" id="whitelabel">
            <p>Customize the appearance of embedded widgets to match your brand. Configure these settings in your API key management panel.</p>
            <div className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden">
              {[
                { field: "Brand Name", desc: "Replaces 'OPollmarket' branding in embed widgets" },
                { field: "Brand Logo URL", desc: "Custom logo displayed in the embed header" },
                { field: "Primary Color", desc: "Accent color for buttons, progress bars, and highlights" },
                { field: "Dark Background", desc: "Background color for the embed container" },
              ].map((f) => (
                <div key={f.field} className="p-3 flex items-start gap-3">
                  <span className="text-xs font-semibold text-foreground shrink-0 min-w-[120px]">{f.field}</span>
                  <span className="text-xs text-muted-foreground">{f.desc}</span>
                </div>
              ))}
            </div>
            <CopyBlock
              label="Embed with branding"
              code={`<!-- Pass your API key to auto-apply branding -->
<iframe src="https://opoll.org/embed/market/MARKET_ID?key=YOUR_API_KEY"
  width="400" height="320" frameborder="0"
  style="border-radius: 12px"
></iframe>`}
            />
          </Section>

          {/* Affiliate */}
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 mt-8 mb-4">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-primary" />
              Affiliate Revenue Sharing
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Earn commissions on every prediction placed through your API key. The default rate is 5% of the prediction fee, configurable per partner. 
              Earnings are tracked automatically and visible in your partner dashboard.
            </p>
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
};

export default Developers;

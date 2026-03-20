import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Zap, Bell, Hash, Key, Globe, ExternalLink } from "lucide-react";
import { Label } from "@/components/ui/label";

const AIMTELL_SITE_ID = "34331";
const AIMTELL_OWNER = "cd91086560ae";

const SEGMENTS = [
  { tag: "quick-trade", desc: "/quick-trade visitors" },
  { tag: "prediction", desc: "/market/* visitors" },
  { tag: "portfolio", desc: "/portfolio visitors" },
  { tag: "rankings", desc: "/rankings visitors" },
  { tag: "feed", desc: "/feed visitors" },
  { tag: "creator", desc: "/create visitors" },
  { tag: "referral-user", desc: "/referrals visitors" },
  { tag: "commission-earner", desc: "/commissions visitors" },
  { tag: "developer", desc: "/developers visitors" },
  { tag: "social-browser", desc: "Profile browsers" },
  { tag: "help-seeker", desc: "/faq visitors" },
  { tag: "depositor", desc: "Started deposit" },
  { tag: "depositor-confirmed", desc: "Completed deposit" },
  { tag: "withdrawer", desc: "Requested withdrawal" },
  { tag: "copy-trader", desc: "Started copy trading" },
  { tag: "referrer", desc: "Shared referral" },
  { tag: "qt-winner", desc: "Won quick trade" },
  { tag: "qt-active", desc: "Active QT player" },
  { tag: "cat-crypto", desc: "Crypto category" },
  { tag: "cat-sports", desc: "Sports category" },
  { tag: "cat-politics", desc: "Politics category" },
  { tag: "cat-entertainment", desc: "Entertainment" },
  { tag: "cat-finance", desc: "Finance category" },
  { tag: "commenter", desc: "Posted comment" },
  { tag: "engager", desc: "Liked market" },
  { tag: "bookmarker", desc: "Bookmarked market" },
  { tag: "sharer", desc: "Shared market" },
  { tag: "logged-in", desc: "Completed login" },
];

const AimtellConfig = () => {
  return (
    <>
      {/* Configuration Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="w-4 h-4" />
            Configuration
          </CardTitle>
          <CardDescription>Current Aimtell SDK integration details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Hash className="w-3 h-3" /> Site ID
              </Label>
              <div className="font-mono text-sm bg-muted px-3 py-2 rounded-md">{AIMTELL_SITE_ID}</div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Key className="w-3 h-3" /> Owner
              </Label>
              <div className="font-mono text-sm bg-muted px-3 py-2 rounded-md">{AIMTELL_OWNER}</div>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <Globe className="w-3 h-3" /> SDK Source
            </Label>
            <div className="font-mono text-xs bg-muted px-3 py-2 rounded-md break-all">
              //cdn.aimtell.com/trackpush/trackpush.min.js
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <Key className="w-3 h-3" /> API Key
            </Label>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">Configured in Secrets</Badge>
              <span className="text-xs text-muted-foreground">AIMTELL_API_KEY</span>
            </div>
          </div>

          <div className="pt-2">
            <a
              href="https://app.aimtell.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open Aimtell Dashboard
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Event Tracking & Segmentation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="w-4 h-4" />
            Event Tracking &amp; Segmentation
          </CardTitle>
          <CardDescription>Events automatically tagged on subscribers — use these as segment IDs in Aimtell dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {SEGMENTS.map((e) => (
              <div key={e.tag} className="flex items-center gap-1.5">
                <Badge variant="secondary" className="text-xs font-mono">{e.tag}</Badge>
                <span className="text-[10px] text-muted-foreground">{e.desc}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 p-3 rounded-md bg-muted/50 text-xs text-muted-foreground">
            <p><strong>User attributes synced:</strong> user_id, email, display_name</p>
            <p className="mt-1"><strong>Prompt delay:</strong> 5 seconds after first page load</p>
          </div>
        </CardContent>
      </Card>
    </>
  );
};

export default AimtellConfig;

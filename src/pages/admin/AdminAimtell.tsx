import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, Bell, Globe, Key, Hash, Users, Zap, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAdminContext } from "./AdminLayout";

const AIMTELL_SITE_ID = "34331";
const AIMTELL_OWNER = "cd91086560ae";

const AdminAimtell = () => {
  const { canEdit } = useAdminContext();

  // Test push state
  const [pushTitle, setPushTitle] = useState("");
  const [pushBody, setPushBody] = useState("");
  const [pushUrl, setPushUrl] = useState("https://opoll.org");
  const [pushSegment, setPushSegment] = useState("");
  const [sending, setSending] = useState(false);

  const handleSendTestPush = async () => {
    if (!pushTitle.trim()) {
      toast.error("Title is required");
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("aimtell-push", {
        body: {
          title: pushTitle.trim(),
          body: pushBody.trim(),
          url: pushUrl.trim() || undefined,
          segment_id: pushSegment.trim() || undefined,
        },
      });
      if (error) throw error;
      toast.success("Push notification sent successfully");
      setPushTitle("");
      setPushBody("");
      setPushSegment("");
    } catch (err: any) {
      toast.error(err.message || "Failed to send push");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Aimtell Push Notifications</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage browser push notification settings and send broadcasts via Aimtell.
        </p>
      </div>

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

      {/* Active Tracking Events */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="w-4 h-4" />
            Event Tracking &amp; Segmentation
          </CardTitle>
          <CardDescription>Events automatically tagged on subscribers for segmentation</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {[
              { tag: "quick-trade", desc: "/quick-trade page" },
              { tag: "prediction", desc: "/market/* pages" },
              { tag: "portfolio", desc: "/portfolio page" },
              { tag: "rankings", desc: "/rankings page" },
              { tag: "feed", desc: "/feed page" },
              { tag: "creator", desc: "/create page" },
              { tag: "bet_placed", desc: "Analytics event" },
              { tag: "deposit_started", desc: "Analytics event" },
              { tag: "market_created", desc: "Analytics event" },
            ].map((e) => (
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

      {/* Send Push Notification */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Send className="w-4 h-4" />
            Send Push Notification
          </CardTitle>
          <CardDescription>Broadcast a push notification to all Aimtell subscribers or a specific segment</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="push-title">Title *</Label>
            <Input
              id="push-title"
              value={pushTitle}
              onChange={(e) => setPushTitle(e.target.value)}
              placeholder="e.g. New Market Alert! 🔥"
              disabled={!canEdit}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="push-body">Body</Label>
            <Textarea
              id="push-body"
              value={pushBody}
              onChange={(e) => setPushBody(e.target.value)}
              placeholder="e.g. A hot new prediction market just went live. Check it out!"
              rows={3}
              disabled={!canEdit}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="push-url">Click URL</Label>
              <Input
                id="push-url"
                value={pushUrl}
                onChange={(e) => setPushUrl(e.target.value)}
                placeholder="https://opoll.org/market/..."
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="push-segment">
                Segment ID <span className="text-muted-foreground text-xs">(optional)</span>
              </Label>
              <Input
                id="push-segment"
                value={pushSegment}
                onChange={(e) => setPushSegment(e.target.value)}
                placeholder="Leave blank for all subscribers"
                disabled={!canEdit}
              />
            </div>
          </div>

          <Button
            onClick={handleSendTestPush}
            disabled={!canEdit || sending || !pushTitle.trim()}
            className="w-full sm:w-auto"
          >
            {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Send Push
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminAimtell;

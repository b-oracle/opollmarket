import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAdminContext } from "@/pages/admin/AdminLayout";

interface AimtellSendPushProps {
  externalTitle?: string;
  externalBody?: string;
  externalUrl?: string;
}

const AimtellSendPush = ({ externalTitle, externalBody, externalUrl }: AimtellSendPushProps) => {
  const { canEdit } = useAdminContext();
  const [pushTitle, setPushTitle] = useState("");
  const [pushBody, setPushBody] = useState("");
  const [pushUrl, setPushUrl] = useState("https://opoll.org");
  const [pushSegment, setPushSegment] = useState("");
  const [broadcastAll, setBroadcastAll] = useState(false);
  const [sending, setSending] = useState(false);
  const [lastApplied, setLastApplied] = useState("");

  // Sync external props when template is applied
  useEffect(() => {
    if (externalTitle && externalTitle !== lastApplied) {
      setPushTitle(externalTitle);
      setPushBody(externalBody || "");
      setPushUrl(externalUrl || "https://opoll.org");
      setLastApplied(externalTitle);
    }
  }, [externalTitle, externalBody, externalUrl]);

  const handleSendPush = async () => {
    if (!pushTitle.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!pushSegment.trim()) {
      toast.error("Segment ID is required by Aimtell");
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("aimtell-push", {
        body: {
          title: pushTitle.trim(),
          body: pushBody.trim(),
          url: pushUrl.trim() || undefined,
          segment_id: pushSegment.trim(),
          broadcast_all: broadcastAll,
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Send className="w-4 h-4" />
          Send Push Notification
        </CardTitle>
        <CardDescription>Send an immediate push notification to subscribers</CardDescription>
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
            placeholder="e.g. A hot new prediction market just went live."
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
              Target
            </Label>
            <div className="flex items-center gap-2">
               <Button
                 variant="default"
                 size="sm"
                 onClick={() => setBroadcastAll(false)}
                 disabled={!canEdit}
                 className="text-xs"
               >
                 Segment
               </Button>
            </div>
            <Input
              id="push-segment"
              value={pushSegment}
              onChange={(e) => setPushSegment(e.target.value)}
              placeholder="Segment ID (required)"
              disabled={!canEdit}
              className="mt-1"
            />
          </div>
        </div>

        <Button
          onClick={handleSendPush}
          disabled={!canEdit || sending || !pushTitle.trim()}
          className="w-full sm:w-auto"
        >
          {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
          Send Push Now
        </Button>
      </CardContent>
    </Card>
  );
};

export default AimtellSendPush;

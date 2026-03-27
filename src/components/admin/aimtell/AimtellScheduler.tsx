import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, Clock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAdminContext } from "@/pages/admin/AdminLayout";
import { format } from "date-fns";

interface ScheduledPush {
  id: string;
  title: string;
  body: string;
  url: string;
  segment_id: string | null;
  broadcast_all: boolean;
  scheduled_at: string;
  sent_at: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

const AimtellScheduler = () => {
  const { canEdit } = useAdminContext();
  const [pushes, setPushes] = useState<ScheduledPush[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("https://opoll.org");
  const [segmentId, setSegmentId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [scheduling, setScheduling] = useState(false);

  const fetchPushes = async () => {
    const { data, error } = await supabase
      .from("scheduled_aimtell_pushes" as any)
      .select("*")
      .order("scheduled_at", { ascending: false })
      .limit(50);
    if (!error) setPushes((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { fetchPushes(); }, []);

  const handleSchedule = async () => {
    if (!title.trim() || !scheduledAt) {
      toast.error("Title and scheduled time are required");
      return;
    }
    setScheduling(true);
    if (!segmentId.trim()) {
      toast.error("Segment ID is required by Aimtell");
      setScheduling(false);
      return;
    }

    const { error } = await supabase
      .from("scheduled_aimtell_pushes" as any)
      .insert({
        title: title.trim(),
        body: body.trim(),
        url: url.trim() || "https://opoll.org",
        segment_id: segmentId.trim(),
        broadcast_all: false,
        scheduled_at: new Date(scheduledAt).toISOString(),
      } as any);
    if (error) {
      toast.error("Failed to schedule push");
    } else {
      toast.success("Push notification scheduled!");
      setTitle("");
      setBody("");
      setSegmentId("");
      setScheduledAt("");
      fetchPushes();
    }
    setScheduling(false);
  };

  const cancelPush = async (id: string) => {
    const { error } = await supabase
      .from("scheduled_aimtell_pushes" as any)
      .update({ status: "cancelled" } as any)
      .eq("id", id);
    if (error) {
      toast.error("Failed to cancel");
    } else {
      toast.success("Cancelled");
      setPushes(prev => prev.map(p => p.id === id ? { ...p, status: "cancelled" } : p));
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "scheduled": return "secondary";
      case "sent": return "default";
      case "failed": return "destructive";
      case "cancelled": return "outline";
      default: return "secondary";
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="w-4 h-4" />
          Schedule Push Notifications
        </CardTitle>
        <CardDescription>Schedule notifications to be sent at a specific time</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Schedule Form */}
        <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Title *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Weekend Markets Live! 🎯"
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Scheduled Time *</Label>
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                disabled={!canEdit}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Body</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Notification body text..."
              rows={2}
              disabled={!canEdit}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Click URL</Label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Segment ID *</Label>
              <Input
                value={segmentId}
                onChange={(e) => setSegmentId(e.target.value)}
                placeholder="Required"
                disabled={!canEdit}
              />
            </div>
          </div>

          <Button
            onClick={handleSchedule}
            disabled={!canEdit || scheduling || !title.trim() || !scheduledAt || !segmentId.trim()}
            className="w-full sm:w-auto"
          >
            {scheduling ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Clock className="w-4 h-4 mr-2" />}
            Schedule Push
          </Button>
        </div>

        {/* Scheduled List */}
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : pushes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No scheduled pushes yet</p>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {pushes.map((push) => (
              <div key={push.id} className="flex items-center justify-between border rounded-md px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{push.title}</span>
                    <Badge variant={statusColor(push.status) as any} className="text-[10px] shrink-0">
                      {push.status}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {format(new Date(push.scheduled_at), "MMM d, yyyy h:mm a")}
                    {push.segment_id ? ` • Segment: ${push.segment_id}` : " • No segment"}
                  </p>
                  {push.error_message && (
                    <p className="text-[10px] text-destructive">{push.error_message}</p>
                  )}
                </div>
                {push.status === "scheduled" && canEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 h-7 w-7"
                    onClick={() => cancelPush(push.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AimtellScheduler;

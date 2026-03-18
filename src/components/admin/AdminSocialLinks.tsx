import { useState } from "react";
import { useSocialLinks, useUpdateSocialLink, SocialLink } from "@/hooks/useSocialLinks";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Save, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const AdminSocialLinks = () => {
  const { data: links = [], isLoading } = useSocialLinks(false);
  const updateLink = useUpdateSocialLink();
  const [edits, setEdits] = useState<Record<string, Partial<SocialLink>>>({});

  const getEdited = (link: SocialLink) => ({ ...link, ...edits[link.id] });

  const handleChange = (id: string, field: keyof SocialLink, value: string | boolean | number) => {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const handleSave = async (link: SocialLink) => {
    const edited = edits[link.id];
    if (!edited) return;
    try {
      await updateLink.mutateAsync({ id: link.id, ...edited });
      setEdits(prev => { const n = { ...prev }; delete n[link.id]; return n; });
      toast.success(`${link.label} updated`);
    } catch {
      toast.error("Failed to update");
    }
  };

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Social Links</h3>
      <div className="space-y-3">
        {links.map(link => {
          const current = getEdited(link);
          const isDirty = !!edits[link.id];
          return (
            <div key={link.id} className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold">{current.label}</span>
                  <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded">{current.icon_key}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">{current.enabled ? "Visible" : "Hidden"}</span>
                  <Switch
                    checked={current.enabled}
                    onCheckedChange={(v) => handleChange(link.id, "enabled", v)}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Input
                  value={current.url}
                  onChange={(e) => handleChange(link.id, "url", e.target.value)}
                  placeholder="https://..."
                  className="text-sm"
                />
                {current.url && (
                  <a href={current.url} target="_blank" rel="noopener noreferrer" className="shrink-0 flex items-center justify-center w-10 h-10 rounded-lg glass text-muted-foreground hover:text-primary">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  value={current.label}
                  onChange={(e) => handleChange(link.id, "label", e.target.value)}
                  placeholder="Label"
                  className="text-sm w-1/2"
                />
                <Input
                  type="number"
                  value={current.sort_order}
                  onChange={(e) => handleChange(link.id, "sort_order", parseInt(e.target.value) || 0)}
                  placeholder="Order"
                  className="text-sm w-20"
                />
              </div>
              {isDirty && (
                <Button size="sm" onClick={() => handleSave(link)} disabled={updateLink.isPending}>
                  {updateLink.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                  Save
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AdminSocialLinks;

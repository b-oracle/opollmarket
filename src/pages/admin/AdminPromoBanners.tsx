import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, Upload, Loader2, Megaphone, Eye, EyeOff, Search } from "lucide-react";
import { compressImage } from "@/lib/imageCompression";
import { Label } from "@/components/ui/label";

type Kind = "hero" | "featured";
type TargetType = "market" | "event";

const AdminPromoBanners = () => {
  const qc = useQueryClient();

  const [kind, setKind] = useState<Kind>("hero");
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [targetType, setTargetType] = useState<TargetType>("market");
  const [targetSearch, setTargetSearch] = useState("");
  const [targetId, setTargetId] = useState("");
  const [targetLabel, setTargetLabel] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [sortOrder, setSortOrder] = useState(0);

  const { data: banners = [], isLoading } = useQuery({
    queryKey: ["admin-promo-banners"],
    queryFn: async () => {
      const { data } = await supabase
        .from("promo_banners" as any)
        .select("*")
        .order("kind", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
      return (data || []) as any[];
    },
  });

  const { data: searchResults = [] } = useQuery({
    queryKey: ["promo-target-search", targetType, targetSearch],
    queryFn: async () => {
      if (!targetSearch.trim()) return [];
      if (targetType === "market") {
        const { data } = await supabase
          .from("markets")
          .select("id, title, image_url, status")
          .ilike("title", `%${targetSearch}%`)
          .neq("status", "resolved")
          .limit(8);
        return (data || []).map((m: any) => ({ id: m.id, label: m.title, image: m.image_url }));
      }
      const { data } = await supabase
        .from("market_events" as any)
        .select("id, title, slug, image_url")
        .ilike("title", `%${targetSearch}%`)
        .limit(8);
      return (data || []).map((e: any) => ({ id: e.id, label: e.title, image: e.image_url }));
    },
    enabled: targetSearch.trim().length > 0,
    staleTime: 5_000,
  });

  const handleImageUpload = async (file: File) => {
    setUploading(true);
    try {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) throw new Error("Not authenticated");
      const compressed = await compressImage(file, "market-banner");
      const ext = compressed.type === "image/webp" ? "webp" : "jpg";
      const fileName = `${u.id}/banner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage
        .from("market-images")
        .upload(fileName, compressed, { contentType: compressed.type, upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("market-images").getPublicUrl(fileName);
      setImageUrl(data.publicUrl);
      toast.success("Image uploaded");
    } catch (e: any) {
      toast.error("Upload failed: " + (e.message || ""));
    } finally {
      setUploading(false);
    }
  };

  const createMut = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Title required");
      if (!targetId) throw new Error("Pick a target market or event");
      const { data: { user: u } } = await supabase.auth.getUser();
      const { error } = await supabase.from("promo_banners" as any).insert({
        kind,
        title: title.trim(),
        subtitle: subtitle.trim() || null,
        cta_text: ctaText.trim() || null,
        image_url: imageUrl || null,
        target_type: targetType,
        target_id: targetId,
        sort_order: sortOrder,
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
        created_by: u?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Banner created");
      setTitle("");
      setSubtitle("");
      setCtaText("");
      setImageUrl("");
      setTargetId("");
      setTargetLabel("");
      setTargetSearch("");
      setEndsAt("");
      setSortOrder(0);
      qc.invalidateQueries({ queryKey: ["admin-promo-banners"] });
      qc.invalidateQueries({ queryKey: ["promo-banners"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed"),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("promo_banners" as any).update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-promo-banners"] });
      qc.invalidateQueries({ queryKey: ["promo-banners"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("promo_banners" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["admin-promo-banners"] });
      qc.invalidateQueries({ queryKey: ["promo-banners"] });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Megaphone className="w-6 h-6 text-primary" /> Promo Banners
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Hero = full-width rotating banner at the top of Home. Featured = smaller spotlight card in a horizontal strip.
        </p>
      </div>

      {/* Create form */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
        <h2 className="font-semibold">Create banner</h2>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="mb-1.5 block">Banner kind</Label>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as Kind)}
              className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm"
            >
              <option value="hero">Hero (top of Home)</option>
              <option value="featured">Featured (strip)</option>
            </select>
          </div>
          <div>
            <Label className="mb-1.5 block">Sort order</Label>
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)}
              className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <Label className="mb-1.5 block">Title</Label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. World Cup 2026 Winner"
            className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div>
          <Label className="mb-1.5 block">Subtitle (optional)</Label>
          <input
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="Short tagline"
            className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div>
          <Label className="mb-1.5 block">CTA text (optional)</Label>
          <input
            value={ctaText}
            onChange={(e) => setCtaText(e.target.value)}
            placeholder="View, Predict now, etc."
            className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div>
          <Label className="mb-1.5 block">Banner image</Label>
          {imageUrl ? (
            <div className="relative rounded-lg overflow-hidden border border-border">
              <img src={imageUrl} alt="" className="w-full max-h-48 object-cover" />
              <button
                onClick={() => setImageUrl("")}
                className="absolute top-2 right-2 bg-background/90 rounded-full p-1.5 text-xs"
              >
                Replace image
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-full border-2 border-dashed border-border rounded-lg py-6 flex flex-col items-center justify-center text-sm text-muted-foreground hover:border-primary/40 transition-colors"
            >
              {uploading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Upload className="w-5 h-5 mb-1" />
                  <span>Click to upload (recommended 16:9)</span>
                </>
              )}
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImageUpload(f);
              e.target.value = "";
            }}
          />
        </div>

        <div>
          <Label className="mb-1.5 block">Target</Label>
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => {
                setTargetType("market");
                setTargetId("");
                setTargetLabel("");
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                targetType === "market" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              Market
            </button>
            <button
              onClick={() => {
                setTargetType("event");
                setTargetId("");
                setTargetLabel("");
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                targetType === "event" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              Event Group
            </button>
          </div>
          {targetId ? (
            <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-muted/50 border border-border">
              <span className="text-sm truncate">{targetLabel}</span>
              <button
                onClick={() => {
                  setTargetId("");
                  setTargetLabel("");
                }}
                className="text-xs text-destructive"
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  value={targetSearch}
                  onChange={(e) => setTargetSearch(e.target.value)}
                  placeholder={`Search ${targetType === "market" ? "markets" : "events"}...`}
                  className="w-full bg-muted/50 border border-border rounded-lg pl-9 pr-3 py-2 text-sm"
                />
              </div>
              {searchResults.length > 0 && (
                <div className="mt-2 border border-border rounded-lg divide-y divide-border max-h-64 overflow-y-auto">
                  {searchResults.map((r: any) => (
                    <button
                      key={r.id}
                      onClick={() => {
                        setTargetId(r.id);
                        setTargetLabel(r.label);
                        setTargetSearch("");
                      }}
                      className="w-full flex items-center gap-2 p-2 hover:bg-muted text-left text-sm"
                    >
                      {r.image && <img src={r.image} alt="" className="w-8 h-8 rounded object-cover" />}
                      <span className="truncate">{r.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div>
          <Label className="mb-1.5 block">Ends at (optional)</Label>
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <button
          onClick={() => createMut.mutate()}
          disabled={createMut.isPending || !title || !targetId}
          className="w-full btn-yes py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Create banner
        </button>
      </div>

      {/* List */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-semibold mb-3">All banners</h2>
        {isLoading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : banners.length === 0 ? (
          <p className="text-sm text-muted-foreground">No banners yet</p>
        ) : (
          <div className="space-y-2">
            {banners.map((b: any) => (
              <div key={b.id} className="flex items-center gap-3 p-2 rounded-lg border border-border">
                {b.image_url ? (
                  <img src={b.image_url} alt="" className="w-16 h-10 rounded object-cover shrink-0" />
                ) : (
                  <div className="w-16 h-10 rounded bg-muted shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                        b.kind === "hero" ? "bg-primary/15 text-primary" : "bg-amber-500/15 text-amber-500"
                      }`}
                    >
                      {b.kind}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {b.target_type} · sort {b.sort_order}
                    </span>
                  </div>
                  <p className="text-sm font-semibold truncate">{b.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {b.impressions} views · {b.clicks} clicks
                  </p>
                </div>
                <button
                  onClick={() => toggleActive.mutate({ id: b.id, active: !b.active })}
                  className={`p-2 rounded-lg ${b.active ? "text-emerald-500" : "text-muted-foreground"}`}
                  title={b.active ? "Active" : "Inactive"}
                >
                  {b.active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => {
                    if (confirm("Delete this banner?")) deleteMut.mutate(b.id);
                  }}
                  className="p-2 rounded-lg text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPromoBanners;

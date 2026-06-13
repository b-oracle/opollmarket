import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, ExternalLink, Search, Link as LinkIcon } from "lucide-react";
import { Link } from "react-router-dom";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const AdminEvents = () => {
  const qc = useQueryClient();
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newImage, setNewImage] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newEndDate, setNewEndDate] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [marketSearch, setMarketSearch] = useState("");

  const { data: events = [] } = useQuery({
    queryKey: ["admin-events"],
    queryFn: async () => {
      const { data } = await supabase
        .from("market_events" as any)
        .select("*")
        .order("created_at", { ascending: false });
      return (data || []) as any[];
    },
  });

  const selectedEvent = useMemo(
    () => events.find((e: any) => e.id === selectedEventId) ?? null,
    [events, selectedEventId]
  );

  const { data: members = [] } = useQuery({
    queryKey: ["admin-event-members", selectedEventId],
    queryFn: async () => {
      if (!selectedEventId) return [];
      const { data } = await supabase
        .from("market_event_members" as any)
        .select("*, market:markets!inner(id, title, image_url, yes_price, status)")
        .eq("event_id", selectedEventId)
        .order("sort_order", { ascending: true });
      return (data || []) as any[];
    },
    enabled: !!selectedEventId,
  });

  const memberMarketIds = useMemo(
    () => new Set(members.map((m: any) => m.market_id)),
    [members]
  );

  const { data: searchResults = [] } = useQuery({
    queryKey: ["admin-event-market-search", marketSearch],
    queryFn: async () => {
      if (!marketSearch || marketSearch.length < 2) return [];
      const { data } = await supabase
        .from("markets")
        .select("id, title, image_url, yes_price, market_type, status")
        .ilike("title", `%${marketSearch}%`)
        .eq("market_type", "binary")
        .limit(20);
      return (data || []) as any[];
    },
    enabled: marketSearch.length >= 2,
  });

  const createEvent = useMutation({
    mutationFn: async () => {
      if (!newTitle.trim()) throw new Error("Title required");
      const slug = newSlug.trim() || slugify(newTitle);
      const { error } = await supabase.from("market_events" as any).insert({
        title: newTitle.trim(),
        slug,
        description: newDesc.trim() || null,
        image_url: newImage.trim() || null,
        category: newCategory.trim() || null,
        end_date: newEndDate || null,
        status: "active",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Event created");
      setNewTitle(""); setNewSlug(""); setNewImage("");
      setNewCategory(""); setNewEndDate(""); setNewDesc("");
      qc.invalidateQueries({ queryKey: ["admin-events"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to create"),
  });

  const deleteEvent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("market_events" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Event deleted");
      setSelectedEventId(null);
      qc.invalidateQueries({ queryKey: ["admin-events"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed"),
  });

  const addMember = useMutation({
    mutationFn: async (marketId: string) => {
      if (!selectedEventId) return;
      const { error } = await supabase.from("market_event_members" as any).insert({
        event_id: selectedEventId,
        market_id: marketId,
        sort_order: members.length,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-event-members", selectedEventId] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to add"),
  });

  const updateMember = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) => {
      const { error } = await supabase
        .from("market_event_members" as any)
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-event-members", selectedEventId] });
    },
    onError: (e: any) => toast.error(e.message || "Failed"),
  });

  const removeMember = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("market_event_members" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-event-members", selectedEventId] });
    },
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Event Groups</h1>
        <p className="text-sm text-muted-foreground">
          Bundle related binary markets under one event with a shared overlaid chart.
        </p>
      </header>

      <div className="grid lg:grid-cols-[340px_1fr] gap-6">
        {/* Left: list + create */}
        <div className="space-y-4">
          <div className="border border-border rounded-lg p-4 space-y-3 bg-card">
            <h2 className="font-bold text-sm">Create event</h2>
            <input
              value={newTitle}
              onChange={(e) => {
                setNewTitle(e.target.value);
                if (!newSlug) setNewSlug(slugify(e.target.value));
              }}
              placeholder="Title (e.g. World Cup Winner)"
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
            />
            <input
              value={newSlug}
              onChange={(e) => setNewSlug(slugify(e.target.value))}
              placeholder="slug"
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
            />
            <input
              value={newImage}
              onChange={(e) => setNewImage(e.target.value)}
              placeholder="Image URL"
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
            />
            <input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="Category"
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
            />
            <input
              type="date"
              value={newEndDate}
              onChange={(e) => setNewEndDate(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
            />
            <textarea
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Description"
              rows={2}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
            />
            <button
              onClick={() => createEvent.mutate()}
              disabled={createEvent.isPending || !newTitle.trim()}
              className="w-full py-2 rounded-md bg-primary text-primary-foreground text-sm font-bold disabled:opacity-50"
            >
              <Plus className="w-4 h-4 inline mr-1" />
              Create
            </button>
          </div>

          <div className="border border-border rounded-lg overflow-hidden">
            {events.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No events yet</p>
            ) : (
              events.map((e: any) => (
                <button
                  key={e.id}
                  onClick={() => setSelectedEventId(e.id)}
                  className={`w-full text-left px-4 py-3 border-b border-border last:border-0 hover:bg-muted transition ${
                    selectedEventId === e.id ? "bg-muted" : ""
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {e.image_url && (
                      <img src={e.image_url} alt="" className="w-8 h-8 rounded object-cover" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-sm truncate">{e.title}</div>
                      <div className="text-[11px] text-muted-foreground truncate">/{e.slug}</div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right: selected event details */}
        <div>
          {!selectedEvent ? (
            <div className="border border-dashed border-border rounded-lg p-12 text-center text-sm text-muted-foreground">
              Select an event to manage its outcomes
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="text-xl font-bold">{selectedEvent.title}</h2>
                  <p className="text-xs text-muted-foreground">/{selectedEvent.slug}</p>
                </div>
                <div className="flex gap-2">
                  <Link
                    to={`/event/${selectedEvent.slug}`}
                    className="px-3 py-1.5 rounded-md border border-border text-xs font-bold flex items-center gap-1"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    View
                  </Link>
                  <button
                    onClick={() => {
                      if (confirm("Delete this event? Child markets are kept.")) {
                        deleteEvent.mutate(selectedEvent.id);
                      }
                    }}
                    className="px-3 py-1.5 rounded-md border border-destructive text-destructive text-xs font-bold flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                </div>
              </div>

              {/* Members */}
              <div className="border border-border rounded-lg bg-card">
                <div className="px-4 py-3 border-b border-border font-bold text-sm">
                  Outcomes ({members.length})
                </div>
                {members.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">No outcomes attached</p>
                ) : (
                  members.map((m: any, idx) => (
                    <div
                      key={m.id}
                      className="px-4 py-3 border-b border-border last:border-0 grid gap-2 sm:grid-cols-[1fr_auto] items-center"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {m.market?.image_url && (
                          <img src={m.market.image_url} className="w-9 h-9 rounded object-cover" alt="" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-sm truncate">
                            {m.market?.title}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {Math.round(Number(m.market?.yes_price || 0) * 100)}% · {m.market?.status}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <input
                          defaultValue={m.display_label || ""}
                          placeholder="Label"
                          onBlur={(e) => {
                            if (e.target.value !== (m.display_label || ""))
                              updateMember.mutate({ id: m.id, patch: { display_label: e.target.value || null } });
                          }}
                          className="px-2 py-1 rounded border border-border bg-background text-xs w-28"
                        />
                        <input
                          type="color"
                          defaultValue={m.color || "#2563eb"}
                          onBlur={(e) =>
                            updateMember.mutate({ id: m.id, patch: { color: e.target.value } })
                          }
                          className="w-8 h-8 rounded border border-border bg-background"
                        />
                        <input
                          type="number"
                          defaultValue={m.sort_order}
                          onBlur={(e) =>
                            updateMember.mutate({
                              id: m.id,
                              patch: { sort_order: Number(e.target.value) || 0 },
                            })
                          }
                          className="px-2 py-1 rounded border border-border bg-background text-xs w-16"
                        />
                        <button
                          onClick={() => removeMember.mutate(m.id)}
                          className="p-1.5 rounded border border-border text-destructive"
                          title="Remove"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Add markets */}
              <div className="border border-border rounded-lg bg-card">
                <div className="px-4 py-3 border-b border-border font-bold text-sm flex items-center gap-2">
                  <LinkIcon className="w-4 h-4" />
                  Attach binary markets
                </div>
                <div className="p-4 space-y-3">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={marketSearch}
                      onChange={(e) => setMarketSearch(e.target.value)}
                      placeholder="Search markets by title..."
                      className="w-full pl-9 pr-3 py-2 rounded-md border border-border bg-background text-sm"
                    />
                  </div>
                  <div className="max-h-72 overflow-y-auto space-y-1">
                    {searchResults
                      .filter((mk: any) => !memberMarketIds.has(mk.id))
                      .map((mk: any) => (
                        <button
                          key={mk.id}
                          onClick={() => addMember.mutate(mk.id)}
                          className="w-full text-left px-3 py-2 rounded hover:bg-muted flex items-center gap-2.5"
                        >
                          {mk.image_url && (
                            <img src={mk.image_url} className="w-7 h-7 rounded object-cover" alt="" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">{mk.title}</div>
                            <div className="text-[10px] text-muted-foreground">
                              {Math.round(Number(mk.yes_price || 0) * 100)}% · {mk.status}
                            </div>
                          </div>
                          <Plus className="w-4 h-4 text-primary" />
                        </button>
                      ))}
                    {marketSearch.length >= 2 && searchResults.length === 0 && (
                      <p className="text-xs text-muted-foreground p-2">No matches</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminEvents;

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { getErrorMessage } from "../_shared/errors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GAMMA_API = "https://gamma-api.polymarket.com";

// Map Polymarket tags to our categories
const TAG_TO_CATEGORY: Record<string, string> = {
  politics: "Politics",
  crypto: "Crypto",
  sports: "Sports",
  "pop-culture": "Entertainment",
  science: "Science",
  business: "Economy",
  "ai-tech": "AI & Tech",
};

const CATEGORY_TO_TAGS: Record<string, string[]> = {
  Politics: ["politics"],
  Crypto: ["crypto", "bitcoin", "ethereum"],
  Sports: ["sports"],
  Entertainment: ["pop-culture", "entertainment"],
  Science: ["science"],
  Economy: ["business", "economics"],
  "AI & Tech": ["ai-tech", "technology", "ai"],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Check if called manually with auth (optional)
    const authHeader = req.headers.get("Authorization");
    let manualPresetId: string | null = null;
    let callingUserId: string | null = null;
    if (authHeader) {
      const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (user) {
        const { data: isSA } = await adminClient.rpc("has_role", { _user_id: user.id, _role: "super_admin" });
        const { data: isAdmin } = await adminClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
        if (!isSA && !isAdmin) {
          return new Response(JSON.stringify({ error: "Admin access required" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        callingUserId = user.id;
      }
      // Check if specific preset_id passed
      try {
        const body = await req.json();
        manualPresetId = body?.preset_id || null;
      } catch { /* no body */ }
    }

    // Fetch active presets
    let presetsQuery = adminClient.from("polymarket_presets").select("*").eq("enabled", true);
    if (manualPresetId) {
      presetsQuery = adminClient.from("polymarket_presets").select("*").eq("id", manualPresetId);
    }
    const { data: presets, error: presetsErr } = await presetsQuery;
    if (presetsErr || !presets || presets.length === 0) {
      return new Response(JSON.stringify({ message: "No active presets found", imported: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use calling admin as creator if available, otherwise fall back to super_admin
    let creatorId = callingUserId;
    if (!creatorId) {
      const { data: saRole } = await adminClient
        .from("user_roles")
        .select("user_id")
        .eq("role", "super_admin")
        .limit(1)
        .single();

      if (!saRole) {
        return new Response(JSON.stringify({ error: "No super_admin user found" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      creatorId = saRole.user_id;
    }

    // Get creator profile for name
    const { data: profile } = await adminClient
      .from("profiles")
      .select("display_name")
      .eq("id", creatorId)
      .single();
    const creatorName = profile?.display_name || "System";

    let totalImported = 0;
    const errors: string[] = [];

    for (const preset of presets) {
      const tags = CATEGORY_TO_TAGS[preset.category] || [preset.category.toLowerCase()];
      const maxEndDate = new Date();
      maxEndDate.setDate(maxEndDate.getDate() + preset.max_days_ahead);
      const maxImports = preset.max_imports_per_run || 10;
      let presetImported = 0;

      for (const tag of tags) {
        if (presetImported >= maxImports) break;
        try {
          const url = `${GAMMA_API}/events?tag=${encodeURIComponent(tag)}&active=true&closed=false&limit=50`;
          const resp = await fetch(url);
          if (!resp.ok) {
            errors.push(`Gamma API error for tag ${tag}: ${resp.status}`);
            continue;
          }

          const events = await resp.json();
          if (!Array.isArray(events)) continue;

          for (const event of events) {
            if (presetImported >= maxImports) break;
            if (!event.markets || !Array.isArray(event.markets)) continue;

            const eventSlug = event.slug || null;
            const isGroup = event.markets.length > 1;

            for (const market of event.markets) {
              if (presetImported >= maxImports) break;
              // Skip if no condition_id
              if (!market.conditionId && !market.id) continue;
              const polyId = market.conditionId || market.id;

              // Check end date
              const endDate = market.endDate || event.endDate;
              if (!endDate) continue;
              const marketEnd = new Date(endDate);
              if (marketEnd > maxEndDate || marketEnd < new Date()) continue;

              // Check if already imported
              const { data: existing } = await adminClient
                .from("markets")
                .select("id")
                .eq("polymarket_id", polyId)
                .limit(1);
              if (existing && existing.length > 0) continue;

              // Determine title and description
              const title = market.question || event.title || "Untitled Market";
              const description = market.description || event.description || title;
              const imageUrl = event.image || market.image || null;

              // Create the market
              const { error: insertErr } = await adminClient.from("markets").insert({
                title: title.slice(0, 500),
                description: description.slice(0, 2000),
                category: preset.category,
                status: preset.auto_approve ? "active" : "pending",
                market_type: "binary",
                creator_wallet: creatorId,
                creator_name: creatorName,
                end_date: marketEnd.toISOString().split("T")[0],
                resolution_source: "Polymarket",
                image_url: imageUrl,
                polymarket_id: polyId,
                polymarket_event_slug: eventSlug,
                yes_price: 0.5,
                no_price: 0.5,
                initial_liquidity: 0,
                liquidity: 0,
              });

              if (insertErr) {
                // Likely duplicate — skip
                if (!insertErr.message?.includes("duplicate")) {
                  errors.push(`Insert error for "${title.slice(0, 50)}": ${insertErr.message}`);
                }
              } else {
                totalImported++;
                presetImported++;
              }
            }

            // Group multi-market events under market_events
            if (isGroup && eventSlug) {
              try {
                // Find all our markets for this polymarket event
                const { data: groupMarkets } = await adminClient
                  .from("markets")
                  .select("id, title, polymarket_id")
                  .eq("polymarket_event_slug", eventSlug);

                if (groupMarkets && groupMarkets.length >= 2) {
                  // Upsert event group by slug
                  const eventEndDate = event.endDate
                    ? new Date(event.endDate).toISOString().split("T")[0]
                    : null;

                  const { data: existingGroup } = await adminClient
                    .from("market_events")
                    .select("id")
                    .eq("slug", eventSlug)
                    .maybeSingle();

                  let groupId = existingGroup?.id;
                  if (!groupId) {
                    const { data: inserted, error: groupErr } = await adminClient
                      .from("market_events")
                      .insert({
                        slug: eventSlug,
                        title: (event.title || eventSlug).slice(0, 500),
                        description: (event.description || "").slice(0, 2000) || null,
                        image_url: event.image || null,
                        category: preset.category,
                        end_date: eventEndDate,
                        status: "active",
                      })
                      .select("id")
                      .single();
                    if (groupErr) {
                      errors.push(`Event group insert error for ${eventSlug}: ${groupErr.message}`);
                    } else {
                      groupId = inserted?.id;
                    }
                  }

                  if (groupId) {
                    // Build a stable color palette indexed by Polymarket market order
                    const PALETTE = [
                      "#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6",
                      "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16",
                    ];
                    const polyOrder = new Map<string, number>();
                    event.markets.forEach((m: any, i: number) => {
                      const pid = m.conditionId || m.id;
                      if (pid) polyOrder.set(String(pid), i);
                    });

                    const rows = groupMarkets.map((m: any) => {
                      const idx = polyOrder.get(String(m.polymarket_id)) ?? 0;
                      return {
                        event_id: groupId,
                        market_id: m.id,
                        display_label: m.title.slice(0, 100),
                        sort_order: idx,
                        color: PALETTE[idx % PALETTE.length],
                      };
                    });

                    // Upsert members (market_id is unique)
                    const { error: memberErr } = await adminClient
                      .from("market_event_members")
                      .upsert(rows, { onConflict: "market_id" });
                    if (memberErr) {
                      errors.push(`Member upsert error for ${eventSlug}: ${memberErr.message}`);
                    }
                  }
                }
              } catch (e) {
                errors.push(`Grouping error for ${eventSlug}: ${getErrorMessage(e)}`);
              }
            }
          }
        } catch (err) {
          errors.push(`Fetch error for tag ${tag}: ${(getErrorMessage(err))}`);
        }
      }
    }


    return new Response(
      JSON.stringify({
        success: true,
        imported: totalImported,
        presets_processed: presets.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (getErrorMessage(err)) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

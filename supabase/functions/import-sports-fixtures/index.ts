import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SPORT_API_MAP: Record<string, { host: string; fixturePath: string }> = {
  football: { host: "v3.football.api-sports.io", fixturePath: "/fixtures" },
  basketball: { host: "v1.basketball.api-sports.io", fixturePath: "/games" },
  baseball: { host: "v1.baseball.api-sports.io", fixturePath: "/games" },
  hockey: { host: "v1.hockey.api-sports.io", fixturePath: "/games" },
  rugby: { host: "v1.rugby.api-sports.io", fixturePath: "/games" },
  handball: { host: "v1.handball.api-sports.io", fixturePath: "/games" },
  volleyball: { host: "v1.volleyball.api-sports.io", fixturePath: "/games" },
  nfl: { host: "v1.american-football.api-sports.io", fixturePath: "/games" },
  mma: { host: "v1.mma.api-sports.io", fixturePath: "/fights" },
};

function buildMarketTitle(homeTeam: string, awayTeam: string, league: string): string {
  return `${homeTeam} vs ${awayTeam}${league ? ` — ${league}` : ""}`;
}

function buildMarketDescription(homeTeam: string, awayTeam: string, league: string, date: string): string {
  const d = new Date(date);
  const dateStr = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  return `Who will win the match between ${homeTeam} and ${awayTeam}? ${league ? `League: ${league}. ` : ""}Scheduled for ${dateStr}. Market resolves based on the official final result.`;
}

/**
 * Generate AI description and details for a sports market.
 * Returns { description, details } or null on failure.
 */
async function generateAiContent(
  homeTeam: string,
  awayTeam: string,
  league: string,
  sportType: string,
  matchDate: string,
  lovableApiKey: string
): Promise<{ description: string; details: string } | null> {
  try {
    const dateStr = new Date(matchDate).toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    });

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a sports prediction market writer. You will output a JSON object with two fields:
1. "description": A clear, concise 2-3 sentence market description explaining what users are predicting and how the market resolves. No markdown. Max 350 characters.
2. "details": Rich background context about the matchup in markdown (use headers, bullet points, bold). Include team form, head-to-head history hints, key factors, and why this match matters. 300-700 characters.
Output ONLY valid JSON, no code fences.`,
          },
          {
            role: "user",
            content: `Sport: ${sportType}\nMatch: ${homeTeam} vs ${awayTeam}\nLeague: ${league}\nDate: ${dateStr}\n\nGenerate description and details.`,
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      console.warn(`AI content generation failed (${aiResponse.status}) for ${homeTeam} vs ${awayTeam}`);
      return null;
    }

    const aiData = await aiResponse.json();
    const raw = aiData.choices?.[0]?.message?.content || "";
    // Strip possible code fences
    const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      description: typeof parsed.description === "string" ? parsed.description.slice(0, 2000) : "",
      details: typeof parsed.details === "string" ? parsed.details.slice(0, 5000) : "",
    };
  } catch (err) {
    console.warn(`AI content parse error for ${homeTeam} vs ${awayTeam}:`, err);
    return null;
  }
}

/**
 * Generate an AI image for a sports market and upload to storage.
 * Returns the public URL or null on failure.
 */
async function generateSportsImage(
  title: string,
  sportType: string,
  homeTeam: string,
  awayTeam: string,
  league: string,
  lovableApiKey: string,
  adminClient: any
): Promise<string | null> {
  try {
    const prompt = `Generate a vibrant, dynamic sports banner image for a ${sportType} match: ${homeTeam} vs ${awayTeam} in ${league}. Show the sport in action with team colors and energy. Do NOT include any text or logos. Make it photorealistic, dramatic lighting, stadium atmosphere, high quality.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-image-preview",
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });

    if (!aiResponse.ok) {
      console.warn(`AI image generation failed (${aiResponse.status}) for "${title}"`);
      return null;
    }

    const aiData = await aiResponse.json();
    const imageUrl = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageUrl || !imageUrl.startsWith("data:image")) {
      console.warn(`No image returned for "${title}"`);
      return null;
    }

    // Upload base64 image to storage
    const base64Data = imageUrl.split(",")[1];
    const mimeMatch = imageUrl.match(/data:(image\/\w+);/);
    const mimeType = mimeMatch ? mimeMatch[1] : "image/png";
    const ext = mimeType.split("/")[1] || "png";
    const fileName = `sport-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const binaryData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

    const { error: uploadErr } = await adminClient.storage
      .from("market-images")
      .upload(fileName, binaryData, { contentType: mimeType });

    if (uploadErr) {
      console.warn(`Storage upload failed for "${title}":`, uploadErr.message);
      return null;
    }

    const { data: urlData } = adminClient.storage.from("market-images").getPublicUrl(fileName);
    return urlData.publicUrl;
  } catch (err) {
    console.warn(`AI image generation error for "${title}":`, err);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apiKey = Deno.env.get("API_FOOTBALL_KEY");
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API_FOOTBALL_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth check for manual calls
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
      try {
        const body = await req.json();
        manualPresetId = body?.preset_id || null;
      } catch { /* no body */ }
    }

    // Fetch presets
    let presetsQuery = adminClient.from("sports_import_presets").select("*").eq("enabled", true);
    if (manualPresetId) {
      presetsQuery = adminClient.from("sports_import_presets").select("*").eq("id", manualPresetId);
    }
    const { data: presets, error: presetsErr } = await presetsQuery;
    if (presetsErr || !presets || presets.length === 0) {
      return new Response(JSON.stringify({ message: "No active sports presets found", imported: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use the calling admin as creator if available, otherwise fall back to super_admin
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

    const { data: profile } = await adminClient.from("profiles").select("display_name").eq("id", creatorId).single();
    const creatorName = profile?.display_name || "System";

    let totalImported = 0;
    const errors: string[] = [];

    for (const preset of presets) {
      const sportConfig = SPORT_API_MAP[preset.sport_type];
      if (!sportConfig) {
        errors.push(`Unsupported sport type: ${preset.sport_type}`);
        continue;
      }

      const maxImports = preset.max_imports_per_run || 10;
      const maxEndDate = new Date();
      maxEndDate.setDate(maxEndDate.getDate() + (preset.max_days_ahead || 14));
      let presetImported = 0;

      try {
        let fixturesUrl: string;
        const headers = { "x-apisports-key": apiKey };

        if (preset.sport_type === "football") {
          fixturesUrl = `https://${sportConfig.host}${sportConfig.fixturePath}?league=${preset.league_id}&next=${Math.min(maxImports * 2, 50)}`;
        } else if (preset.sport_type === "mma") {
          // MMA API uses date-based queries; fetch fights for the next N days
          const daysAhead = preset.max_days_ahead || 14;
          const dates: string[] = [];
          for (let d = 0; d <= Math.min(daysAhead, 7); d++) {
            const dt = new Date();
            dt.setDate(dt.getDate() + d);
            dates.push(dt.toISOString().split("T")[0]);
          }
          // Fetch first date; we'll handle multiple dates below
          fixturesUrl = `https://${sportConfig.host}${sportConfig.fixturePath}?date=${dates[0]}`;
        } else {
          const currentSeason = new Date().getFullYear();
          fixturesUrl = `https://${sportConfig.host}${sportConfig.fixturePath}?league=${preset.league_id}&season=${currentSeason}`;
        }

        const resp = await fetch(fixturesUrl, { headers });
        if (!resp.ok) {
          errors.push(`API-Sports error for league ${preset.league_name}: ${resp.status}`);
          continue;
        }

        const data = await resp.json();
        if (data?.errors && Object.keys(data.errors).length > 0) {
          errors.push(`API error for ${preset.league_name}: ${JSON.stringify(data.errors)}`);
          continue;
        }

        let fixtures = data?.response || [];

        // For MMA, fetch additional days to get more upcoming fights
        if (preset.sport_type === "mma") {
          const daysAhead = preset.max_days_ahead || 14;
          for (let d = 1; d <= Math.min(daysAhead, 7); d++) {
            const dt = new Date();
            dt.setDate(dt.getDate() + d);
            const dateStr = dt.toISOString().split("T")[0];
            try {
              const dayResp = await fetch(
                `https://${sportConfig.host}${sportConfig.fixturePath}?date=${dateStr}`,
                { headers }
              );
              if (dayResp.ok) {
                const dayData = await dayResp.json();
                if (!dayData?.errors || Object.keys(dayData.errors).length === 0) {
                  fixtures = fixtures.concat(dayData?.response || []);
                }
              }
            } catch { /* skip failed date */ }
          }
          // Filter to only main card fights (is_main = true) from UFC events
          fixtures = fixtures.filter((f: any) => f.is_main !== false);
        }

        console.log(`[${preset.league_name}] API returned ${fixtures.length} fixtures`);

        for (const fixture of fixtures) {
          if (presetImported >= maxImports) break;

          let matchId: string;
          let matchDate: string;
          let homeTeam: string;
          let awayTeam: string;
          let homeLogo: string;
          let awayLogo: string;
          let leagueName: string;

          if (preset.sport_type === "football") {
            matchId = String(fixture.fixture?.id || "");
            matchDate = fixture.fixture?.date || "";
            homeTeam = fixture.teams?.home?.name || "TBD";
            awayTeam = fixture.teams?.away?.name || "TBD";
            homeLogo = fixture.teams?.home?.logo || "";
            awayLogo = fixture.teams?.away?.logo || "";
            leagueName = fixture.league?.name || preset.league_name;
          } else if (preset.sport_type === "mma") {
            // MMA uses fighters structure instead of teams
            matchId = String(fixture.id || "");
            matchDate = fixture.date || "";
            homeTeam = fixture.fighters?.first?.name || "";
            awayTeam = fixture.fighters?.second?.name || "";
            // Skip fights with TBD/missing fighter names
            if (!homeTeam || !awayTeam) {
              console.log(`  Skipped MMA fixture ${matchId}: missing fighter names`);
              continue;
            }
            homeLogo = fixture.fighters?.first?.logo || "";
            awayLogo = fixture.fighters?.second?.logo || "";
            leagueName = fixture.league?.name || preset.league_name;
          } else {
            matchId = String(fixture.id || fixture.game?.id || "");
            matchDate = fixture.date || fixture.game?.date?.start || "";
            homeTeam = fixture.teams?.home?.name || "TBD";
            awayTeam = fixture.teams?.away?.name || "TBD";
            homeLogo = fixture.teams?.home?.logo || "";
            awayLogo = fixture.teams?.away?.logo || "";
            leagueName = fixture.league?.name || preset.league_name;
          }

          if (!matchId || !matchDate) {
            console.log(`  Skipped fixture: missing matchId or matchDate`);
            continue;
          }

          const fixtureDate = new Date(matchDate);
          if (fixtureDate < new Date()) {
            console.log(`  Skipped ${homeTeam} vs ${awayTeam}: in the past (${matchDate})`);
            continue;
          }
          if (fixtureDate > maxEndDate) {
            console.log(`  Skipped ${homeTeam} vs ${awayTeam}: too far ahead (${matchDate})`);
            continue;
          }

          // Check if already imported
          const { data: existing } = await adminClient
            .from("markets")
            .select("id")
            .eq("sport_match_id", matchId)
            .limit(1);
          if (existing && existing.length > 0) {
            console.log(`  Skipped ${homeTeam} vs ${awayTeam}: already imported (match ${matchId})`);
            continue;
          }

          const title = buildMarketTitle(homeTeam, awayTeam, leagueName);
          let description = buildMarketDescription(homeTeam, awayTeam, leagueName, matchDate);
          let details: string | null = null;

          // Generate AI description + details
          if (lovableApiKey) {
            const aiContent = await generateAiContent(
              homeTeam, awayTeam, leagueName, preset.sport_type, matchDate, lovableApiKey
            );
            if (aiContent) {
              if (aiContent.description) description = aiContent.description;
              if (aiContent.details) details = aiContent.details;
            }
          }

          // Generate AI image, fall back to league/team logo
          let imageUrl: string | null = null;
          if (lovableApiKey) {
            imageUrl = await generateSportsImage(
              title, preset.sport_type, homeTeam, awayTeam, leagueName,
              lovableApiKey, adminClient
            );
          }
          if (!imageUrl) {
            imageUrl = fixture.league?.logo || homeLogo || preset.league_logo || null;
          }

          const isFootball = preset.sport_type === "football";
          const isMma = preset.sport_type === "mma";
          const isMultiOption = isFootball || isMma;
          const marketType = isMultiOption ? "multi" : "binary";

          // Set auto_resolve_deadline to the EXACT kickoff time — this is the betting cutoff.
          // Resolution is independent: check-sports-resolve polls API-Football for finished status.
          const autoResolveDeadline = fixtureDate;

          // Set end_date to the DAY AFTER kickoff since end_date is a date-only column
          // and same-day matches would be closed prematurely by the cron job
          const endDateAfterKickoff = new Date(fixtureDate.getTime() + 24 * 60 * 60 * 1000);

          const { data: newMarket, error: insertErr } = await adminClient.from("markets").insert({
            title: title.slice(0, 500),
            description: description.slice(0, 2000),
            details: details,
            category: "Sports",
            status: preset.auto_approve ? "active" : "pending",
            market_type: marketType,
            creator_wallet: creatorId,
            creator_name: creatorName,
            end_date: endDateAfterKickoff.toISOString(),
            resolution_source: "API-Football",
            image_url: imageUrl,
            sport_type: preset.sport_type,
            sport_match_id: matchId,
            sport_league: leagueName,
            sport_predicted_outcome: isMultiOption ? "multi_option" : "home_win",
            auto_resolve: true,
            auto_resolve_deadline: autoResolveDeadline.toISOString(),
            yes_price: isFootball ? 0.33 : 0.5,
            no_price: isFootball ? 0.33 : 0.5,
            initial_liquidity: 0,
            liquidity: 0,
          }).select("id").single();

          if (insertErr) {
            if (!insertErr.message?.includes("duplicate")) {
              errors.push(`Insert error for "${title.slice(0, 50)}": ${insertErr.message}`);
            }
            continue;
          }

          // For multi-option markets, create options
          if (isMultiOption && newMarket) {
            let options;
            if (isFootball) {
              options = [
                { label: `${homeTeam} Win`, market_id: newMarket.id, price: 0.33, sort_order: 0 },
                { label: "Draw", market_id: newMarket.id, price: 0.34, sort_order: 1 },
                { label: `${awayTeam} Win`, market_id: newMarket.id, price: 0.33, sort_order: 2 },
              ];
            } else {
              // MMA: two fighter options, no draw
              options = [
                { label: `${homeTeam} Win`, market_id: newMarket.id, price: 0.50, sort_order: 0 },
                { label: `${awayTeam} Win`, market_id: newMarket.id, price: 0.50, sort_order: 1 },
              ];
            }
            const { error: optErr } = await adminClient.from("market_options").insert(options);
            if (optErr) {
              errors.push(`Options error for "${title.slice(0, 50)}": ${optErr.message}`);
            }
          }

          totalImported++;
          presetImported++;
        }
      } catch (err: any) {
        errors.push(`Fetch error for ${preset.league_name}: ${(err instanceof Error ? err.message : String(err))}`);
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
  } catch (err: any) {
    return new Response(JSON.stringify({ error: (err instanceof Error ? err.message : String(err)) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

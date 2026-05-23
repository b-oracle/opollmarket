import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const clientId = Deno.env.get("X_CLIENT_ID")!;
    const clientSecret = Deno.env.get("X_CLIENT_SECRET")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const redirectWithError = (redirectUrl: string, msg: string) => {
      const sep = redirectUrl.includes("?") ? "&" : "?";
      return Response.redirect(`${redirectUrl}${sep}twitter=error&msg=${encodeURIComponent(msg)}`, 302);
    };

    if (error || !code || !state) {
      return Response.redirect(`https://opoll.org/profile?twitter=error&msg=${encodeURIComponent(error || "Missing code")}`, 302);
    }

    // Look up session
    const { data: session, error: sessionErr } = await adminClient
      .from("twitter_auth_sessions")
      .select("*")
      .eq("state", state)
      .maybeSingle();

    if (sessionErr || !session) {
      return Response.redirect(`https://opoll.org/profile?twitter=error&msg=Invalid+session`, 302);
    }

    const redirectUrl = session.redirect_url || "https://opoll.org/profile";

    // Exchange code for tokens
    const callbackUrl = `${supabaseUrl}/functions/v1/twitter-auth-callback`;
    const tokenResp = await fetch("https://api.x.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: new URLSearchParams({
        code,
        grant_type: "authorization_code",
        redirect_uri: callbackUrl,
        code_verifier: session.code_verifier,
      }),
    });

    if (!tokenResp.ok) {
      const errText = await tokenResp.text();
      console.error("Token exchange failed:", errText);
      // Clean up session
      await adminClient.from("twitter_auth_sessions").delete().eq("id", session.id);
      return redirectWithError(redirectUrl, "Token exchange failed");
    }

    const tokens = await tokenResp.json();

    // Fetch user profile from X
    const meResp = await fetch("https://api.x.com/2/users/me?user.fields=profile_image_url", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!meResp.ok) {
      console.error("Failed to fetch X profile:", await meResp.text());
      await adminClient.from("twitter_auth_sessions").delete().eq("id", session.id);
      return redirectWithError(redirectUrl, "Failed to fetch X profile");
    }

    const meData = await meResp.json();
    const twitterId = meData.data.id;
    const twitterUsername = meData.data.username;
    const twitterAvatarUrl = meData.data.profile_image_url?.replace("_normal", "_400x400") || null;

    // Check if this X account is already linked to another user
    const { data: existingProfile } = await adminClient
      .from("profiles")
      .select("id")
      .eq("twitter_id", twitterId)
      .neq("id", session.user_id)
      .maybeSingle();

    if (existingProfile) {
      await adminClient.from("twitter_auth_sessions").delete().eq("id", session.id);
      return redirectWithError(redirectUrl, "This X account is already linked to another OPollmarket account");
    }

    // Store tokens
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    await adminClient
      .from("twitter_tokens")
      .upsert({
        user_id: session.user_id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        expires_at: expiresAt,
        scopes: tokens.scope || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    // Update profile
    await adminClient
      .from("profiles")
      .update({
        twitter_username: twitterUsername,
        twitter_id: twitterId,
        twitter_avatar_url: twitterAvatarUrl,
        twitter_linked_at: new Date().toISOString(),
      })
      .eq("id", session.user_id);

    // Clean up session
    await adminClient.from("twitter_auth_sessions").delete().eq("id", session.id);

    const sep = redirectUrl.includes("?") ? "&" : "?";
    return Response.redirect(`${redirectUrl}${sep}twitter=linked`, 302);
  } catch (err: any) {
    console.error("twitter-auth-callback error:", err);
    return Response.redirect(`https://opoll.org/profile?twitter=error&msg=${encodeURIComponent(err.message)}`, 302);
  }
});

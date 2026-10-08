import { createClient } from "npm:@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Provider = "google" | "openai" | "anthropic";
type Tier = "free" | "cheap" | "balanced" | "premium";
type Candidate = {
  provider: Provider;
  model_id: string;
  display_name: string;
  tier: Tier;
  cost_rank: number;
  supports_tools: boolean;
  enabled: boolean;
  metadata: Record<string, unknown>;
};

function classify(provider: Provider, rawId: string, metadata: Record<string, unknown>): Candidate | null {
  const modelId = rawId.replace(/^models\//, "");
  const id = modelId.toLowerCase();
  if (/embed|embedding|image|audio|tts|transcri|moderation|realtime/.test(id)) return null;

  let tier: Tier | null = null;
  let rank = 100;
  let safe = false;
  if (provider === "google" && /gemini/.test(id) && /flash/.test(id) && !/pro/.test(id)) {
    tier = "free"; rank = /lite/.test(id) ? 0 : 5; safe = true;
  } else if (provider === "openai" && /gpt-/.test(id)) {
    if (/luna|mini|nano/.test(id)) { tier = "cheap"; rank = 10; safe = true; }
    else if (/terra/.test(id)) { tier = "balanced"; rank = 30; safe = true; }
    else if (/sol/.test(id)) { tier = "premium"; rank = 50; safe = true; }
  } else if (provider === "anthropic" && /claude/.test(id)) {
    if (/haiku/.test(id)) { tier = "cheap"; rank = 20; safe = true; }
    else if (/sonnet/.test(id)) { tier = "balanced"; rank = 40; safe = true; }
    else if (/opus/.test(id)) { tier = "premium"; rank = 60; safe = true; }
  }
  if (!tier) return null;

  const pretty = modelId
    .replace(/-20\d{6,8}$/, "")
    .split("-")
    .map((part) => part ? part[0].toUpperCase() + part.slice(1) : part)
    .join(" ")
    .replace(/^Gpt /, "GPT ")
    .replace(/^Claude /, "Claude ")
    .replace(/^Gemini /, "Gemini ");

  return {
    provider,
    model_id: modelId,
    display_name: `${provider === "openai" ? "OpenAI " : ""}${pretty}`,
    tier,
    cost_rank: rank,
    supports_tools: true,
    enabled: false, // New IDs require a configured rate before automatic submittal use.
    metadata: { ...metadata, auto_discovered: true, pricing_status: "unverified" },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userError } = await authClient.auth.getUser();
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: "Authentication required." }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const {data:profile} = await authClient.from("profiles").select("is_approved,tenant_id").eq("user_id",userData.user.id).maybeSingle();
  if(!profile?.is_approved || !profile?.tenant_id)return new Response(JSON.stringify({error:"Workspace unavailable."}),{status:403,headers:{...corsHeaders,"Content-Type":"application/json"}});
  const admin = createClient(url, serviceKey);
  const { data: latest } = await admin
    .from("ai_models")
    .select("last_seen_at")
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const age = latest?.last_seen_at ? Date.now() - new Date(latest.last_seen_at).getTime() : Infinity;
  const force = new URL(req.url).searchParams.get("refresh") === "1" && age > 5 * 60 * 1000;
  const stale = !latest?.last_seen_at || Date.now() - new Date(latest.last_seen_at).getTime() > 24 * 60 * 60 * 1000;

  if (force || stale) {
    const discovered: Candidate[] = [];
    const tasks: Promise<void>[] = [];

    const googleKey = Deno.env.get("GEMINI_API_KEY");
    if (googleKey) tasks.push((async () => {
      let pageToken = "";
      const found: Candidate[] = [];
      do {
        const endpoint = new URL("https://generativelanguage.googleapis.com/v1beta/models");
        endpoint.searchParams.set("pageSize", "1000");
        if (pageToken) endpoint.searchParams.set("pageToken", pageToken);
        const response = await fetch(endpoint, {headers:{"x-goog-api-key":googleKey}, signal:AbortSignal.timeout(8000)});
        if (!response.ok) throw new Error(`Google models API: ${response.status}`);
        const json = await response.json();
        for (const model of json.models ?? []) {
          if (!(model.supportedGenerationMethods ?? []).includes("generateContent")) continue;
          const item = classify("google", model.name ?? "", model);
          if (item) found.push(item);
        }
        pageToken = json.nextPageToken || "";
      } while (pageToken);
      discovered.push(...found);
    })().catch((error) => console.warn("Google model discovery failed", String(error))));

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (openaiKey) tasks.push((async () => {
      const response = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${openaiKey}` }, signal:AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`OpenAI models API: ${response.status}`);
      const json = await response.json();
      for (const model of json.data ?? []) {
        const item = classify("openai", model.id ?? "", model);
        if (item) discovered.push(item);
      }
    })().catch((error) => console.warn("OpenAI model discovery failed", String(error))));

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (anthropicKey) tasks.push((async () => {
      let after = "";
      const found: Candidate[] = [];
      do {
        const response = await fetch("https://api.anthropic.com/v1/models?limit=100" + (after ? "&after_id=" + encodeURIComponent(after) : ""), {
          headers: { "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" }, signal:AbortSignal.timeout(8000),
        });
        if (!response.ok) throw new Error(`Anthropic models API: ${response.status}`);
        const json = await response.json();
        for (const model of json.data ?? []) {
          const item = classify("anthropic", model.id ?? "", model);
          if (item) found.push(item);
        }
        after = json.has_more ? json.last_id : "";
        if (json.has_more && !after) throw new Error("Incomplete model list");
      } while (after);
      discovered.push(...found);
    })().catch((error) => console.warn("Anthropic model discovery failed", String(error))));

    await Promise.all(tasks);
    if (discovered.length) {
      const ids = discovered.map((item) => `${item.provider}:${item.model_id}`);
      const { data: existing } = await admin.from("ai_models").select("provider,model_id,enabled,tier,cost_rank,metadata");
      const enabled = new Map((existing ?? []).map((row) => [`${row.provider}:${row.model_id}`, row]));
      const now = new Date().toISOString();
      const rows = discovered.map((item) => {
        const previous = enabled.get(`${item.provider}:${item.model_id}`);
        return {
          ...item,
          enabled: previous?.enabled ?? false,
          tier: previous?.tier ?? item.tier,
          cost_rank: previous?.cost_rank ?? item.cost_rank,
          metadata: previous ? { ...item.metadata, ...(previous.metadata || {}), pricing_status: previous.metadata?.pricing_status || "configured" } : item.metadata,
          last_seen_at: now,
        };
      });
      const { error } = await admin.from("ai_models").upsert(rows, { onConflict: "provider,model_id" });
      if (error) console.error("AI model registry upsert failed", error.message);
      console.info("AI model registry refreshed", { discovered: ids.length });
    }
  }

  const { data, error } = await admin
    .from("ai_models")
    .select("provider,model_id,display_name,tier,cost_rank,supports_tools,last_seen_at")
    .eq("enabled", true)
    .order("cost_rank")
    .order("display_name");

  return new Response(JSON.stringify({ models: data ?? [], refreshed: force || stale, error: error?.message }), {
    status: error ? 500 : 200,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "private, max-age=300" },
  });
});


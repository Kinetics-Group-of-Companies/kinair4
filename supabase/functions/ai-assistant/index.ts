import { convertToModelMessages, streamText, tool, stepCountIs, type UIMessage } from "npm:ai@5";
// Pinned exact: @ai-sdk/anthropic majors drifted their internal provider
// "specificationVersion" (v1 -> v2 -> v3 -> v4) without a coordinated ai@5
// major bump. ai@5 only accepts v2, and only the 2.0.x line implements it
// (2.1.0-beta+ already moved to v3, 3.x is v3, 4.x is v4) - so @4 here was
// never compatible with ai@5 and failed every request with "Unsupported
// model version v4 ... AI SDK 5 only supports models that implement
// specification version 'v2'".
import { createAnthropic } from "npm:@ai-sdk/anthropic@2.0.101";
import { createOpenAI } from "npm:@ai-sdk/openai@2.0.101";
import { createGoogleGenerativeAI } from "npm:@ai-sdk/google@2.0.0";
import { z } from "npm:zod@3";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "X-KINAIR-AI-Provider, X-KINAIR-AI-Model",
};

const ANTHROPIC_MODEL = "claude-opus-5";
const OPENAI_MODEL = "gpt-5.6-sol";
const GEMINI_MODEL = "gemini-2.5-flash";

type Row = Record<string, any>;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// Linear interpolation of y at x over a curve sorted by x ascending.
function interpolate(points: { x: number; y: number }[], x: number): number | null {
  if (points.length < 2) return null;
  if (x < points[0].x || x > points[points.length - 1].x) return null;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (x <= b.x) {
      const span = b.x - a.x;
      if (span === 0) return b.y;
      return a.y + ((x - a.x) / span) * (b.y - a.y);
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!openaiApiKey && !geminiApiKey && !anthropicApiKey) {
      return new Response(JSON.stringify({ error: "No AI provider key is configured." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (openaiApiKey && !openaiApiKey.startsWith("sk-")) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY is invalid." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!openaiApiKey && anthropicApiKey && !anthropicApiKey.startsWith("sk-ant-")) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY is invalid." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    // The frontend only shows the assistant to signed-in users, but that's a UI
    // gate, not access control — verify the session here too, since every tool
    // call below uses the caller's own AI credits and quota.
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Authentication required." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages, aiMode = "standard" }: {
      messages: UIMessage[];
      aiMode?: "standard" | "advanced" | "openai" | "anthropic";
    } = await req.json();

    const listSeries = tool({
      description:
        "List the fan series available in the catalogue, with their type, description and certifications. Use this to understand what product families exist before recommending anything.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabase
          .from("fan_series")
          .select(
            "id,name,fan_type,description,fire_rating,amca_certified,ce_certified,atex_certified,iso_certified,ul_certified",
          )
          .limit(100);
        if (error) return { error: error.message };
        return { series: data ?? [] };
      },
    });

    const findFans = tool({
      description:
        "Find fan models from the real catalogue that can deliver a duty point (airflow + static pressure). Returns interpolated operating point: static pressure available, shaft power, efficiency and noise. Always use this before recommending a model; never invent model names or performance numbers.",
      inputSchema: z.object({
        airflow_cmh: z.number().describe("Required airflow in m3/h"),
        static_pressure_pa: z.number().describe("Required static pressure in Pa"),
        fan_type: z.string().nullable().describe("Optional fan type filter, e.g. 'Axial'"),
        series_name: z.string().nullable().describe("Optional series name filter (partial match)"),
        min_diameter_mm: z.number().nullable(),
        max_diameter_mm: z.number().nullable(),
        motor_poles: z.number().nullable().describe("Optional motor pole filter, e.g. 4 or 6"),
        max_noise_db: z.number().nullable().describe("Optional maximum overall sound power in dB"),
        limit: z.number().nullable().describe("How many results to return (default 6)"),
      }),
      execute: async (input) => {
        const limit = Math.min(Math.max(input.limit ?? 6, 1), 12);

        let seriesQuery = supabase.from("fan_series").select("id,name,fan_type,description,nomenclature_template");
        if (input.fan_type) seriesQuery = seriesQuery.ilike("fan_type", `%${input.fan_type}%`);
        if (input.series_name) seriesQuery = seriesQuery.ilike("name", `%${input.series_name}%`);
        const { data: series, error: seriesError } = await seriesQuery.limit(100);
        if (seriesError) return { error: seriesError.message };
        if (!series?.length) return { results: [], note: "No matching series in the catalogue." };
        const seriesById = new Map<string, Row>(series.map((s: Row) => [s.id, s]));

        let modelQuery = supabase
          .from("fan_models")
          .select("id,model_name,product_code,diameter,series_id,motor_poles")
          .in("series_id", series.map((s: Row) => s.id));
        if (input.min_diameter_mm != null) modelQuery = modelQuery.gte("diameter", input.min_diameter_mm);
        if (input.max_diameter_mm != null) modelQuery = modelQuery.lte("diameter", input.max_diameter_mm);
        const { data: models, error: modelError } = await modelQuery.limit(400);
        if (modelError) return { error: modelError.message };
        if (!models?.length) return { results: [], note: "No models match those filters." };
        const modelById = new Map<string, Row>(models.map((m: Row) => [m.id, m]));

        const { data: configs, error: configError } = await supabase
          .from("blade_configurations")
          .select("id,fan_model_id,blade_count")
          .in("fan_model_id", models.map((m: Row) => m.id))
          .limit(2000);
        if (configError) return { error: configError.message };
        if (!configs?.length) return { results: [], note: "No blade configurations found." };
        const configById = new Map<string, Row>(configs.map((c: Row) => [c.id, c]));
        const configIds = configs.map((c: Row) => c.id);

        const perf: Row[] = [];
        for (const ids of chunk(configIds, 100)) {
          let q = supabase
            .from("performance_data")
            .select(
              "blade_config_id,motor_poles,blade_angle,airflow,static_pressure,shaft_power,efficiency,total_efficiency,point_index",
            )
            .in("blade_config_id", ids);
          if (input.motor_poles != null) q = q.eq("motor_poles", input.motor_poles);
          const { data, error } = await q.limit(20000);
          if (error) return { error: error.message };
          if (data) perf.push(...data);
        }
        if (!perf.length) return { results: [], note: "No performance data available for those models." };

        // Group curves by blade config + poles + blade angle
        const curves = new Map<string, Row[]>();
        for (const p of perf) {
          const key = `${p.blade_config_id}|${p.motor_poles ?? ""}|${p.blade_angle}`;
          const list = curves.get(key);
          if (list) list.push(p);
          else curves.set(key, [p]);
        }

        type Candidate = {
          key: string;
          config_id: string;
          model_id: string;
          poles: number | null;
          blade_angle: number;
          available_pressure_pa: number;
          shaft_power_kw: number;
          efficiency_percent: number | null;
          margin_pa: number;
        };
        const candidates: Candidate[] = [];

        for (const [key, points] of curves) {
          const sorted = [...points].sort((a, b) => a.airflow - b.airflow);
          const pressure = interpolate(
            sorted.map((p) => ({ x: p.airflow, y: p.static_pressure })),
            input.airflow_cmh,
          );
          if (pressure == null || pressure < input.static_pressure_pa) continue;
          const power = interpolate(
            sorted.map((p) => ({ x: p.airflow, y: p.shaft_power })),
            input.airflow_cmh,
          );
          const eff = interpolate(
            sorted.map((p) => ({ x: p.airflow, y: p.total_efficiency ?? p.efficiency })),
            input.airflow_cmh,
          );
          const first = sorted[0];
          candidates.push({
            key,
            config_id: first.blade_config_id,
            model_id: configById.get(first.blade_config_id)?.fan_model_id,
            poles: first.motor_poles ?? null,
            blade_angle: first.blade_angle,
            available_pressure_pa: Math.round(pressure),
            shaft_power_kw: power == null ? 0 : Math.round(power * 1000) / 1000,
            efficiency_percent: eff == null ? null : Math.round(eff * 10) / 10,
            margin_pa: Math.round(pressure - input.static_pressure_pa),
          });
        }

        if (!candidates.length) {
          return {
            results: [],
            note:
              "No model in the catalogue reaches that duty point with the given filters. Suggest a larger diameter, higher speed (fewer poles) or a lower duty.",
          };
        }

        // Best = least oversized pressure, then lowest shaft power
        candidates.sort(
          (a, b) => a.margin_pa - b.margin_pa || a.shaft_power_kw - b.shaft_power_kw,
        );

        // One entry per model (best angle/pole combination)
        const seen = new Set<string>();
        const picked: Candidate[] = [];
        for (const c of candidates) {
          if (!c.model_id || seen.has(c.model_id)) continue;
          seen.add(c.model_id);
          picked.push(c);
          if (picked.length >= limit * 2) break;
        }

        const { data: noise } = await supabase
          .from("noise_data")
          .select("blade_config_id,motor_poles,blade_angle,overall")
          .in("blade_config_id", picked.map((c) => c.config_id));

        const results = picked
          .map((c) => {
            const model = modelById.get(c.model_id) ?? {};
            const s = seriesById.get(model.series_id) ?? {};
            const n = (noise ?? []).find(
              (x: Row) =>
                x.blade_config_id === c.config_id &&
                (x.motor_poles ?? null) === c.poles &&
                Number(x.blade_angle) === Number(c.blade_angle),
            );
            return {
              series: s.name,
              fan_type: s.fan_type,
              model:
                model.model_name ||
                model.product_code ||
                String(s.nomenclature_template || "{series}-{size}")
                  .replaceAll("{series}", String(s.name || "KINAIR"))
                  .replaceAll("{size}", String(model.diameter || "")),
              diameter_mm: model.diameter,
              motor_poles: c.poles,
              blade_angle_deg: c.blade_angle,
              blade_count: configById.get(c.config_id)?.blade_count,
              duty_airflow_cmh: input.airflow_cmh,
              available_static_pressure_pa: c.available_pressure_pa,
              pressure_margin_pa: c.margin_pa,
              shaft_power_kw: c.shaft_power_kw,
              total_efficiency_percent: c.efficiency_percent,
              sound_power_db: n?.overall ?? null,
            };
          })
          .filter((r) => input.max_noise_db == null || r.sound_power_db == null || r.sound_power_db <= input.max_noise_db)
          .slice(0, limit);

        return { results, count: results.length };
      },
    });

    // Hands the duty point to the app, which runs the official KINAIR selection
    // engine in the browser and produces the datasheet PDF right in the chat.
    const prepareDatasheet = tool({
      description:
        "Run the official KINAIR selection engine on a duty point and produce a document directly in the chat: the full datasheet PDF, the dimensional drawing only, or the sound (noise) data only. Call this WHENEVER the user gives an airflow and a static pressure (with or without a series name) and wants a selection or any document. Also call it AGAIN with a different optimize_for when the user asks for a better/quieter/more efficient/lower power option, or asks for just the drawing or just the noise data of the model already selected. Keep the user's own units.",
      inputSchema: z.object({
        airflow: z.number().describe("Airflow value exactly as the user gave it"),
        airflow_unit: z.enum(["CMH", "LPS", "CFM", "CMS"]).describe("Unit of the airflow value"),
        static_pressure: z.number().describe("Static pressure value as the user gave it"),
        pressure_unit: z.enum(["Pa", "inwg", "mmwg"]).describe("Unit of the pressure value"),
        series_name: z.string().nullable().describe("Series the user asked for, e.g. 'KVF-P'. Null if not specified."),
        fan_type: z
          .enum(["inline_ducted", "wall_mounted", "axial"])
          .nullable()
          .describe(
            "Product installation: KVF-P/KVF-M = inline_ducted, KIN-E = wall_mounted, KTAF = axial. Pass axial for tube axial/axial-flow/KTAF requests. Never substitute across these families. Null only if the user gave no hint.",
          ),
        material: z
          .string()
          .nullable()
          .describe(
            "Casing material the user asked for, e.g. 'plastic' or 'metal'. Null if not mentioned. When the user says plastic, only plastic-cased series may be offered - never mix in metal models, and vice versa.",
          ),
        motor_poles: z.number().nullable().describe("Motor poles if the user specified, else null"),
        output: z
          .enum(["full", "drawing", "noise"])
          .describe(
            "Which document to produce: 'full' complete datasheet (default), 'drawing' dimensional drawing only, 'noise' sound data only",
          ),
        optimize_for: z
          .enum([
            "balanced",
            "low_noise",
            "high_efficiency",
            "low_power",
            "max_airflow",
            "max_pressure",
            "smallest_size",
          ])
          .describe(
            "What the user is optimising for. 'balanced' by default; use low_noise for a quieter fan, high_efficiency for better total efficiency, low_power for lower absorbed/fan power, max_airflow or max_pressure for more capacity, smallest_size for tight space.",
          ),
        note: z.string().nullable().describe("One short line on what is being selected"),
      }),
      execute: async (input) => ({
        prepared: true,
        message:
          "The app is running the KINAIR selection engine on this duty and will produce the requested document automatically in the chat.",
        duty: input,
      }),
    });

    // Same idea for air curtains: hand the door/opening data to the app, which runs the
    // official air curtain selection engine in the browser and builds the datasheet PDF.
    const prepareAirCurtainDatasheet = tool({
      description:
        "Run the official KINAIR air curtain selection engine on a door/opening and produce a document directly in the chat: full datasheet, dimensional drawing only, or sound data only. Call this WHENEVER the user asks for an air curtain selection or document and gives a door width and/or height (any units). Call it AGAIN with different filters or optimize_for when the user asks for lower power consumption, quieter, EC instead of AC motor, another series/brand, or more airflow.",
      inputSchema: z.object({
        door_width: z.number().nullable().describe("Door / opening width as the user gave it"),
        door_width_unit: z.enum(["mm", "cm", "m", "in"]).describe("Unit of the door width"),
        door_height: z.number().nullable().describe("Door / opening height (also mounting height)"),
        door_height_unit: z.enum(["mm", "cm", "m", "in"]).describe("Unit of the door height"),
        mounting: z.enum(["surface", "recessed", "any"]).describe("Mounting type, 'any' if unspecified"),
        speed: z.enum(["high", "medium", "low"]).describe("Fan speed to select on, default 'high'"),
        motor_type: z.enum(["AC", "EC", "any"]).describe("Motor type, 'any' if unspecified"),
        brand: z.string().nullable().describe("Brand the user asked for, else null"),
        series_name: z.string().nullable().describe("Series the user asked for, else null"),
        min_airflow: z.number().nullable().describe("Required airflow if the user gave one, else null"),
        min_airflow_unit: z.enum(["CMH", "LPS", "CFM"]).describe("Unit of the required airflow"),
        min_floor_velocity: z.number().nullable().describe("Minimum air velocity at floor level in m/s, default 2"),
        output: z
          .enum(["full", "drawing", "noise"])
          .describe("Which document to produce: full datasheet (default), drawing only, or sound data only"),
        optimize_for: z
          .enum(["balanced", "low_power", "low_noise", "max_airflow", "max_velocity", "fewest_units"])
          .describe("What the user is optimising for; 'balanced' by default"),
        note: z.string().nullable().describe("One short line on what is being selected"),
      }),
      execute: async (input) => ({
        prepared: true,
        message:
          "The app is running the KINAIR air curtain selection engine on this opening and will produce the requested document automatically in the chat.",
        duty: input,
      }),
    });

    // Multiple duties at once (a schedule pasted, or read from an attached PDF /
    // image / spreadsheet). The app runs the real selection engine on every line.
    const prepareScheduleSelection = tool({
      description:
        "Select MULTIPLE items in one go from a schedule. Use this whenever the user gives more than one duty / door in a single message, or attaches a fan or air curtain schedule as a PDF, image or spreadsheet. Read every row of the schedule, convert it into one item per row (keep the user's units and the row tag/reference) and pass them all here in one call. The app then runs the official KINAIR selection engine on each row and shows a results table with datasheets. Never invent rows and never drop a row.",
      inputSchema: z.object({
        title: z.string().nullable().describe("Short name for the schedule, e.g. 'Car park fan schedule'"),
        items: z
          .array(
            z.object({
              tag: z.string().nullable().describe("Row tag / reference from the schedule, e.g. 'EF-01'"),
              product: z.enum(["fan", "air_curtain"]).describe("What this row is"),
              quantity: z.number().nullable().describe("Quantity for this row, default 1"),
              airflow: z.number().nullable().describe("Fan airflow exactly as given"),
              airflow_unit: z.enum(["CMH", "LPS", "CFM", "CMS"]).describe("Unit of the airflow"),
              static_pressure: z.number().nullable().describe("Fan static pressure as given"),
              pressure_unit: z.enum(["Pa", "inwg", "mmwg"]).describe("Unit of the pressure"),
              series_name: z.string().nullable(),
              fan_type: z
                .enum(["inline_ducted", "wall_mounted", "axial"])
                .nullable()
                .describe("Fan installation type for the row: KVF-P/KVF-M are inline ducted, KIN-E is wall mounted. Never put a KVF series on a wall mounted row."),
              material: z.string().nullable().describe("Casing material for the row, e.g. 'plastic' or 'metal', else null"),
              motor_poles: z.number().nullable(),
              max_noise_db: z.number().nullable().describe("Noise limit for the row, if the schedule gives one"),
              door_width: z.number().nullable().describe("Air curtain door width as given"),
              door_width_unit: z.enum(["mm", "cm", "m", "in"]).describe("Unit of the door width"),
              door_height: z.number().nullable().describe("Air curtain door height as given"),
              door_height_unit: z.enum(["mm", "cm", "m", "in"]).describe("Unit of the door height"),
              mounting: z.enum(["surface", "recessed", "any"]),
              motor_type: z.enum(["AC", "EC", "any"]),
              brand: z.string().nullable(),
            }),
          )
          .max(60)
          .describe("One entry per schedule row, in schedule order"),
        optimize_for: z
          .enum(["balanced", "low_noise", "high_efficiency", "low_power", "smallest_size"])
          .describe("What to optimise every row for; 'balanced' by default"),
      }),
      execute: async (input) => ({
        prepared: true,
        count: input.items.length,
        message:
          "The app is running the KINAIR selection engine on every row of this schedule and will show the results table in the chat.",
      }),
    });


    const findAirCurtains = tool({
      description:
        "Find air curtain models from the catalogue by door width, mounting height, airflow or noise. Use for door/entrance air-barrier questions.",
      inputSchema: z.object({
        mounting_height_m: z.number().nullable(),
        min_airflow_cmh: z.number().nullable(),
        max_noise_db: z.number().nullable(),
        limit: z.number().nullable(),
      }),
      execute: async (input) => {
        const limit = Math.min(Math.max(input.limit ?? 6, 1), 12);
        let q = supabase
          .from("air_curtain_models")
          .select(
            "model,brand,length_mm,air_volume_cmh,air_velocity_ms,input_power_w,noise_db,mounting_height_min,mounting_height_max,series_id",
          );
        if (input.mounting_height_m != null) {
          q = q.lte("mounting_height_min", input.mounting_height_m).gte("mounting_height_max", input.mounting_height_m);
        }
        if (input.min_airflow_cmh != null) q = q.gte("air_volume_cmh", input.min_airflow_cmh);
        if (input.max_noise_db != null) q = q.lte("noise_db", input.max_noise_db);
        const { data, error } = await q.limit(limit);
        if (error) return { error: error.message };
        return { results: data ?? [] };
      },
    });

    // Product catalogue PDFs and IOM (installation, operation & maintenance) manuals.
    const getDocuments = tool({
      description:
        "Get download links for KINAIR product documents: the product catalogue PDF and the IOM (installation, operation and maintenance) manual for a fan series or an air curtain series. Use whenever the user asks for a catalogue, brochure, IOM, installation manual, O&M or maintenance document. Always give the links back as markdown links.",
      inputSchema: z.object({
        product: z.enum(["fan", "air_curtain", "any"]).describe("Which product family to look in"),
        series_name: z.string().nullable().describe("Series name or part of it, e.g. 'KVF-P'. Null lists everything available."),
      }),
      execute: async (input) => {
        const docs: Row[] = [];
        if (input.product !== "air_curtain") {
          let q = supabase.from("fan_series").select("name,fan_type,catalogue_url,iom_url");
          if (input.series_name) q = q.ilike("name", `%${input.series_name}%`);
          const { data, error } = await q.limit(60);
          if (error) return { error: error.message };
          for (const s of data ?? []) {
            if (s.catalogue_url || s.iom_url) {
              docs.push({
                product: "fan",
                series: s.name,
                fan_type: s.fan_type,
                catalogue_pdf: s.catalogue_url ?? null,
                iom_manual: s.iom_url ?? null,
              });
            }
          }
        }
        if (input.product !== "fan") {
          let q = supabase.from("air_curtain_series").select("name,catalogue_url");
          if (input.series_name) q = q.ilike("name", `%${input.series_name}%`);
          const { data, error } = await q.limit(60);
          if (!error) {
            for (const s of data ?? []) {
              if (s.catalogue_url) {
                docs.push({ product: "air_curtain", series: s.name, catalogue_pdf: s.catalogue_url, iom_manual: null });
              }
            }
          }
        }
        if (!docs.length) {
          return {
            documents: [],
            note: "No catalogue or IOM document is uploaded for that series yet. Tell the user plainly and offer the datasheet instead.",
          };
        }
        return { documents: docs };
      },
    });

    // Full technical specification of a fan series / model straight from the catalogue tables.
    const getSpecifications = tool({
      description:
        "Get the full technical specification of a fan series or a specific fan model from the catalogue: fan type, certifications (AMCA, CE, ISO, UL, ATEX), fire rating, available sizes/diameters, blade counts, motor poles and motor ratings. Use whenever the user asks for technical specifications, construction details, certifications, fire rating or what sizes are available.",
      inputSchema: z.object({
        series_name: z.string().nullable().describe("Series name or part of it"),
        model_name: z.string().nullable().describe("Specific model name if the user named one"),
      }),
      execute: async (input) => {
        let sq = supabase
          .from("fan_series")
          .select(
            "id,name,fan_type,description,datasheet_description,fire_rating,amca_certified,ce_certified,iso_certified,ul_certified,atex_certified,custom_cert_name,catalogue_url,iom_url",
          );
        if (input.series_name) sq = sq.ilike("name", `%${input.series_name}%`);
        const { data: series, error: seriesError } = await sq.limit(10);
        if (seriesError) return { error: seriesError.message };
        if (!series?.length) return { note: "No matching series in the catalogue." };

        let mq = supabase
          .from("fan_models")
          .select("model_name,product_code,diameter,motor_poles,series_id")
          .in("series_id", series.map((s: Row) => s.id));
        if (input.model_name) mq = mq.ilike("model_name", `%${input.model_name}%`);
        const { data: models, error: modelError } = await mq.limit(200);
        if (modelError) return { error: modelError.message };

        return {
          series: series.map((s: Row) => ({
            name: s.name,
            fan_type: s.fan_type,
            description: s.datasheet_description || s.description,
            fire_rating: s.fire_rating ?? null,
            certifications: [
              s.amca_certified ? "AMCA" : null,
              s.ce_certified ? "CE" : null,
              s.iso_certified ? "ISO" : null,
              s.ul_certified ? "UL" : null,
              s.atex_certified ? "ATEX" : null,
              s.custom_cert_name || null,
            ].filter(Boolean),
            catalogue_pdf: s.catalogue_url ?? null,
            iom_manual: s.iom_url ?? null,
            sizes: (models ?? [])
              .filter((m: Row) => m.series_id === s.id)
              .map((m: Row) => ({
                model: m.model_name,
                product_code: m.product_code,
                diameter_mm: m.diameter,
                motor_poles: m.motor_poles,
              }))
              .slice(0, 60),
          })),
        };
      },
    });

    // Works out airflow from room size + air changes, and static pressure from the duct run.
    const estimateDuty = tool({
      description:
        "Work out the required airflow and/or duct static pressure when the user does not know them. Airflow comes from room size and air changes per hour (ACH); static pressure comes from the duct run (size, length, bends/elbows, grilles, filters, silencers, dampers, louvres). Use whenever the user describes a room, an application or a duct run instead of giving numbers.",
      inputSchema: z.object({
        application: z
          .string()
          .nullable()
          .describe("Application, e.g. car park, toilet, kitchen, warehouse, staircase pressurization, office"),
        room_length_m: z.number().nullable(),
        room_width_m: z.number().nullable(),
        room_height_m: z.number().nullable(),
        room_area_m2: z.number().nullable().describe("Use when only floor area is known"),
        air_changes_per_hour: z.number().nullable().describe("ACH if the user gave one; otherwise leave null and a standard value is used"),
        airflow_m3h: z.number().nullable().describe("Known airflow in m3/h, if the user already has it"),
        duct_shape: z.enum(["round", "rectangular"]).nullable(),
        duct_diameter_mm: z.number().nullable(),
        duct_width_mm: z.number().nullable(),
        duct_height_mm: z.number().nullable(),
        duct_length_m: z.number().nullable(),
        elbows_90: z.number().nullable(),
        bends_45: z.number().nullable(),
        tees: z.number().nullable(),
        grilles: z.number().nullable().describe("Number of grilles / diffusers on the run"),
        filters: z.number().nullable(),
        silencers: z.number().nullable(),
        dampers: z.number().nullable(),
        louvres: z.number().nullable(),
        extra_pressure_pa: z.number().nullable().describe("Any other known component pressure drop in Pa"),
      }),
      execute: async (input) => {
        const DEFAULT_ACH: Record<string, number> = {
          "car park": 6,
          "carpark": 6,
          "basement": 6,
          "toilet": 12,
          "bathroom": 12,
          "kitchen": 30,
          "restaurant kitchen": 40,
          "warehouse": 4,
          "office": 6,
          "meeting": 8,
          "classroom": 6,
          "residential": 4,
          "bedroom": 4,
          "living": 4,
          "plant room": 10,
          "pump room": 10,
          "electrical room": 10,
          "generator room": 20,
          "laundry": 15,
          "store": 4,
          "retail": 8,
          "gym": 10,
          "smoking room": 15,
          "battery room": 12,
        };

        const notes: string[] = [];
        let airflow = input.airflow_m3h ?? null;
        let achUsed: number | null = null;
        let volume: number | null = null;

        if (airflow == null) {
          const h = input.room_height_m ?? 3;
          const area =
            input.room_area_m2 ??
            (input.room_length_m != null && input.room_width_m != null
              ? input.room_length_m * input.room_width_m
              : null);
          if (area != null) {
            volume = area * h;
            if (input.room_height_m == null) notes.push("Assumed 3 m ceiling height.");
            let ach = input.air_changes_per_hour ?? null;
            if (ach == null) {
              const app = (input.application ?? "").toLowerCase();
              const key = Object.keys(DEFAULT_ACH).find((k) => app.includes(k));
              ach = key ? DEFAULT_ACH[key] : 6;
              notes.push(
                key
                  ? `Used ${ach} air changes/hour, the usual figure for ${key}.`
                  : `No application given, so used a general 6 air changes/hour.`,
              );
            }
            achUsed = ach;
            airflow = volume * ach;
          }
        }

        // ---- static pressure from the duct run
        let pressure: number | null = null;
        const breakdown: Record<string, number> = {};
        let velocity: number | null = null;

        if (airflow != null && (input.duct_diameter_mm || (input.duct_width_mm && input.duct_height_mm))) {
          const q = airflow / 3600; // m3/s
          let area: number;
          let dh: number; // hydraulic diameter, m
          if (input.duct_diameter_mm) {
            const d = input.duct_diameter_mm / 1000;
            area = Math.PI * d * d / 4;
            dh = d;
          } else {
            const w = (input.duct_width_mm as number) / 1000;
            const hgt = (input.duct_height_mm as number) / 1000;
            area = w * hgt;
            dh = (2 * w * hgt) / (w + hgt);
          }
          velocity = q / area;
          const rho = 1.2;
          const vp = 0.5 * rho * velocity * velocity; // velocity pressure, Pa
          const re = Math.max(4000, (velocity * dh) / 1.5e-5);
          let f = 0.11 * Math.pow(0.00015 / dh + 68 / re, 0.25);
          if (f < 0.018) f = 0.85 * f + 0.0028;
          const len = input.duct_length_m ?? 0;
          breakdown.straight_duct = f * (len / dh) * vp;
          breakdown.elbows_90 = (input.elbows_90 ?? 0) * 0.25 * vp;
          breakdown.bends_45 = (input.bends_45 ?? 0) * 0.15 * vp;
          breakdown.tees = (input.tees ?? 0) * 0.5 * vp;
          breakdown.entry_exit = 1.5 * vp;
          breakdown.grilles = (input.grilles ?? 0) * 25;
          breakdown.filters = (input.filters ?? 0) * 150;
          breakdown.silencers = (input.silencers ?? 0) * 50;
          breakdown.dampers = (input.dampers ?? 0) * 15;
          breakdown.louvres = (input.louvres ?? 0) * 30;
          breakdown.other = input.extra_pressure_pa ?? 0;
          const sum = Object.values(breakdown).reduce((a, b) => a + b, 0);
          breakdown.safety_margin_10pct = sum * 0.1;
          pressure = Math.round(sum * 1.1);
          for (const k of Object.keys(breakdown)) breakdown[k] = Math.round(breakdown[k]);
          if (velocity > 12) notes.push(`Duct velocity is ${velocity.toFixed(1)} m/s — that is high; a bigger duct would cut noise and pressure.`);
          if (velocity < 3 && velocity > 0) notes.push(`Duct velocity is only ${velocity.toFixed(1)} m/s — the duct is oversized for this flow.`);
        }

        return {
          airflow_m3h: airflow != null ? Math.round(airflow) : null,
          airflow_lps: airflow != null ? Math.round(airflow / 3.6) : null,
          airflow_cfm: airflow != null ? Math.round(airflow / 1.699) : null,
          room_volume_m3: volume != null ? Math.round(volume) : null,
          air_changes_per_hour: achUsed,
          static_pressure_pa: pressure,
          duct_velocity_ms: velocity != null ? Number(velocity.toFixed(1)) : null,
          pressure_breakdown_pa: pressure != null ? breakdown : null,
          notes,
          hint:
            pressure == null
              ? "No duct details given: use the KINAIR standard static pressure assumptions — 75 Pa for inline ducted fans, 3 Pa for wall mounted fans up to 25 lps airflow, 10 Pa for wall mounted fans above 25 lps — and say plainly what you assumed. For anything else use a sensible external static pressure for the application and say what you assumed."
              : null,
        };
      },
    });

    // Standard mode uses Gemini's economical/free-tier model. Advanced mode
    // uses OpenAI credits. If the requested provider is not configured, keep
    // the assistant available through the next configured provider.
    let providerName: "Google Gemini" | "OpenAI" | "Anthropic";
    let modelName: string;
    let model;
    if ((aiMode === "advanced" || aiMode === "openai") && openaiApiKey) {
      providerName = "OpenAI";
      modelName = OPENAI_MODEL;
      model = createOpenAI({ apiKey: openaiApiKey })(modelName);
    } else if (aiMode === "anthropic" && anthropicApiKey) {
      providerName = "Anthropic";
      modelName = ANTHROPIC_MODEL;
      model = createAnthropic({ apiKey: anthropicApiKey })(modelName);
    } else if (geminiApiKey) {
      providerName = "Google Gemini";
      modelName = GEMINI_MODEL;
      model = createGoogleGenerativeAI({ apiKey: geminiApiKey })(modelName);
    } else if (openaiApiKey) {
      providerName = "OpenAI";
      modelName = OPENAI_MODEL;
      model = createOpenAI({ apiKey: openaiApiKey })(modelName);
    } else {
      providerName = "Anthropic";
      modelName = ANTHROPIC_MODEL;
      model = createAnthropic({ apiKey: anthropicApiKey! })(modelName);
    }

    const result = streamText({
      model,
      system: [
        "You are KINAIR, KINAIR's AI selection engineer. You talk to consultants and contractors the way a friendly, experienced colleague does on the phone.",
        "",
        "STAY ON THE ASK (most important rule):",
        "- Do exactly what the user asked for — nothing extra. If they asked for a datasheet, produce the datasheet and stop. Do not then look up catalogues, IOM manuals, specifications or extra alternatives unless they asked.",
        "- Only call get_documents when the user literally asks for a catalogue, brochure, IOM, installation or maintenance manual.",
        "- Only call get_specifications when the user literally asks about specifications, construction, certifications, fire rating or available sizes.",
        "- Use the fewest tool calls possible: normally ONE tool call per user message. Never call the same tool twice for the same request.",
        "- Once a document is prepared, reply in one or two short lines and stop. No unasked follow-up work.",
        "",
        "How you talk:",
        "- Warm, natural, plain English. Short sentences. Contractions are fine ('I'd go with…', 'that's tight on space').",
        "- First contact: when the user's very first message is a greeting (hi, hello, hey, good morning…) or just checking what you do, reply with a short friendly introduction of yourself — your name (KINAIR), that you're the selection engineer, and one line on what you can do (fan and air curtain selections, datasheets, schedules, ventilation questions) — then ask what they're working on. Keep it to two or three lines. Never introduce yourself again later in the same conversation.",
        "- Non-selection questions: anything that is not a selection request — general ventilation questions (what is static pressure, how does an air curtain work, fan types, noise levels, energy saving), questions about KINAIR and the products, or small talk — answer it yourself in a friendly, knowledgeable way, briefly. Do NOT call selection tools for these. If a question is completely outside ventilation (weather, news, homework), answer in one light line and gently steer back to what you can help with. Never flatly refuse.",
        "- Never sound like a form or a report. No robotic phrases like 'Based on your requirements, the following results were retrieved'.",
        "- Open with a one-line human reaction ('Nice, a hotel corridor — noise will drive this one.'), then get to the point.",
        "- Give ONE clear recommendation first, then a short table with one or two alternatives only if useful.",
        "- Ask at most one follow-up question at a time, and only when it really changes the selection.",
        "- Keep answers short. If the user writes one line, don't reply with an essay.",

        "",
        "Engineering rules:",
        "- NEVER invent model names, airflow, pressure, power or noise figures. Every technical number must come from the find_fans / find_air_curtains tools.",
        "- CFM → m3/h: 1 CFM = 1.699 m3/h. in.wg → Pa: 1 in.wg = 249 Pa. mmWG = 9.807 Pa. Show both units when the user used imperial.",
        "- If the user describes an application with no numbers, assume a sensible duty from standard practice, say plainly what you assumed, search with it and invite a correction.",
        "- Say WHY: pressure margin, absorbed power, efficiency, noise, size.",
        "- If nothing fits, say so straight and suggest what to change (bigger diameter, faster speed, two units in parallel, less system resistance).",
        "- Do not call find_fans as well as prepare_datasheet for the same request unless you truly need a number to explain the pick.",
        "- Datasheet in chat: the moment the user gives an airflow AND a static pressure (any units, series optional, e.g. '25 lps @ 50 Pa KVF-P'), call prepare_datasheet with those exact numbers and units. The app then runs the real KINAIR selection engine and downloads the datasheet PDF in the chat — the user does NOT need to open the Fan Selector. Call find_fans too if you need numbers to explain the pick.",
        "- After calling prepare_datasheet, keep it short: say which duty you selected on and that the datasheet PDF is downloading below, and mention they can pick another option from the buttons under your answer.",
        "- Air curtain datasheet in chat: the moment the user asks for an air curtain for a door/entrance (e.g. '3 m high, 2 m wide shop entrance'), call prepare_air_curtain_datasheet with the door size and units they gave. The app runs the real air curtain selection engine and downloads the datasheet PDF in the chat — the user does NOT need to open the Air Curtain Selector. If only the height is given, still call it and say what width you assumed.",
        "- Catalogues and IOM manuals: when the user asks for a catalogue, brochure, IOM, installation or maintenance manual, call get_documents and reply with the download links as markdown links. If nothing is uploaded for that series, say so plainly.",
        "- Technical specifications: when the user asks about construction, certifications (AMCA/CE/ISO/UL/ATEX), fire rating, available sizes, diameters or motor poles, call get_specifications and answer from it. Never guess a certification.",
        "- Part documents: if the user wants only the dimensional drawing, or only the noise/sound data (fan or air curtain), call the same prepare tool again with output='drawing' or output='noise' and the same duty. Default is output='full'.",
        "- Better / different option: when the user asks for anything better — quieter, more efficient, less power, more airflow, more static pressure, smaller size, EC instead of AC motor, another series or brand — call the prepare tool again with the same duty plus the right optimize_for (and motor_type / series_name / brand for air curtains). Then say in one line what changed and why the new pick suits them better.",
        "- Never refuse a reasonable request: translate whatever the user demands into the closest tool filters and optimize_for, run it, and explain honestly if the catalogue cannot do better.",
        "- Only point the user to the Selector pages when they ask for something the chat cannot do (curve tweaking, speed control, detailed coverage tuning).",
        "",
        "Schedules and attachments:",
        "- The user can attach a fan or air curtain schedule as a PDF, a photo/screenshot or a spreadsheet (spreadsheets arrive as a text table in the message). Read every row carefully: tag/reference, quantity, airflow, static pressure, door width/height, series, noise limit.",
        "- Whenever there is MORE THAN ONE duty (attached schedule or several duties typed in one message), call prepare_schedule_selection ONCE with every row as an item — never call prepare_datasheet row by row.",
        "- Keep the schedule's own row order, tags and units. Never invent a row, never skip a row. If a row is unreadable or missing data, still include it with what you have and say in one line which rows need confirming.",
        "- A single duty stays with prepare_datasheet / prepare_air_curtain_datasheet as before.",
        "- Schedule rows without numbers: if a row gives a room size, area or duct run instead of airflow/pressure, call estimate_duty for it first, then include the worked-out numbers in the schedule item.",
        "",
        "Material is a hard filter: if the user says plastic, every model you name or offer as an alternative must be from a plastic-cased series; same for metal. Pass it in the material field and never suggest a model of the other material.",
        "Plastic synonyms: 'plastic', 'PVC', 'PP', 'polypropylene', 'polymer' and 'ABS' all mean the same thing. For an inline ducted fan they always mean the KVF-P series — pass material='plastic' and prefer series_name='KVF-P'. KIN-E is also a plastic (PVC/PP) series: use it for plastic WALL MOUNTED requests. Never offer a metal (-M) model, main or alternative, on a plastic request.",
        "Installation type is a hard rule: KVF-P and KVF-M are INLINE DUCTED series, KIN-E is WALL MOUNTED, and KTAF is AXIAL. A wall mounted / wall extract request always means fan_type='wall_mounted' and series KIN-E — never select or offer a KVF model for wall mounting. An inline ducted request never selects KIN-E or KTAF. An axial / tube axial request always uses KTAF and passes fan_type=\'axial\'. This applies to the main pick and every alternative, in single duties and schedule rows.",
        "Nothing available = say so immediately: if the requested series or type has no model that meets the duty, do NOT silently switch to another series. Say plainly in the reply that no model is available in that series for the duty, and only then suggest the closest alternative (e.g. another series) clearly labelled as an alternative.",
        "Low noise requests: when the user asks for a quiet / low noise / silent fan, always select from KVF-P for inline ducted fans and from KIN-E for wall mounted fans — pass series_name='KVF-P' or series_name='KIN-E' accordingly together with optimize_for='low_noise'.",
        "Standard static pressure assumptions (KINAIR): inline ducted fan -> assume 75 Pa static; wall mounted fan -> assume 3 Pa static when airflow is 25 lps or less, and 10 Pa when airflow is above 25 lps. Apply these whenever the fan type is known but static pressure is not given; state the assumption in one line.",
        "When the user does NOT know airflow or static pressure:",
        "- Never ask them for numbers they clearly do not have. Call estimate_duty with whatever they gave: room length/width/height or area, application, and any duct details (round diameter or width x height, run length, number of 90 elbows, 45 bends, tees, grilles, filters, silencers, dampers, louvres).",
        "- estimate_duty returns airflow from room volume x air changes per hour, and static pressure from duct friction plus fitting and component losses with a 10% margin. Use ONLY its numbers — never do this arithmetic yourself.",
        "- Then immediately call prepare_datasheet with those numbers so they get the model and the datasheet in one go.",
        "- In two or three short lines say what you assumed (air changes/hour, ceiling height, duct velocity) and invite a correction. If duct details are missing, say what external static pressure you assumed and why.",
        "- After the schedule tool runs, reply in two or three short lines: how many rows you selected, anything you assumed, and that the table with datasheets is below.",
      ].join("\n"),
      messages: await convertToModelMessages(messages),
      tools: {
        list_fan_series: listSeries,
        find_fans: findFans,
        find_air_curtains: findAirCurtains,
        get_documents: getDocuments,
        get_specifications: getSpecifications,
        prepare_datasheet: prepareDatasheet,
        prepare_air_curtain_datasheet: prepareAirCurtainDatasheet,
        prepare_schedule_selection: prepareScheduleSelection,
        estimate_duty: estimateDuty,
      },
      stopWhen: stepCountIs(6),
    });

    return result.toUIMessageStreamResponse({
      headers: {
        ...corsHeaders,
        "X-KINAIR-AI-Provider": providerName,
        "X-KINAIR-AI-Model": modelName,
      },
      // The AI SDK's default onError swallows mid-stream errors as "An error
      // occurred." to avoid leaking internals; surface the real reason (e.g.
      // an invalid/expired ANTHROPIC_API_KEY or a quota error) instead, since
      // this endpoint is only ever called by our own frontend.
      onError: (error) => {
        console.error("ai-assistant stream error", error);
        if (error instanceof Error) return error.message;
        return typeof error === "string" ? error : "Unexpected error while generating a response.";
      },
    });
  } catch (error) {
    console.error("ai-assistant error", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// Deployed to kinair4 ONLY. Uses its AI secret; never accesses its database.
const STORY_AUTH = "https://gpczykyecdoljlbgesfu.supabase.co/auth/v1/user";
const STORY_PUBLIC_KEY = "sb_publishable_L_Nx302mxhpCEca5rz3VJg_dgZsPxEj";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
function text(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error("Invalid input");
  return value;
}
export async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({error: "POST required"}, 405);
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ") || auth.length > 8192) return json({error: "Sign in to StoryToon first."}, 401);
  try {
    // Validate against StoryToon's fixed issuer, NOT kinair4 and never a caller-provided URL.
    const verified = await fetch(STORY_AUTH, {headers: {Authorization: auth, apikey: STORY_PUBLIC_KEY}, signal: AbortSignal.timeout(10000)});
    if (!verified.ok) return json({error: "StoryToon session expired. Sign in again."}, 401);
    const user = await verified.json();
    if (!user.id || user.is_anonymous || !user.email_confirmed_at) return json({error: "A verified StoryToon account is required."}, 403);
    const raw = await req.text();
    if (raw.length > 8600000) return json({error: "Page is too large."}, 413);
    const d = JSON.parse(raw);
    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key) return json({error: "OPENAI_API_KEY is missing in kinair4 Supabase secrets."}, 503);
    const oaiErr = (status: number) => json({error:({401:"Your OpenAI key in kinair4 is invalid.",402:"Your OpenAI account needs credits.",429:"OpenAI quota or rate limit reached. Check your OpenAI billing and limits.",403:"OpenAI declined this clip or Sora is not enabled for your account.",400:"OpenAI rejected this clip request.",404:"Sora video is not available to your OpenAI account."} as Record<number,string>)[status] || `OpenAI video request failed (HTTP ${status}).`},status);
    if (d.operation === "video_create") {
      const image = text(d.image, 8500000);
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(image)) throw new Error("Invalid image");
      const [w, h] = d.aspect === "9:16" ? [720, 1280] : [1280, 720];
      const { Image } = await import("https://deno.land/x/imagescript@1.3.0/mod.ts");
      const img = await Image.decode(Uint8Array.from(atob(image), (c) => c.charCodeAt(0)));
      const scale = Math.max(w / img.width, h / img.height);
      img.resize(Math.ceil(img.width * scale), Math.ceil(img.height * scale));
      img.crop(Math.floor((img.width - w) / 2), Math.floor((img.height - h) / 2), w, h);
      const sec = Number(d.seconds) <= 5 ? "4" : Number(d.seconds) <= 9 ? "8" : "12";
      const form = new FormData();
      form.append("model", "sora-2");
      form.append("prompt", text(d.prompt, 4000));
      form.append("seconds", sec);
      form.append("size", `${w}x${h}`);
      form.append("input_reference", new Blob([await img.encodeJPEG(90)], {type:"image/jpeg"}), "frame.jpg");
      const r = await fetch("https://api.openai.com/v1/videos", {method:"POST",headers:{Authorization:`Bearer ${key}`},body:form,signal:AbortSignal.timeout(60000)});
      if (!r.ok) return oaiErr(r.status);
      const v = await r.json();
      return json({id:v.id,status:v.status,provider:"openai"});
    }
    if (d.operation === "video_status" || d.operation === "video_content") {
      const id = text(d.id, 200);
      if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error("Invalid id");
      const content = d.operation === "video_content";
      const r = await fetch(`https://api.openai.com/v1/videos/${id}${content ? "/content" : ""}`, {headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(content ? 120000 : 20000)});
      if (!r.ok) return oaiErr(r.status);
      if (content) return new Response(r.body,{headers:{"Content-Type":"video/mp4","Cache-Control":"no-store"}});
      const v = await r.json();
      return json({id:v.id,status:v.status === "completed" ? "completed" : v.status === "failed" ? "failed" : "running",error:v.status === "failed" ? {message:"OpenAI could not animate this scene."} : undefined});
    }
    let path: string;
    let body: Record<string, unknown>;
    if (d.operation === "text") {
      const system = text(d.system, 16000);
      const prompt = text(d.prompt, 80020);
      const content: unknown[] = [{type: "text", text: prompt}];
      if (d.image) {
        if (!["image/jpeg","image/png","image/webp"].includes(d.mediaType)) throw new Error("Invalid image type");
        const image = text(d.image, 8500000);
        if (!/^[A-Za-z0-9+/]+={0,2}$/.test(image)) throw new Error("Invalid image");
        content.push({type:"image_url",image_url:{url:`data:${d.mediaType};base64,${image}`}});
      }
      path = "chat/completions";
      body = {model:"gpt-4.1-mini",messages:[{role:"system",content:system},{role:"user",content}],max_tokens:16000,store:false};
    } else if (d.operation === "image") {
      if (!["1024x1024","1024x1536","1536x1024"].includes(d.size)) throw new Error("Invalid image size");
      path = "images/generations";
      body = {model:"gpt-image-2.5-sunburst",prompt:text(d.prompt,16000),size:d.size,quality:"medium",n:1};
    } else if (d.operation === "speech") {
      const voices: Record<string,string> = {female:"coral",male:"onyx",child:"shimmer",grandma:"sage",grandpa:"onyx",dramatic:"echo"};
      path = "audio/speech";
      body = {model:"gpt-4o-mini-tts",input:text(d.text,4096),voice:voices[d.voice] || "coral",instructions:text(d.style,1000),response_format:"wav"};
    } else return json({error:"Unsupported AI operation."},400);
    const res = await fetch("https://api.openai.com/v1/"+path, {method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(140000)});
    if (!res.ok) {
      // Never return keys, upstream headers or provider request bodies.
      const messages: Record<number,string> = {401:"Your OpenAI key in kinair4 is invalid.",402:"Your OpenAI account needs credits.",429:"OpenAI quota or rate limit reached. Check your OpenAI billing and limits.",403:"OpenAI declined this request or this model is not enabled.",400:"OpenAI rejected this request. Check the input and model access.",404:"This OpenAI model is not available to your account."};
      return json({error:messages[res.status] || `OpenAI request failed (HTTP ${res.status}).`},res.status);
    }
    if (d.operation === "speech") return new Response(res.body,{headers:{"Content-Type":"audio/wav","Cache-Control":"no-store","X-AI-Provider":"openai"}});
    const data = await res.json();
    if (d.operation === "text") {
      const choice = data.choices?.[0];
      if (choice?.finish_reason === "length") return json({error:"Text exceeds the model output limit. Split the document or shorten the story."},422);
      if (choice?.message?.refusal || choice?.finish_reason === "content_filter") return json({error:"OpenAI declined this content."},403);
      const output = choice?.message?.content;
      if (typeof output !== "string" || !output.trim()) return json({error:"OpenAI returned no text."},502);
      return json({text:output,provider:"openai"});
    }
    return json({data:data.data,provider:"openai"});
  } catch (e) {
    if (e instanceof SyntaxError || (e instanceof Error && e.message.startsWith("Invalid"))) return json({error:"Invalid AI request."},400);
    return json({error:"The direct AI connection timed out or failed. Please try again."},502);
  }
}
Deno.serve(handle);


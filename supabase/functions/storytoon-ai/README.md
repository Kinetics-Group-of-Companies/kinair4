# AI-only connection

Deploy this function to **kinair4**, project `bfofrgqdvqehdsiccyhk`, not StoryToon's database project. It reads kinair4's existing `OPENAI_API_KEY` environment secret. It never queries kinair4's database or exposes the key.

Deployment uses `verify_jwt=false` because kinair4's gateway cannot validate StoryToon's JWT issuer. The handler instead validates every request against the fixed StoryToon `/auth/v1/user` endpoint with StoryToon's public publishable key, requiring a confirmed non-anonymous account. Never remove this check or accept an auth URL from the caller.

StoryToon's auth-protected server functions forward the current user token only after Lovable returns HTTP 402. Supported fallback operations are OCR, planning, image generation, WAV narration and animated clips (OpenAI `sora-2` via `video_create` / `video_status` / `video_content`; frame cropped to 1280x720 or 720x1280, clips 4/8/12 s; job ids stored with an `openai:` prefix). Content/policy failures do not trigger fallback.

OpenAI usage is charged to the key owner's account. Provider quota, authentication and model-access errors are surfaced to the user. No successful authenticated production AI call has been verified during deployment; local tests mock provider transport, and the live endpoint has been checked to reject unsigned calls.

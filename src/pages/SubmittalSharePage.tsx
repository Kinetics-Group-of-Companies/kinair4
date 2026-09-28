import { useEffect, useState } from "react";

export default function SubmittalSharePage() {
  const [pdfUrl, setPdfUrl] = useState("");
  const [error, setError] = useState("");
  const [expiry, setExpiry] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = "";
    (async () => {
      try {
        const token = window.location.hash.slice(1);
        const part = token.split(".")[1];
        if (!part) throw new Error("This share link is invalid. Please request a new link.");
        const payload = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
        // Only permit a shared PDF snapshot in the configured KINAIR storage.
        if (!/^submittal-control\/[0-9a-f-]+\/lite-builder\/shares\/[0-9a-f-]+\/Submittal\.pdf$/.test(payload.url ?? "") || !Number.isFinite(payload.exp)) throw new Error("This share link is invalid.");
        if (Date.now() >= payload.exp * 1000) throw new Error("This link has expired. Please ask the sender for a new 7-day link.");
        setExpiry(new Date(payload.exp * 1000).toLocaleString());
        const source = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/sign/${payload.url}?token=${encodeURIComponent(token)}`;
        // Storage verifies the signature and expiry; decoded claims alone grant no access.
        const response = await fetch(source, { signal: controller.signal, credentials: "omit" });
        if (!response.ok) throw new Error("This link has expired or the document is unavailable. Please request a new link.");
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
        setPdfUrl(objectUrl);
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Unable to load the document."); }
    })();
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, []);
  return <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
    <section className="mx-auto max-w-3xl overflow-hidden rounded-2xl border bg-white shadow-sm">
      <header className="bg-blue-900 px-6 py-6 text-white"><p className="text-3xl font-bold tracking-wide">KINAIR</p><p className="mt-1 text-sm text-blue-100">Kinetics Middle East LLC</p></header>
      <div className="space-y-4 p-6"><h1 className="text-2xl font-semibold">Your submittal is ready</h1>
        {error ? <p role="alert" className="rounded-lg bg-amber-50 p-4 text-amber-900">{error}</p> : <>
          <p className="text-sm text-slate-600">{expiry ? `Link valid until ${expiry}` : "Checking your link…"}</p>
          {pdfUrl ? <><a className="inline-flex rounded-lg bg-blue-800 px-6 py-3 font-semibold text-white" href={pdfUrl} download="KINAIR-Submittal.pdf">Download submittal PDF</a><iframe title="KINAIR submittal preview" src={pdfUrl} className="h-[65vh] w-full rounded-lg border" /></> : <p role="status">Loading your document…</p>}
        </>}
        <p className="text-xs text-slate-500">Shared through KINAIR. Downloaded copies remain available after the link expires.</p>
      </div>
    </section>
  </main>;
}

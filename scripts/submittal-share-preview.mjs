// Emit a share-page HTML shell so link crawlers see metadata without JavaScript.
export function submittalSharePreview() {
  return {
    name: "submittal-share-preview",
    enforce: "post",
    generateBundle(_options, bundle) {
      const entry = bundle["index.html"];
      if (!entry || entry.type !== "asset") throw new Error("Missing built index.html for submittal sharing");
      const title = "KINAIR Submittal";
      const description = "View and download your submittal PDF. Shared by Kinetics Middle East LLC. Links are valid for 7 days from creation.";
      let html = String(entry.source)
        .replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`)
        .replace(/<meta\b[^>]*(?:name="(?:description|twitter:[^"]+)"|property="og:[^"]+")[^>]*>/g, "");
      html = html.replace("</head>", `
    <meta name="description" content="${description}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="KINAIR" />
    <meta property="og:image" content="https://www.ventilation4u.com/kinair-logo.png" />
    <meta property="og:image:alt" content="KINAIR — Kinetics Middle East LLC" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="https://www.ventilation4u.com/kinair-logo.png" />
  </head>`);
      this.emitFile({ type: "asset", fileName: "submittal-share.html", source: html });
    },
  };
}

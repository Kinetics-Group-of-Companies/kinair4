/** Read DOCX paragraphs and table cells locally; never render document HTML. */
export async function readWordInquiry(file: File): Promise<string> {
  const { CFB } = await import("xlsx");
  const archive = CFB.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
  const index = archive.FullPaths.findIndex(path => /(?:^|\/)word\/document\.xml$/.test(path));
  const entry = index >= 0 ? archive.FileIndex[index] : null;
  if (!entry?.content) throw new Error("Could not read Word document. Save it as PDF and upload again.");
  const xml = new TextDecoder().decode(new Uint8Array(entry.content as Uint8Array));
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("Invalid Word document XML.");
  const ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const lines = Array.from(doc.getElementsByTagNameNS(ns, "p")).map(p =>
    Array.from(p.getElementsByTagNameNS(ns, "t")).map(t => t.textContent ?? "").join("")
  );
  const text = lines.join("\n").trim();
  if (!text) throw new Error("Word file contains no readable text. Export scanned pages as PDF or images.");
  return text;
}

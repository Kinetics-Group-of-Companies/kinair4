import { openPdfBlob } from "./pdf-range";

// Read the PDF page tree using small Blob ranges, without buffering the full file.
export async function countPdfPages(file: File): Promise<number> {
  if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") return 1;
  const task = await openPdfBlob(file);
  try { return (await task.promise).numPages; }
  finally { await task.destroy(); }
}

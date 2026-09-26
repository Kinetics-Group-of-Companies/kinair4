import type { FileData } from "@/lib/submittal-lite/pdf-build";

export const uploadAccept = "application/pdf,image/png,image/jpeg";

export const normalizeUpload = async (file: File): Promise<File> => {
  if (/\.docx?$/i.test(file.name)) throw new Error("Save Word documents as PDF before uploading.");
  if (!/\.(pdf|png|jpe?g)$/i.test(file.name) && !["application/pdf", "image/png", "image/jpeg"].includes(file.type)) throw new Error("Upload a PDF, PNG or JPG file.");
  return file;
};

export const normalizeUploads = (files: File[]) => Promise.all(files.map(normalizeUpload));

export async function normalizeUploadData(data: FileData): Promise<FileData> {
  if (/\.docx?$/i.test(data.name)) throw new Error("Save Word documents as PDF before uploading.");
  return data;
}

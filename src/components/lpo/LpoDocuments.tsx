import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, FileText, Trash2, ExternalLink } from 'lucide-react';
import { DOC_TYPES, docTypeLabel, type LpoDocument } from '@/lib/lpoTracker';
import { useLpoDocuments } from '@/hooks/useLpoDocuments';

function fileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function LpoDocuments({ orderId }: { orderId: string }) {
  const { documents, uploadDocument, deleteDocument, openDocument } = useLpoDocuments(orderId);
  const [docType, setDocType] = useState<string>('client_lpo');
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      await uploadDocument.mutateAsync({ file, docType, title });
    }
    setTitle('');
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Documents</h3>

      <div className="rounded-md border p-3 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Document type</Label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DOC_TYPES.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="doc-title">Title (optional)</Label>
            <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. LPO Rev.1" />
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={uploadDocument.isPending}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="w-4 h-4" />
          {uploadDocument.isPending ? 'Uploading…' : 'Upload file(s)'}
        </Button>
        <p className="text-xs text-muted-foreground">PDF, images or Office files up to 25 MB each.</p>
      </div>

      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">No documents attached yet.</p>
      ) : (
        <ul className="space-y-2">
          {documents.map((doc: LpoDocument) => (
            <li key={doc.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
              <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{doc.title || doc.file_name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {docTypeLabel(doc.doc_type)}
                  {doc.file_size_bytes ? ` · ${fileSize(doc.file_size_bytes)}` : ''}
                  {doc.uploaded_by_name ? ` · ${doc.uploaded_by_name}` : ''}
                  {` · ${new Date(doc.created_at).toLocaleDateString('en-GB')}`}
                </div>
              </div>
              <Button type="button" size="sm" variant="ghost" aria-label="Open document" onClick={() => openDocument(doc)}>
                <ExternalLink className="w-4 h-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label="Delete document"
                onClick={() => deleteDocument.mutate(doc)}
              >
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

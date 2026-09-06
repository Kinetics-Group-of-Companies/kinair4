/**
 * Download a file from a URL with a custom filename.
 * For cross-origin files, this fetches the file and triggers a download.
 */
export async function downloadFileWithName(url: string, filename: string): Promise<void> {
  try {
    // For same-origin or CORS-enabled URLs, try to fetch and download
    const response = await fetch(url);
    if (!response.ok) {
      // If fetch fails, fall back to opening in new tab
      window.open(url, '_blank');
      return;
    }
    
    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up the blob URL
    window.URL.revokeObjectURL(blobUrl);
  } catch (error) {
    // If CORS blocks the fetch, fall back to opening in new tab
    console.warn('Could not download file directly, opening in new tab:', error);
    window.open(url, '_blank');
  }
}

/**
 * Get a safe filename from a series name and document type
 */
export function getDocumentFilename(seriesName: string, docType: 'Catalogue' | 'IOM'): string {
  // Sanitize series name for filename
  const safeName = seriesName.replace(/[^a-zA-Z0-9-_]/g, '-');
  return `${safeName} ${docType}.pdf`;
}

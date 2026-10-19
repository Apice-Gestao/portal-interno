// Hosted preview opened inside the published artifact: that frame blocks
// downloads and the print dialog, so those buttons explain it instead of
// failing silently (TEMPORARY, goes away with the hosted preview).
export const PREVIEW_BLOCKED = "apice:preview-blocked";
export interface PreviewBlockedDetail {
  action: "download" | "print";
  name?: string;
}
const framedPreview =
  import.meta.env.VITE_DATA_MODE === "demo" &&
  (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();
function blocked(detail: PreviewBlockedDetail) {
  if (!framedPreview) return false;
  window.dispatchEvent(new CustomEvent(PREVIEW_BLOCKED, { detail }));
  return true;
}

/** Saves a file; returns false when the preview frame does not allow it. */
export function downloadBlob(name: string, blob: Blob) {
  if (blocked({ action: "download", name })) return false;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

export function downloadText(
  name: string,
  content: string,
  type = "text/csv;charset=utf-8",
) {
  return downloadBlob(name, new Blob(["﻿", content], { type }));
}

/** Opens the print dialog (PDF); returns false when the preview frame blocks it. */
export function printPage() {
  if (blocked({ action: "print" })) return false;
  window.print();
  return true;
}

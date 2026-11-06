"use client";

import * as React from "react";
import { Camera, X } from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Model                                                               */
/* ------------------------------------------------------------------ */

/** Photos on a work order or a tag: before / after the repair, or a finding. */
export type PhotoKind = "before" | "after" | "finding";
export type WorkPhoto = {
  id: string;
  src: string;
  kind: PhotoKind;
  caption?: string;
  by?: string;
  at?: string | Date;
};

export const PHOTO_KIND: Record<PhotoKind, { label: string; color: string }> = {
  before: { label: "Before", color: "var(--sys-orange)" },
  after: { label: "After", color: "var(--sys-green)" },
  finding: { label: "Finding", color: "var(--sys-indigo)" },
};

/**
 * Reads an image file and returns a JPEG data URL no larger than `max` px on its long side: phone photos are
 * shrunk on the device before upload.
 */
export function resizeImage(file: File, max = 1600, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export type PhotoGalleryProps = {
  photos: WorkPhoto[];
  /** shows the add tile; receives the resized data URL and the chosen kind */
  onAdd?: (dataUrl: string, kind: PhotoKind) => void | Promise<void>;
  onRemove?: (id: string) => void;
  busy?: boolean;
  className?: string;
};

export function PhotoGallery({ photos, onAdd, onRemove, busy, className }: PhotoGalleryProps) {
  const input = React.useRef<HTMLInputElement>(null);
  const [kind, setKind] = React.useState<PhotoKind>("before");
  const [open, setOpen] = React.useState<WorkPhoto | null>(null);
  const pick = async (files: FileList | null) => {
    for (const f of Array.from(files ?? [])) await onAdd?.(await resizeImage(f), kind);
    if (input.current) input.current.value = "";
  };
  return (
    <div className={cn("grid gap-2", className)}>
      {onAdd && (
        <div className="flex items-center gap-1">
          {(Object.keys(PHOTO_KIND) as PhotoKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn(
                "h-6 rounded-full border px-2 text-[11.5px]",
                kind === k
                  ? "border-foreground bg-foreground text-background"
                  : "text-muted-foreground",
              )}
            >
              {PHOTO_KIND[k].label}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2">
        {photos.map((p) => (
          <figure
            key={p.id}
            className="group relative aspect-square overflow-hidden rounded-lg border bg-muted"
          >
            <button type="button" className="size-full" onClick={() => setOpen(p)}>
              <img
                src={p.src}
                alt={p.caption || PHOTO_KIND[p.kind].label}
                className="size-full object-cover"
              />
            </button>
            <span
              className="absolute top-1 left-1 rounded-full px-1.5 text-[10.5px] font-medium text-white"
              style={{ background: PHOTO_KIND[p.kind].color }}
            >
              {PHOTO_KIND[p.kind].label}
            </span>
            {onRemove && (
              <button
                type="button"
                aria-label="Remove photo"
                onClick={() => onRemove(p.id)}
                className="absolute top-1 right-1 hidden size-5 place-items-center rounded-full bg-black/60 text-white group-hover:grid"
              >
                <X className="size-3" />
              </button>
            )}
          </figure>
        ))}
        {onAdd && (
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="grid aspect-square place-items-center rounded-lg border border-dashed text-muted-foreground hover:bg-subtle disabled:opacity-50"
          >
            <span className="grid justify-items-center gap-1 text-[12px]">
              <Camera className="size-5" />
              {busy ? "Uploading…" : `Add ${PHOTO_KIND[kind].label.toLowerCase()}`}
            </span>
          </button>
        )}
        {!onAdd && photos.length === 0 && (
          <div className="col-span-full py-4 text-center text-[12px] text-muted-foreground">
            No photos
          </div>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        hidden
        onChange={(e) => void pick(e.target.files)}
      />
      {open && (
        <div
          role="dialog"
          aria-modal
          className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4"
          onClick={() => setOpen(null)}
        >
          <figure className="max-h-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <img
              src={open.src}
              alt={open.caption ?? ""}
              className="max-h-[80vh] rounded-lg object-contain"
            />
            <figcaption className="mt-2 text-center text-[13px] text-white/85">
              {PHOTO_KIND[open.kind].label}
              {open.caption ? ` · ${open.caption}` : ""}
              {open.by ? ` · ${open.by}` : ""}
              {open.at ? ` · ${new Date(open.at).toLocaleString()}` : ""}
            </figcaption>
          </figure>
        </div>
      )}
    </div>
  );
}

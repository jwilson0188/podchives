"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ArchiveOption } from "@/components/search/FilterPanel";

const STATUS_OPTIONS = [
  { value: "", label: "All episodes" },
  { value: "searchable", label: "Fully searchable" },
  { value: "processing", label: "Processing" },
  { value: "failed", label: "Failed" },
] as const;

export function EpisodeFilterBar({ archives = [] }: { archives?: ArchiveOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const archive = searchParams.get("archive") ?? "";
  const status = searchParams.get("status") ?? "";

  const pushParams = (next: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const reset = () => {
    router.replace(pathname, { scroll: false });
  };

  return (
    <>
      <details className="md:hidden card mb-4 group">
        <summary className="p-4 cursor-pointer list-none flex items-center justify-between font-semibold text-sm tracking-tight">
          <span>Filters</span>
          <span className="text-text-muted text-xs font-normal">
            {status === "searchable"
              ? "Searchable only"
              : status
                ? STATUS_OPTIONS.find((o) => o.value === status)?.label
                : "All"}
          </span>
        </summary>
        <div className="px-4 pb-4 border-t border-border pt-4">
          <FilterFields
            archives={archives}
            archive={archive}
            status={status}
            onArchive={(v) => pushParams({ archive: v, status })}
            onStatus={(v) => pushParams({ archive, status: v })}
            onReset={reset}
          />
        </div>
      </details>

      <div className="hidden md:flex card p-4 mb-4 items-end gap-4 flex-wrap">
        <FilterFields
          archives={archives}
          archive={archive}
          status={status}
          onArchive={(v) => pushParams({ archive: v, status })}
          onStatus={(v) => pushParams({ archive, status: v })}
          onReset={reset}
          inline
        />
      </div>
    </>
  );
}

function FilterFields({
  archives,
  archive,
  status,
  onArchive,
  onStatus,
  onReset,
  inline,
}: {
  archives: ArchiveOption[];
  archive: string;
  status: string;
  onArchive: (v: string) => void;
  onStatus: (v: string) => void;
  onReset: () => void;
  inline?: boolean;
}) {
  return (
    <div
      className={
        inline
          ? "flex flex-wrap items-end gap-4 flex-1"
          : "space-y-4"
      }
    >
      <div className={inline ? "min-w-[10rem] flex-1" : undefined}>
        <label className="label">Archive</label>
        <select
          className="input min-h-[44px] md:min-h-0"
          value={archive}
          onChange={(e) => onArchive(e.target.value)}
        >
          <option value="">All archives</option>
          {archives.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className={inline ? "min-w-[10rem] flex-1" : undefined}>
        <label className="label">Status</label>
        <select
          className="input min-h-[44px] md:min-h-0"
          value={status}
          onChange={(e) => onStatus(e.target.value)}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value || "all"} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {(archive || status) && (
        <button
          type="button"
          onClick={onReset}
          className={
            inline
              ? "btn-ghost text-sm min-h-[44px] md:min-h-0 px-3"
              : "text-[11px] text-text-muted hover:text-text-primary uppercase tracking-wider"
          }
        >
          Reset filters
        </button>
      )}
    </div>
  );
}

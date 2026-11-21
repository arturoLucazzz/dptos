import type { SourceBadge } from "@/lib/source-badges";

const PILL = "inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground";

/** One small pill per portal; a pill with a URL opens that portal's listing in a new tab. */
export function SourceBadges({ badges }: { badges: SourceBadge[] }) {
  if (badges.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {badges.map((b) =>
        b.url ? (
          <a
            key={b.source}
            href={b.url}
            target="_blank"
            rel="noopener noreferrer"
            title={`Ver en ${b.label}`}
            className={`${PILL} hover:border-primary hover:text-foreground`}
          >
            {b.label}
          </a>
        ) : (
          <span key={b.source} className={PILL}>
            {b.label}
          </span>
        ),
      )}
    </div>
  );
}

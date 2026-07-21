import Link from "next/link";

// ─────────────────────────────────────────────────────────────────────────
// NavTab — single pill-style nav link
// ─────────────────────────────────────────────────────────────────────────

function NavTab({ href, label, emphasis = false }: { href: string; label: string; emphasis?: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-sm border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors ${
        emphasis
          ? "border-[var(--brass)] text-[var(--brass)] hover:bg-[var(--brass)]/10"
          : "border-[var(--hairline)] text-[var(--slate)] hover:border-[var(--slate)] hover:text-[var(--parchment)]"
      }`}
    >
      {label}
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Nav config — single source of truth for the top-bar links.
// Edit this array to add/remove/reorder links across every page at once.
// ─────────────────────────────────────────────────────────────────────────

const NAV_LINKS: { href: string; label: string; emphasis?: boolean }[] = [
  { href: "/teams", label: "Team Insights" },
  { href: "/stats/team-power-rankings", label: "Power Rankings" },
  { href: "/players", label: "Player Ratings" },
  { href: "/stats/match-centre", label: "Match Centre" },
  { href: "/stats/top-games", label: "Top Games" },
  { href: "/stats/category-kings", label: "Category Kings" },
  { href: "/stats/breakout-watch", label: "Breakout Watch" },
  { href: "/stats/justice-ladder", label: "Justice Ladder", emphasis: true },
];

// ─────────────────────────────────────────────────────────────────────────
// SiteHeader — logo/wordmark + nav bar. Drop this in at the top of any
// page's <main> in place of the old inline "Utility bar" markup.
// ─────────────────────────────────────────────────────────────────────────

export default function SiteHeader() {
  return (
    <div className="mb-10 flex flex-col gap-4 border-b border-[var(--hairline)] pb-6 sm:flex-row sm:items-center sm:justify-between">
      <Link
        href="/"
        className="flex items-center gap-3 font-mono text-[11px] tracking-[0.25em] text-[var(--brass)]"
      >
        <span className="inline-block h-px w-8 bg-[var(--brass)]" />
        FOOTY NARRATIVE ENGINE
      </Link>
      <nav className="flex flex-wrap gap-2">
        {NAV_LINKS.map((link) => (
          <NavTab key={link.href} href={link.href} label={link.label} emphasis={link.emphasis} />
        ))}
      </nav>
    </div>
  );
}
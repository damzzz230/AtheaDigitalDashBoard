/** Athea Digital "AD" monogram, traced from the brand logo as vector paths so it stays sharp on any screen. */
export function Monogram({ className, title = "Athea Digital" }: { className?: string; title?: string }) {
  return (
    <svg viewBox="460 255 665 370" className={className} role="img" aria-label={title} fill="currentColor">
      <path fillRule="evenodd" d="M472 615 635 265h58l162 350h-68l-31-65H570l-29 65Zm192-263-67 142h133Z" />
      <path fillRule="evenodd" d="M807 265h133c100 0 173 75 173 175s-73 175-173 175h-63l-70-153Zm59 58v237h74c65 0 108-55 108-120s-43-117-108-117Z" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <Monogram className="h-7 w-auto text-ink" />
      <span className="text-[15px] font-medium tracking-wide text-ink">Athea Digital</span>
    </span>
  );
}

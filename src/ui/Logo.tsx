export function Logo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label="vibe-pipeline">
      <path d="M4 7 L9 12 L4 17" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 7 L15 12 L10 17" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
      <circle cx="19" cy="12" r="2" fill="var(--accent)" />
    </svg>
  );
}

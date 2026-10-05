interface SkeletonProps {
  /** Number of placeholder rows. */
  rows?: number;
  /** Announced to screen readers while loading. */
  label: string;
  className?: string;
}

/** Grey placeholder rows shown while a query has no data yet. */
export default function Skeleton({ rows = 3, label, className = '' }: SkeletonProps) {
  return (
    <div role="status" aria-label={label} className={`animate-pulse space-y-3 ${className}`}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-10 rounded-sm bg-gray-200" />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

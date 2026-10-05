import type { ReactNode } from 'react';

/** A labelled read-only value on the member profile. */
export function Field({
  label,
  children,
  className = 'text-sm text-gray-900',
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div>
      {/* A read-only value, so the caption is text rather than a form <label>. */}
      <span className="block text-sm font-medium text-gray-700">{label}</span>
      <p className={className}>{children}</p>
    </div>
  );
}

/** A profile section heading with an optional count on the right. */
export function SectionHeader({ title, count }: { title: string; count?: string }) {
  return (
    <div className="flex justify-between items-center">
      <h2 className="text-lg font-medium text-gray-900">{title}</h2>
      {count && <span className="text-sm text-gray-500">{count}</span>}
    </div>
  );
}

/** The centred grey "nothing here" line in a profile tab. */
export function EmptyTab({ children }: { children: ReactNode }) {
  return (
    <div className="text-center py-8">
      <p className="text-gray-500">{children}</p>
    </div>
  );
}

export const pillClass = 'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium';

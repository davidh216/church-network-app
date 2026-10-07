interface DistributionListProps {
  title: string;
  /** Category -> count, shown in the order given. */
  counts: Record<string, number>;
  colourFor: (key: string) => string;
  labelFor: (key: string) => string;
}

/** A titled card listing each category's badge and count (stages, risk levels). */
export default function DistributionList({
  title,
  counts,
  colourFor,
  labelFor,
}: DistributionListProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-xs">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-lg font-medium text-gray-900">{title}</h2>
      </div>
      <div className="p-6">
        <div className="space-y-3">
          {Object.entries(counts).map(([key, count]) => (
            <div key={key} className="flex items-center justify-between">
              <span
                className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${colourFor(key)}`}
              >
                {labelFor(key)}
              </span>
              <span className="text-sm font-medium text-gray-900">{count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

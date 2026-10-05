/** Centred spinner for route-level loading states. */
export default function PageSpinner({ label = 'Loading...' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center justify-center py-24">
      <div className="text-center">
        <div
          aria-hidden="true"
          className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"
        ></div>
        <p className="mt-4 text-gray-600">{label}</p>
      </div>
    </div>
  );
}

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-sm font-medium text-blue-600">404</p>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Page not found</h1>
        <p className="mt-2 text-gray-600">There is nothing at this address.</p>
        <Link href="/" className="mt-4 inline-block text-blue-600 font-medium">
          Go to the dashboard
        </Link>
      </div>
    </div>
  );
}

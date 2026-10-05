import type { MemberAnalytics } from '@/types/domain';

interface Tile {
  label: string;
  value: string | number;
  colour: string;
  icon: string;
  evenOdd?: boolean;
}

function tiles(a: MemberAnalytics): Tile[] {
  return [
    {
      label: 'Total Members',
      value: a.totalMembers,
      colour: 'bg-blue-500',
      icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    },
    {
      label: 'Active Members',
      value: a.activeMembers,
      colour: 'bg-green-500',
      icon: 'M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z',
    },
    {
      label: 'New This Month',
      value: a.newMembersThisMonth,
      colour: 'bg-purple-500',
      icon: 'M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 7a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V7z',
    },
    {
      label: 'At Risk',
      value: a.atRiskMembers,
      colour: 'bg-red-500',
      evenOdd: true,
      icon: 'M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z',
    },
    {
      label: 'Avg Engagement',
      value: `${a.averageEngagementScore}%`,
      colour: 'bg-indigo-500',
      icon: 'M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z',
    },
  ];
}

/** The five key-metric tiles at the top of the analytics dashboard. */
export default function StatTiles({ analytics }: { analytics: MemberAnalytics }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
      {tiles(analytics).map((tile) => (
        <div key={tile.label} className="bg-white p-6 rounded-lg border border-gray-200 shadow-xs">
          <div className="flex items-center">
            <div className="shrink-0">
              <div
                className={`w-8 h-8 ${tile.colour} rounded-full flex items-center justify-center`}
              >
                <svg
                  aria-hidden="true"
                  className="w-4 h-4 text-white"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  {tile.evenOdd ? (
                    <path fillRule="evenodd" clipRule="evenodd" d={tile.icon} />
                  ) : (
                    <path d={tile.icon} />
                  )}
                </svg>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">{tile.label}</p>
              <p className="text-2xl font-bold text-gray-900">{tile.value}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

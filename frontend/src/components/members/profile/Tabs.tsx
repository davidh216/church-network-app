export const PROFILE_TABS = [
  { id: 'personal', label: 'Personal Info', icon: '👤' },
  { id: 'church', label: 'Church Info', icon: '⛪' },
  { id: 'contact', label: 'Contact & Address', icon: '📧' },
  { id: 'timeline', label: 'Timeline', icon: '📅' },
  { id: 'family', label: 'Family', icon: '👨‍👩‍👧‍👦' },
  { id: 'interactions', label: 'Interactions', icon: '💬' },
  { id: 'milestones', label: 'Milestones', icon: '🏆' },
  { id: 'activity', label: 'Activity & Notes', icon: '📊' },
] as const;

export type ProfileTabId = (typeof PROFILE_TABS)[number]['id'];

interface TabsProps {
  active: ProfileTabId;
  onChange: (tab: ProfileTabId) => void;
}

/** The member profile's tab bar. */
export default function Tabs({ active, onChange }: TabsProps) {
  return (
    <div className="border-b border-gray-200 mb-6">
      <nav className="-mb-px flex space-x-8 overflow-x-auto">
        {PROFILE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap flex items-center space-x-2 ${
              active === tab.id
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

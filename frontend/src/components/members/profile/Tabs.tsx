const PROFILE_TABS = [
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

/** The DOM ids that tie each tab to the panel below it. */
export const tabId = (id: ProfileTabId) => `profile-tab-${id}`;
export const panelId = (id: ProfileTabId) => `profile-panel-${id}`;

/**
 * The member profile's tab bar (ARIA tabs pattern): only the selected tab is in the Tab order,
 * and the arrow keys, Home and End move between tabs and select them.
 */
export default function Tabs({ active, onChange }: TabsProps) {
  const select = (index: number) => {
    const count = PROFILE_TABS.length;
    const tab = PROFILE_TABS[(index + count) % count]!;
    onChange(tab.id);
    document.getElementById(tabId(tab.id))?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: PROFILE_TABS.length - 1,
    };
    const next = moves[e.key];
    if (next === undefined) return;
    e.preventDefault();
    select(next);
  };

  return (
    <div className="border-b border-gray-200 mb-6">
      <div
        role="tablist"
        aria-label="Member profile sections"
        className="-mb-px flex space-x-8 overflow-x-auto"
      >
        {PROFILE_TABS.map((tab, index) => {
          const selected = active === tab.id;
          return (
            <button
              key={tab.id}
              id={tabId(tab.id)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId(tab.id)}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.id)}
              onKeyDown={(e) => onKeyDown(e, index)}
              className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap flex items-center space-x-2 ${
                selected
                  ? 'border-blue-500 text-blue-700'
                  : 'border-transparent text-gray-600 hover:text-gray-800 hover:border-gray-300'
              }`}
            >
              <span aria-hidden="true">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

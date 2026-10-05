'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  href: string;
  label: string;
}

/** True when `href` is the current page or a section containing it ("/members" for "/members/x"). */
export function isCurrent(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function navItems(staff: boolean, userId: string): NavItem[] {
  return [
    { href: '/', label: 'Dashboard' },
    { href: '/members', label: 'Members' },
    { href: '/media', label: 'Media' },
    ...(staff
      ? [
          { href: '/services', label: 'Services' },
          { href: '/analytics', label: 'Analytics' },
        ]
      : []),
    { href: `/members/${encodeURIComponent(userId)}`, label: 'My Profile' },
  ];
}

export default function AppNav({ staff, userId }: { staff: boolean; userId: string }) {
  const pathname = usePathname() ?? '/';
  const items = navItems(staff, userId);
  // The most specific match wins, so "/members/<me>" marks My Profile rather than Members.
  const current = items
    .filter((item) => isCurrent(pathname, item.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav aria-label="Main" className="border-t border-gray-100">
      <ul className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap gap-1 py-2">
        {items.map((item) => {
          const active = item.href === current;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`inline-block px-3 py-2 rounded-md text-sm font-medium ${
                  active ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

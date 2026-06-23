'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navigation() {
  const pathname = usePathname();

  const tabs = [
    { href: '/diagnostics', label: 'Diagnostics' },
    { href: '/testing', label: 'Testing' },
    { href: '/results', label: 'Results' }
  ];

  return (
    <nav className="flex space-x-1 border-b border-neutral-700">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-4 py-2 text-sm font-medium transition-colors rounded-t
              ${isActive
                ? 'border-b-2 border-blue-500 text-white bg-neutral-900'
                : 'border-b-2 border-transparent text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900'
              }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

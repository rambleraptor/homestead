'use client';

import Link from 'next/link';
import { ChevronRight, Flag, UserCog } from 'lucide-react';
import { Card } from '@/shared/components/Card';
import { PageHeader } from '@/shared/components/PageHeader';

interface AdminLink {
  href: string;
  title: string;
  description: string;
  icon: typeof UserCog;
  testid: string;
}

const ADMIN_LINKS: AdminLink[] = [
  {
    href: '/superuser/users',
    title: 'Users',
    description: 'Create and manage user accounts.',
    icon: UserCog,
    testid: 'superuser-link-users',
  },
  {
    href: '/superuser/flag-management',
    title: 'Flag Management',
    description: 'View and edit every module flag registered in aepbase.',
    icon: Flag,
    testid: 'superuser-link-flag-management',
  },
];

export function SuperuserHome() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Superuser"
        subtitle="Administrative tools for user accounts and module flags."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {ADMIN_LINKS.map(({ href, title, description, icon: Icon, testid }) => (
          <Link key={href} href={href} data-testid={testid} className="block">
            <Card className="h-full transition-colors hover:bg-gray-50">
              <div className="flex items-start gap-4">
                <Icon className="w-6 h-6 text-accent-terracotta mt-1 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900">{title}</h3>
                  <p className="mt-1 text-sm text-gray-600">{description}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

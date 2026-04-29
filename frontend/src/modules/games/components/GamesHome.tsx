'use client';

import Link from 'next/link';
import { ChevronRight, Flag, Pencil } from 'lucide-react';
import { Card } from '@/shared/components/Card';
import { PageHeader } from '@/shared/components/PageHeader';

interface GameLink {
  href: string;
  title: string;
  description: string;
  icon: typeof Flag;
  testid: string;
}

const GAME_LINKS: GameLink[] = [
  {
    href: '/games/minigolf',
    title: 'Mini Golf',
    description: 'Play and track mini golf games.',
    icon: Flag,
    testid: 'games-link-minigolf',
  },
  {
    href: '/games/pictionary',
    title: 'Pictionary',
    description: 'Track Pictionary games, teams, and winning words.',
    icon: Pencil,
    testid: 'games-link-pictionary',
  },
];

export function GamesHome() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Games"
        subtitle="Track games you play with the people in your life."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {GAME_LINKS.map(({ href, title, description, icon: Icon, testid }) => (
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

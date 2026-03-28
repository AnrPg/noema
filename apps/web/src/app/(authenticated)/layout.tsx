/**
 * Authenticated Routes Layout
 *
 * Routes that require authentication.
 */

'use client';

import * as React from 'react';
import type { JSX, ReactNode } from 'react';
import { meApi } from '@noema/api-client/user';
import { AuthGuard, useAuth, useAuthStore } from '@noema/auth';
import { getUserDisplayName, getUserInitials } from '@noema/auth/user-display';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  DashboardHeader,
  DashboardLayout,
  DashboardMain,
  DashboardSidebar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  SidebarNav,
  SidebarNavGroup,
  SidebarNavItem,
} from '@noema/ui';
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Brain,
  CalendarClock,
  ChevronDown,
  ClipboardList,
  Languages,
  GitCompare,
  LayoutDashboard,
  LibraryBig,
  LogOut,
  Settings,
  Target,
  User,
} from 'lucide-react';
import type { Route } from 'next';
import { usePathname, useRouter } from 'next/navigation';
import { CommandPalette } from '@/components/command-palette';
import { SessionExpiryModal } from '@/components/session-expiry-modal';
import { ShortcutReferencePanel } from '@/components/shortcut-reference-panel';
import { useAgentHintsInterceptor } from '@/hooks/use-agent-hints-interceptor';
import { CopilotSidebar, CopilotToggle } from '@/components/copilot';
import { DEFAULT_STUDY_MODE, isStudyMode, STUDY_MODE_STORAGE_KEY } from '@/lib/study-mode';

type AppStudyMode = 'language_learning' | 'knowledge_gaining';

const navItems = [
  {
    title: 'Overview',
    items: [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    title: 'Learning',
    items: [
      { href: '/learning', label: 'Study Sessions', icon: BookOpen },
      { href: '/reviews', label: 'Reviews', icon: CalendarClock },
      { href: '/knowledge', label: 'Knowledge Map', icon: Brain },
      { href: '/knowledge/health', label: 'KG Health', icon: Activity },
      { href: '/knowledge/misconceptions', label: 'Misconceptions', icon: AlertTriangle },
      { href: '/knowledge/comparison', label: 'KG Comparison', icon: GitCompare },
      { href: '/goals', label: 'Goals', icon: Target },
      { href: '/sessions', label: 'Sessions', icon: ClipboardList },
      { href: '/cards', label: 'Card Library', icon: LibraryBig },
    ],
  },
  {
    title: 'Account',
    items: [
      { href: '/profile', label: 'Profile', icon: User },
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

function UserMenu(): JSX.Element {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = async (): Promise<void> => {
    await logout();
    router.push('/login');
  };

  const displayName = getUserDisplayName(user);
  const initials = getUserInitials(user);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user?.avatarUrl ?? undefined} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <span className="hidden md:inline-block">{displayName}</span>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span>{displayName}</span>
            <span className="text-xs font-normal text-muted-foreground">{user?.email}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            router.push('/profile');
          }}
        >
          <User className="mr-2 h-4 w-4" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            router.push('/settings');
          }}
        >
          <Settings className="mr-2 h-4 w-4" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            void handleLogout();
          }}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function AuthenticatedLayout({ children }: { children: ReactNode }): JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const authSettings = useAuthStore((state) => state.settings);
  const setAuthSettings = useAuthStore((state) => state.setSettings);
  const [activeStudyMode, setActiveStudyMode] = React.useState<AppStudyMode>(DEFAULT_STUDY_MODE);
  const [isUpdatingStudyMode, setIsUpdatingStudyMode] = React.useState(false);
  const authSettingsStudyMode =
    typeof authSettings === 'object' &&
    authSettings !== null &&
    'activeStudyMode' in authSettings &&
    isStudyMode((authSettings as { activeStudyMode?: string }).activeStudyMode ?? null)
      ? (authSettings as { activeStudyMode: AppStudyMode }).activeStudyMode
      : undefined;

  useAgentHintsInterceptor();

  React.useEffect(() => {
    const persistedStudyMode = globalThis.localStorage.getItem(STUDY_MODE_STORAGE_KEY);

    if (isStudyMode(persistedStudyMode)) {
      setActiveStudyMode(persistedStudyMode);
    }
  }, []);

  React.useEffect(() => {
    const persistedStudyMode = authSettingsStudyMode;
    if (persistedStudyMode !== undefined && persistedStudyMode !== activeStudyMode) {
      setActiveStudyMode(persistedStudyMode);
      globalThis.localStorage.setItem(STUDY_MODE_STORAGE_KEY, persistedStudyMode);
    }
  }, [activeStudyMode, authSettingsStudyMode]);

  const handleStudyModeChange = React.useCallback(
    async (nextStudyMode: AppStudyMode): Promise<void> => {
      const previousStudyMode = activeStudyMode;
      setActiveStudyMode(nextStudyMode);
      globalThis.localStorage.setItem(STUDY_MODE_STORAGE_KEY, nextStudyMode);

      if (authSettings === null) {
        return;
      }

      setIsUpdatingStudyMode(true);
      try {
        const response = await meApi.updateSettings(
          { activeStudyMode: nextStudyMode },
          authSettings.version
        );
        setAuthSettings(response.data);
      } catch {
        setActiveStudyMode(previousStudyMode);
        globalThis.localStorage.setItem(STUDY_MODE_STORAGE_KEY, previousStudyMode);
      } finally {
        setIsUpdatingStudyMode(false);
      }
    },
    [activeStudyMode, authSettings, setAuthSettings]
  );

  return (
    <AuthGuard
      onUnauthenticated={() => {
        router.push(`/login?redirect=${encodeURIComponent(pathname)}` as Route);
      }}
    >
      <CommandPalette />
      <ShortcutReferencePanel />
      <SessionExpiryModal />
      <DashboardLayout>
        <DashboardSidebar
          header={
            <div className="flex items-center gap-2">
              <Brain className="h-6 w-6 text-primary" />
              <span className="font-bold text-lg">Noema</span>
            </div>
          }
        >
          {navItems.map((group) => (
            <SidebarNavGroup key={group.title} title={group.title}>
              <SidebarNav>
                {group.items.map((item) => (
                  <SidebarNavItem
                    key={item.href}
                    href={item.href}
                    icon={<item.icon className="h-4 w-4" />}
                    active={pathname === item.href}
                  >
                    {item.label}
                  </SidebarNavItem>
                ))}
              </SidebarNav>
            </SidebarNavGroup>
          ))}
        </DashboardSidebar>

        <DashboardMain>
          <DashboardHeader>
            <div className="ml-auto flex items-center gap-3">
              <div className="hidden items-center gap-1 rounded-full border border-border/70 bg-background/80 p-1 md:flex">
                <Button
                  variant={activeStudyMode === 'knowledge_gaining' ? 'default' : 'ghost'}
                  size="sm"
                  disabled={isUpdatingStudyMode}
                  onClick={() => {
                    void handleStudyModeChange('knowledge_gaining');
                  }}
                >
                  <Brain className="mr-1.5 h-3.5 w-3.5" />
                  Knowledge
                </Button>
                <Button
                  variant={activeStudyMode === 'language_learning' ? 'default' : 'ghost'}
                  size="sm"
                  disabled={isUpdatingStudyMode}
                  onClick={() => {
                    void handleStudyModeChange('language_learning');
                  }}
                >
                  <Languages className="mr-1.5 h-3.5 w-3.5" />
                  Language
                </Button>
              </div>
              <UserMenu />
            </div>
          </DashboardHeader>
          <div className="p-6">{children}</div>
        </DashboardMain>
      </DashboardLayout>
      <CopilotSidebar />
      <CopilotToggle />
    </AuthGuard>
  );
}

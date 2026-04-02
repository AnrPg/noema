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
import { CopilotSidebar, CopilotToggle } from '@/components/copilot';
import { PomodoroNav } from '@/components/pomodoro/pomodoro-nav';
import { SessionExpiryModal } from '@/components/session-expiry-modal';
import { ShortcutReferencePanel } from '@/components/shortcut-reference-panel';
import { useAgentHintsInterceptor } from '@/hooks/use-agent-hints-interceptor';
import { StudyModeProvider } from '@/hooks/use-active-study-mode';
import {
  DEFAULT_STUDY_MODE,
  getStudyModeFromSettings,
  persistStudyMode,
  readStoredStudyMode,
} from '@/lib/study-mode';

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

function UserMenu(props: { compact?: boolean; fullWidth?: boolean }): JSX.Element {
  const { user, logout } = useAuth();
  const router = useRouter();
  const compact = props.compact ?? false;
  const fullWidth = props.fullWidth ?? false;

  const handleLogout = async (): Promise<void> => {
    await logout();
    router.push('/login');
  };

  const displayName = getUserDisplayName(user);
  const initials = getUserInitials(user);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={[
            'flex items-center gap-2',
            compact ? 'px-2 sm:px-3' : 'px-3',
            fullWidth ? 'w-full justify-between' : '',
          ].join(' ')}
        >
          <Avatar className="h-8 w-8">
            <AvatarImage src={user?.avatarUrl ?? undefined} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <span
            className={
              fullWidth
                ? 'min-w-0 flex-1 truncate text-left'
                : compact
                  ? 'hidden lg:inline-block'
                  : 'hidden md:inline-block'
            }
          >
            {displayName}
          </span>
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

function StudyModeToggle(props: {
  activeStudyMode: AppStudyMode;
  isUpdatingStudyMode: boolean;
  isCompact?: boolean;
  fullWidth?: boolean;
  onChange: (studyMode: AppStudyMode) => void;
}): JSX.Element {
  const isCompact = props.isCompact === true;
  const fullWidth = props.fullWidth === true;

  return (
    <div
      className={[
        'flex items-center gap-1 rounded-full border border-border/70 bg-background/80 p-1',
        fullWidth ? 'w-full' : isCompact ? 'shrink-0' : 'hidden md:flex',
      ].join(' ')}
      aria-label="Study mode"
      role="group"
    >
      <Button
        variant={props.activeStudyMode === 'knowledge_gaining' ? 'default' : 'ghost'}
        size="sm"
        disabled={props.isUpdatingStudyMode}
        className={[
          fullWidth ? 'flex-1 justify-center' : '',
          isCompact ? 'h-9 min-w-0 gap-1.5 px-2.5 sm:px-3' : '',
        ].join(' ')}
        onClick={() => {
          props.onChange('knowledge_gaining');
        }}
      >
        <Brain className={isCompact ? 'h-3.5 w-3.5 sm:h-4 sm:w-4' : 'mr-1.5 h-3.5 w-3.5'} />
        <span className={isCompact ? 'hidden sm:inline' : undefined}>Knowledge</span>
      </Button>
      <Button
        variant={props.activeStudyMode === 'language_learning' ? 'default' : 'ghost'}
        size="sm"
        disabled={props.isUpdatingStudyMode}
        className={[
          fullWidth ? 'flex-1 justify-center' : '',
          isCompact ? 'h-9 min-w-0 gap-1.5 px-2.5 sm:px-3' : '',
        ].join(' ')}
        onClick={() => {
          props.onChange('language_learning');
        }}
      >
        <Languages className={isCompact ? 'h-3.5 w-3.5 sm:h-4 sm:w-4' : 'mr-1.5 h-3.5 w-3.5'} />
        <span className={isCompact ? 'hidden sm:inline' : undefined}>Language</span>
      </Button>
    </div>
  );
}

export default function AuthenticatedLayout({ children }: { children: ReactNode }): JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const isActiveSessionRoute =
    pathname.startsWith('/session/') &&
    pathname !== '/session/new' &&
    !pathname.endsWith('/summary');
  const authSettings = useAuthStore((state) => state.settings);
  const setAuthSettings = useAuthStore((state) => state.setSettings);
  const [activeStudyMode, setActiveStudyMode] = React.useState<AppStudyMode>(DEFAULT_STUDY_MODE);
  const [isUpdatingStudyMode, setIsUpdatingStudyMode] = React.useState(false);
  const authSettingsStudyMode = getStudyModeFromSettings(authSettings);

  useAgentHintsInterceptor();

  React.useEffect(() => {
    const persistedStudyMode = readStoredStudyMode();
    if (persistedStudyMode !== undefined) {
      setActiveStudyMode(persistedStudyMode);
    }
  }, []);

  React.useEffect(() => {
    const persistedStudyMode = authSettingsStudyMode;
    if (persistedStudyMode !== undefined && persistedStudyMode !== activeStudyMode) {
      setActiveStudyMode(persistedStudyMode);
      persistStudyMode(persistedStudyMode);
    }
  }, [activeStudyMode, authSettingsStudyMode]);

  const handleStudyModeChange = React.useCallback(
    async (nextStudyMode: AppStudyMode): Promise<void> => {
      const previousStudyMode = activeStudyMode;
      setActiveStudyMode(nextStudyMode);
      persistStudyMode(nextStudyMode);

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
        persistStudyMode(previousStudyMode);
      } finally {
        setIsUpdatingStudyMode(false);
      }
    },
    [activeStudyMode, authSettings, setAuthSettings]
  );

  return (
    <StudyModeProvider value={{ activeStudyMode, setActiveStudyMode }}>
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
            <div className="mb-4 space-y-3 border-b border-border/70 pb-4 lg:hidden">
              <UserMenu fullWidth />
              <StudyModeToggle
                activeStudyMode={activeStudyMode}
                isUpdatingStudyMode={isUpdatingStudyMode}
                fullWidth
                onChange={(nextStudyMode) => {
                  void handleStudyModeChange(nextStudyMode);
                }}
              />
            </div>
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
            <DashboardHeader
              {...(isActiveSessionRoute
                ? {
                    className: 'min-h-14 flex-nowrap items-center gap-2 py-2 sm:min-h-16 sm:gap-3',
                  }
                : {})}
            >
              <div
                className={[
                  isActiveSessionRoute ? 'min-w-0 flex-1' : 'w-full',
                  isActiveSessionRoute
                    ? 'flex items-center gap-2 sm:flex-nowrap sm:items-center sm:gap-3'
                    : 'w-full min-w-0 justify-between flex-wrap gap-3 sm:flex-nowrap sm:gap-4',
                ].join(' ')}
              >
                <div
                  className={
                    isActiveSessionRoute
                      ? 'flex min-w-0 flex-1 items-center gap-2 sm:justify-start'
                      : 'flex min-w-0 flex-1 items-center gap-2 sm:gap-3'
                  }
                >
                  <PomodoroNav compact={isActiveSessionRoute} />
                </div>

                <div
                  className={[
                    'hidden shrink-0 items-center gap-2 lg:flex',
                    isActiveSessionRoute
                      ? 'w-full justify-between sm:ml-auto sm:w-auto sm:justify-end sm:gap-2'
                      : 'ml-auto w-full justify-end sm:w-auto sm:gap-3',
                  ].join(' ')}
                >
                  <StudyModeToggle
                    activeStudyMode={activeStudyMode}
                    isUpdatingStudyMode={isUpdatingStudyMode}
                    isCompact={isActiveSessionRoute}
                    onChange={(nextStudyMode) => {
                      void handleStudyModeChange(nextStudyMode);
                    }}
                  />
                  <UserMenu compact={isActiveSessionRoute} />
                </div>
              </div>
            </DashboardHeader>
            <div className={isActiveSessionRoute ? 'p-0' : 'p-4 sm:p-6'}>{children}</div>
          </DashboardMain>
        </DashboardLayout>
        <CopilotSidebar />
        <CopilotToggle />
      </AuthGuard>
    </StudyModeProvider>
  );
}

/**
 * Admin Dashboard Layout
 */

'use client';

import type { ElementType, JSX, ReactNode } from 'react';
import { AdminGuard, useAuth } from '@noema/auth';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  DashboardHeader,
  DashboardLayout as DashboardLayoutUI,
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
  BookOpen,
  Calendar,
  ChevronDown,
  FileText,
  GitPullRequest,
  LayoutDashboard,
  LogOut,
  Network,
  Settings,
  Shield,
  Users,
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';

const ACCENT = '#86efac';

interface INavItemDef {
  href: string;
  label: string;
  icon: ElementType;
  exact?: boolean;
}

interface INavGroup {
  title: string;
  items: INavItemDef[];
}

const navGroups: INavGroup[] = [
  {
    title: 'Overview',
    items: [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, exact: true }],
  },
  {
    title: 'Knowledge',
    items: [
      { href: '/dashboard/ckg/graph', label: 'CKG Graph', icon: Network },
      { href: '/dashboard/ckg/mutations', label: 'Mutation Pipeline', icon: GitPullRequest },
    ],
  },
  {
    title: 'Content',
    items: [
      { href: '/dashboard/content', label: 'Content Oversight', icon: BookOpen },
      { href: '/dashboard/content/templates', label: 'Card Templates', icon: FileText },
      { href: '/dashboard/content/sessions', label: 'Sessions', icon: Calendar },
    ],
  },
  {
    title: 'Users',
    items: [{ href: '/dashboard/users', label: 'User Management', icon: Users }],
  },
  {
    title: 'System',
    items: [
      { href: '/dashboard/settings', label: 'Settings', icon: Settings },
      { href: '/dashboard/activity', label: 'Activity Log', icon: Activity },
    ],
  },
];

interface IAuthContext {
  user: { displayName: string; email: string; avatarUrl: string | null } | null;
  logout: () => Promise<void>;
}

function AdminMenu(): JSX.Element {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const auth = useAuth() as IAuthContext;
  const user: IAuthContext['user'] = auth.user;
  const logout: () => Promise<void> = auth.logout;
  const router = useRouter();

  const handleLogout = async (): Promise<void> => {
    try {
      await logout();
    } catch {
      // Token revocation failed — navigate anyway, session is invalid
    }
    router.push('/login');
  };

  const displayName = user?.displayName ?? '';
  const initials =
    displayName !== ''
      ? displayName
          .split(' ')
          .map((n: string) => n[0] ?? '')
          .join('')
          .toUpperCase()
      : 'A';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user?.avatarUrl ?? undefined} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <span className="hidden md:inline-block">{user?.displayName}</span>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span>{user?.displayName}</span>
            <span className="text-xs font-normal text-muted-foreground">{user?.email}</span>
          </div>
        </DropdownMenuLabel>
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

export default function DashboardLayout({ children }: { children: ReactNode }): JSX.Element {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <AdminGuard
      onUnauthenticated={() => {
        router.push('/login');
      }}
    >
      <DashboardLayoutUI>
        <DashboardSidebar
          header={
            <div className="flex items-center gap-2">
              <Shield className="h-6 w-6" style={{ color: ACCENT }} />
              <span className="font-bold text-lg" style={{ color: ACCENT }}>
                Noema Admin
              </span>
            </div>
          }
        >
          {navGroups.map((group) => (
            <SidebarNavGroup key={group.title} title={group.title}>
              <SidebarNav>
                {group.items.map((item) => {
                  const isActive =
                    item.exact === true
                      ? pathname === item.href
                      : pathname === item.href || pathname.startsWith(item.href + '/');
                  return (
                    <SidebarNavItem
                      key={item.href}
                      href={item.href}
                      icon={
                        <item.icon
                          className="h-4 w-4"
                          style={isActive ? { color: ACCENT } : undefined}
                        />
                      }
                      active={isActive}
                    >
                      <span style={isActive ? { color: ACCENT } : undefined}>{item.label}</span>
                    </SidebarNavItem>
                  );
                })}
              </SidebarNav>
            </SidebarNavGroup>
          ))}
        </DashboardSidebar>

        <DashboardMain>
          <DashboardHeader>
            <div className="ml-auto">
              <AdminMenu />
            </div>
          </DashboardHeader>
          <div className="p-6">{children}</div>
        </DashboardMain>
      </DashboardLayoutUI>
    </AdminGuard>
  );
}

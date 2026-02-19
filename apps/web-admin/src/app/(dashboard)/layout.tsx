/**
 * Admin Dashboard Layout
 */

'use client';

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
    ChevronDown,
    LayoutDashboard,
    LogOut,
    Settings,
    Shield,
    Users,
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';

const navItems = [
  {
    title: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/dashboard/activity', label: 'Activity', icon: Activity },
    ],
  },
  {
    title: 'Management',
    items: [{ href: '/dashboard/users', label: 'Users', icon: Users }],
  },
  {
    title: 'System',
    items: [{ href: '/dashboard/settings', label: 'Settings', icon: Settings }],
  },
];

function AdminMenu() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const initials =
    user?.displayName
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase() || 'A';

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
        <DropdownMenuItem onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <AdminGuard onUnauthenticated={() => { router.push('/login'); }}>
      <DashboardLayoutUI>
        <DashboardSidebar
          header={
            <div className="flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              <span className="font-bold text-lg">Noema Admin</span>
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

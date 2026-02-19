/**
 * @noema/ui - Dashboard Layout Component
 *
 * Layout with sidebar for dashboard pages.
 */

'use client';

import { Menu } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/utils.js';
import { Button } from '../primitives/button.js';
import { Separator } from '../primitives/separator.js';

// ============================================================================
// Sidebar Context
// ============================================================================

interface SidebarContextValue {
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within DashboardLayout');
  }
  return context;
}

// ============================================================================
// Components
// ============================================================================

export interface DashboardLayoutProps {
  children: React.ReactNode;
  className?: string;
}

export function DashboardLayout({ children, className }: DashboardLayoutProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  const toggle = React.useCallback(() => setIsOpen((prev) => !prev), []);
  const close = React.useCallback(() => setIsOpen(false), []);

  return (
    <SidebarContext.Provider value={{ isOpen, toggle, close }}>
      <div className={cn('min-h-screen bg-background', className)}>{children}</div>
    </SidebarContext.Provider>
  );
}

export interface DashboardSidebarProps {
  children: React.ReactNode;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function DashboardSidebar({ children, header, footer, className }: DashboardSidebarProps) {
  const { isOpen, close } = useSidebar();

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={close} />}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 h-full w-64 border-r bg-card transition-transform duration-300 lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          className
        )}
      >
        <div className="flex h-full flex-col">
          {header && (
            <>
              <div className="flex h-16 items-center px-4">{header}</div>
              <Separator />
            </>
          )}
          <nav className="flex-1 overflow-y-auto p-4">{children}</nav>
          {footer && (
            <>
              <Separator />
              <div className="p-4">{footer}</div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

export interface DashboardMainProps {
  children: React.ReactNode;
  className?: string;
}

export function DashboardMain({ children, className }: DashboardMainProps) {
  return <main className={cn('lg:pl-64', className)}>{children}</main>;
}

export interface DashboardHeaderProps {
  children?: React.ReactNode;
  title?: string;
  className?: string;
}

export function DashboardHeader({ children, title, className }: DashboardHeaderProps) {
  const { toggle } = useSidebar();

  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-4',
        className
      )}
    >
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={toggle}>
        <Menu className="h-5 w-5" />
        <span className="sr-only">Toggle sidebar</span>
      </Button>
      {title && <h1 className="text-lg font-semibold">{title}</h1>}
      {children}
    </header>
  );
}

export interface SidebarNavProps {
  children: React.ReactNode;
  className?: string;
}

export function SidebarNav({ children, className }: SidebarNavProps) {
  return <ul className={cn('space-y-1', className)}>{children}</ul>;
}

export interface SidebarNavItemProps {
  children: React.ReactNode;
  icon?: React.ReactNode;
  active?: boolean;
  href?: string;
  onClick?: () => void;
  className?: string;
}

export function SidebarNavItem({
  children,
  icon,
  active,
  href,
  onClick,
  className,
}: SidebarNavItemProps) {
  const { close } = useSidebar();

  const handleClick = () => {
    close();
    onClick?.();
  };

  const Comp = href ? 'a' : 'button';

  return (
    <li>
      <Comp
        href={href}
        onClick={handleClick}
        className={cn(
          'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          active
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
          className
        )}
      >
        {icon}
        {children}
      </Comp>
    </li>
  );
}

export interface SidebarNavGroupProps {
  children: React.ReactNode;
  title?: string;
  className?: string;
}

export function SidebarNavGroup({ children, title, className }: SidebarNavGroupProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {title && (
        <h3 className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}

export { useSidebar };

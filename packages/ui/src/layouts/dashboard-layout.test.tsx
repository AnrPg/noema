import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  DashboardHeader,
  DashboardLayout,
  DashboardMain,
  DashboardSidebar,
  SidebarNav,
  SidebarNavItem,
} from './dashboard-layout.js';

function renderDashboardLayout(): void {
  render(
    <DashboardLayout>
      <DashboardSidebar header={<span>Brand</span>}>
        <SidebarNav>
          <SidebarNavItem href="/dashboard">Dashboard</SidebarNavItem>
        </SidebarNav>
      </DashboardSidebar>
      <DashboardMain>
        <DashboardHeader title="Dashboard" />
        <div>Content</div>
      </DashboardMain>
    </DashboardLayout>
  );
}

function renderDashboardLayoutWithAction(): void {
  render(
    <DashboardLayout>
      <DashboardSidebar header={<span>Brand</span>}>
        <SidebarNav>
          <SidebarNavItem onClick={vi.fn()}>Dashboard action</SidebarNavItem>
        </SidebarNav>
      </DashboardSidebar>
      <DashboardMain>
        <DashboardHeader title="Dashboard" />
        <div>Content</div>
      </DashboardMain>
    </DashboardLayout>
  );
}

describe('DashboardLayout', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(max-width: 1023px)' ? false : false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it('renders the sidebar closed by default', () => {
    renderDashboardLayout();

    expect(screen.getByText('Brand').closest('aside')).toHaveAttribute('data-state', 'closed');
    expect(screen.getByText('Content').closest('main')).toHaveAttribute('data-sidebar-state', 'closed');
  });

  it('toggles the sidebar from the header button', () => {
    renderDashboardLayout();

    fireEvent.click(screen.getByRole('button', { name: /toggle sidebar/i }));

    expect(screen.getByText('Brand').closest('aside')).toHaveAttribute('data-state', 'open');
    expect(screen.getByText('Content').closest('main')).toHaveAttribute('data-sidebar-state', 'open');
  });

  it('keeps the desktop sidebar open when a navigation item is clicked', () => {
    renderDashboardLayoutWithAction();

    fireEvent.click(screen.getByRole('button', { name: /toggle sidebar/i }));

    fireEvent.click(screen.getByRole('button', { name: /dashboard action/i }));

    expect(screen.getByText('Brand').closest('aside')).toHaveAttribute('data-state', 'open');
  });

  it('closes the mobile sidebar when a navigation item is clicked', () => {
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: query === '(max-width: 1023px)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    renderDashboardLayout();
    fireEvent.click(screen.getByRole('button', { name: /toggle sidebar/i }));
    fireEvent.click(screen.getByRole('link', { name: /dashboard/i }));

    expect(screen.getByText('Brand').closest('aside')).toHaveAttribute('data-state', 'closed');
  });
});

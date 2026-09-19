import { DashboardSidebar } from '@/components/layout/dashboard-sidebar';
import { DashboardTopbar } from '@/components/layout/dashboard-topbar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh overflow-hidden bg-ground">
      <DashboardSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardTopbar />
        <main id="main" className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

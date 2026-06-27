import { Sidebar } from "./Sidebar";
import { TopNav } from "./TopNav";
import { MobileNav } from "./MobileNav";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex bg-bg">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopNav />
        <main className="flex-1 overflow-y-auto pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
          <div className="px-3 sm:px-4 lg:px-8 py-4 sm:py-6 lg:py-8 max-w-[1600px] mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
      <MobileNav />
    </div>
  );
}

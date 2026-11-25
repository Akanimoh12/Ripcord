import { AppHeader } from "@/components/Headers";
import { SetupNotice } from "@/components/SetupNotice";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", fontSize: 18, lineHeight: 1.45 }}>
      <AppHeader />
      <main className="app-main">
        <div className="app-wrap stack" style={{ gap: 36 }}>
          <SetupNotice />
          {children}
        </div>
      </main>
    </div>
  );
}

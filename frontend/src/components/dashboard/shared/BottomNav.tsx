import React from "react";
import { Home, Wallet, Inbox } from "lucide-react";

interface BottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  needsReviewCount: number;
}

export default function BottomNav({ activeTab, setActiveTab, needsReviewCount }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 w-full bg-background/80 backdrop-blur-xl border-t border-border/50 pb-safe pt-2 px-6 flex justify-between items-center z-50">
      <button
        onClick={() => setActiveTab("dashboard")}
        className={`flex-1 flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all ${activeTab === 'dashboard' ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground/70'}`}
      >
        <Home className={`w-6 h-6 ${activeTab === 'dashboard' ? 'fill-foreground/10' : ''}`} strokeWidth={activeTab === 'dashboard' ? 2.5 : 2} />
        <span className="text-[10px] uppercase tracking-widest font-mono">Home</span>
      </button>
      <button
        onClick={() => setActiveTab("transactions")}
        className={`flex-1 flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all ${activeTab === 'transactions' ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground/70'}`}
      >
        <Wallet className={`w-6 h-6 ${activeTab === 'transactions' ? 'fill-foreground/10' : ''}`} strokeWidth={activeTab === 'transactions' ? 2.5 : 2} />
        <span className="text-[10px] uppercase tracking-widest font-mono">Ledger</span>
      </button>
      <button
        onClick={() => setActiveTab("inbox")}
        className={`flex-1 flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all relative ${activeTab === 'inbox' ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground/70'}`}
      >
        <div className="relative">
          <Inbox className={`w-6 h-6 ${activeTab === 'inbox' ? 'fill-foreground/10' : ''}`} strokeWidth={activeTab === 'inbox' ? 2.5 : 2} />
          {needsReviewCount > 0 && (
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-warning rounded-full border-[2px] border-background" />
          )}
        </div>
        <span className={`text-[10px] uppercase tracking-widest font-mono ${activeTab === 'inbox' && needsReviewCount > 0 ? 'text-warning' : ''}`}>Inbox</span>
      </button>
    </nav>
  );
}

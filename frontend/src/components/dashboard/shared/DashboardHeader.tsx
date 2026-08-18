import React from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface DashboardHeaderProps {
  selectedMonth: number;
  selectedYear: number;
  setSelectedMonth: React.Dispatch<React.SetStateAction<number>>;
  setSelectedYear: React.Dispatch<React.SetStateAction<number>>;
  waStatus?: { connected: boolean; qr: string } | null;
  onWaStatusClick?: () => void;
}

export default function DashboardHeader({ selectedMonth, selectedYear, setSelectedMonth, setSelectedYear, waStatus, onWaStatusClick }: DashboardHeaderProps) {
  return (
    <header className="p-6 pb-4 flex justify-between items-center">
      <div>
        <h1 className="text-2xl font-heading font-semibold tracking-tight">WhatsMonTrack</h1>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-muted-foreground font-mono text-xs opacity-70">
            {process.env.NEXT_PUBLIC_DEFAULT_PHONE_NUMBER}
          </p>
          {waStatus && (
            <button 
              onClick={onWaStatusClick}
              className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors ${
                waStatus.connected 
                  ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400" 
                  : "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400"
              }`}
            >
              {waStatus.connected ? "Connected" : "Disconnected (Click to Link)"}
            </button>
          )}
        </div>
      </div>

      {/* Global Filter */}
      <div className="flex items-center gap-2 bg-secondary/50 p-1.5 rounded-xl border border-border/30 backdrop-blur-md">
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 rounded-lg" 
          onClick={() => setSelectedMonth(m => m === 1 ? 12 : m - 1)}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm font-heading font-medium min-w-[70px] text-center">
          {MONTHS[selectedMonth - 1]} {selectedYear}
        </span>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 rounded-lg" 
          onClick={() => setSelectedMonth(m => m === 12 ? 1 : m + 1)}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </header>
  );
}

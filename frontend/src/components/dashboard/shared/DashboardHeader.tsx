import React from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface DashboardHeaderProps {
  selectedMonth: number;
  selectedYear: number;
  setSelectedMonth: React.Dispatch<React.SetStateAction<number>>;
  setSelectedYear: React.Dispatch<React.SetStateAction<number>>;
}

export default function DashboardHeader({ selectedMonth, selectedYear, setSelectedMonth, setSelectedYear }: DashboardHeaderProps) {
  return (
    <header className="p-6 pb-4 flex justify-between items-center">
      <div>
        <h1 className="text-2xl font-heading font-semibold tracking-tight">WhatsMonTrack</h1>
        <p className="text-muted-foreground font-mono text-xs mt-1 opacity-70">
          {process.env.NEXT_PUBLIC_DEFAULT_PHONE_NUMBER}
        </p>
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

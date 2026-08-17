import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";

interface InboxViewProps {
  needsReviewTxs: any[];
  handleConfirm: (id: string) => void;
  formatRupiah: (val: number) => string;
}

export default function InboxView({ needsReviewTxs, handleConfirm, formatRupiah }: InboxViewProps) {
  
  // Helper for Segmented Bar
  const renderConfidenceBar = (score: number) => {
    const dots = 5;
    const filled = Math.round(score * dots);
    return (
      <div className="flex gap-1 items-center">
        {Array.from({ length: dots }).map((_, i) => (
          <div
            key={i}
            className={`w-4 h-1.5 rounded-full ${i < filled ? (score > 0.8 ? 'bg-income' : 'bg-warning') : 'bg-muted-foreground/30'}`}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-heading font-bold">Needs Review</h2>
        {needsReviewTxs.length > 0 && (
          <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 font-mono">
            {needsReviewTxs.length} items
          </Badge>
        )}
      </div>

      {needsReviewTxs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
            <MessageCircle className="w-8 h-8 opacity-50" />
          </div>
          <p className="font-medium text-foreground">Inbox is clean</p>
          <p className="text-sm opacity-70">No new messages to parse.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {needsReviewTxs.map(tx => (
            <div key={tx.id} className="relative pl-6 before:absolute before:left-2 before:top-4 before:bottom-0 before:w-px before:bg-border/50">
              {/* Node Dot */}
              <div className="absolute left-[3px] top-1.5 w-2.5 h-2.5 rounded-full bg-warning ring-4 ring-background z-10" />

              <div className="flex flex-col gap-4">
                {/* WhatsApp Bubble (Raw Text) */}
                <div className="self-end max-w-[85%] bg-whatsapp text-[#0B101E] px-4 py-2.5 rounded-2xl rounded-tr-sm relative shadow-sm">
                  <p className="text-sm font-medium">{tx.rawText}</p>
                  <span className="text-[10px] opacity-70 block text-right mt-1 font-mono">from WhatsApp</span>
                </div>

                {/* Parsed Data Card */}
                <div className="bg-card border border-border rounded-2xl p-4 shadow-sm relative ml-4">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1">Parsed Output</p>
                      <h3 className="font-bold text-lg font-heading">{tx.subcategory || tx.category}</h3>
                    </div>
                    <Badge variant="outline" className="font-mono bg-secondary">{tx.type}</Badge>
                  </div>

                  <div className="text-3xl font-heading font-bold tabular-nums tracking-tighter text-foreground mb-4">
                    {formatRupiah(tx.amount)}
                  </div>

                  <div className="flex items-center justify-between border-t border-border pt-4 mt-2">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-mono text-muted-foreground">CONFIDENCE</span>
                      {renderConfidenceBar(tx.confidenceScore)}
                    </div>
                    <Button
                      onClick={() => handleConfirm(tx.id)}
                      size="default"
                      className="bg-foreground text-background hover:bg-foreground/90 rounded-full font-heading font-medium active:scale-95 transition-transform"
                    >
                      Confirm
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

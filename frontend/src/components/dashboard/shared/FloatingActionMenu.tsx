import React, { useState } from 'react';
import { Plus, Wallet, Target, ReceiptText } from 'lucide-react';

export default function FloatingActionMenu() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Backdrop to close when clicking outside */}
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-background/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setIsOpen(false)} />
      )}

      <div className="fixed bottom-24 right-6 z-50 flex flex-col items-end gap-3">
        {isOpen && (
          <div className="flex flex-col items-end gap-3 mb-2">
            <button 
              onClick={() => { setIsOpen(false); document.dispatchEvent(new CustomEvent('openAddTransactionModal')); }}
              className="flex items-center gap-3 bg-card border border-border shadow-md pl-4 pr-1 py-1 rounded-full hover:bg-secondary transition-all animate-in slide-in-from-bottom-2 fade-in"
              style={{ animationDelay: '100ms', animationFillMode: 'both' }}
            >
              <span className="text-sm font-medium tracking-wide pr-2">Add Transaction</span>
              <div className="bg-primary/20 text-primary p-2.5 rounded-full"><ReceiptText size={18} /></div>
            </button>
            
            <button 
              onClick={() => { setIsOpen(false); document.dispatchEvent(new CustomEvent('openSetBudgetModal')); }}
              className="flex items-center gap-3 bg-card border border-border shadow-md pl-4 pr-1 py-1 rounded-full hover:bg-secondary transition-all animate-in slide-in-from-bottom-2 fade-in"
              style={{ animationDelay: '50ms', animationFillMode: 'both' }}
            >
              <span className="text-sm font-medium tracking-wide pr-2">Set Budget</span>
              <div className="bg-blue-500/20 text-blue-500 p-2.5 rounded-full"><Target size={18} /></div>
            </button>
            
            <button 
              onClick={() => { setIsOpen(false); document.dispatchEvent(new CustomEvent('openAddAccountModal')); }}
              className="flex items-center gap-3 bg-card border border-border shadow-md pl-4 pr-1 py-1 rounded-full hover:bg-secondary transition-all animate-in slide-in-from-bottom-2 fade-in"
              style={{ animationDelay: '0ms', animationFillMode: 'both' }}
            >
              <span className="text-sm font-medium tracking-wide pr-2">Add Account</span>
              <div className="bg-emerald-500/20 text-emerald-500 p-2.5 rounded-full"><Wallet size={18} /></div>
            </button>
          </div>
        )}

        <button 
          onClick={() => setIsOpen(!isOpen)}
          className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 outline-none
            ${isOpen ? 'bg-secondary text-foreground rotate-45 border border-border' : 'bg-emerald-500 text-[#0B101E] shadow-emerald-500/20 hover:bg-emerald-400 active:scale-95'}
          `}
        >
          <Plus className="w-6 h-6" strokeWidth={2.5} />
        </button>
      </div>
    </>
  );
}

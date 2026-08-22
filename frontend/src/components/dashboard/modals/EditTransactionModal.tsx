import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface EditTransactionModalProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  editTxData: any;
  setEditTxData: (data: any) => void;
  accounts: any[];
  handleSaveEdit: () => void;
}

export default function EditTransactionModal({
  isOpen,
  setIsOpen,
  editTxData,
  setEditTxData,
  accounts,
  handleSaveEdit
}: EditTransactionModalProps) {
  const formatDateForInput = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="bg-card border-border sm:max-w-[425px] rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-heading">Edit Transaction</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="space-y-1">
            <label className="text-xs font-mono text-muted-foreground uppercase">Type</label>
            <select 
              className="w-full bg-background border border-border/50 rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
              value={editTxData.type || ''}
              onChange={e => setEditTxData({ ...editTxData, type: e.target.value })}
            >
              <option value="EXPENSE">Expense</option>
              <option value="INCOME">Income</option>
              <option value="TRANSFER">Transfer</option>
            </select>
          </div>
          
          <div className="space-y-1">
            <label className="text-xs font-mono text-muted-foreground uppercase">Amount (Rp)</label>
            <Input type="number" className="bg-background rounded-xl" value={editTxData.amount || ''} onChange={e => setEditTxData({ ...editTxData, amount: e.target.value })} />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-mono text-muted-foreground uppercase">Category</label>
            <Input className="bg-background rounded-xl uppercase" value={editTxData.category || ''} onChange={e => setEditTxData({ ...editTxData, category: e.target.value.toUpperCase() })} />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-mono text-muted-foreground uppercase">Description</label>
            <Input className="bg-background rounded-xl" value={editTxData.subcategory || ''} onChange={e => setEditTxData({ ...editTxData, subcategory: e.target.value })} />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-mono text-muted-foreground uppercase">{editTxData.type === 'INCOME' ? 'To Account' : 'From Account'}</label>
            <select 
              className="w-full bg-background border border-border/50 rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
              value={editTxData.type === 'INCOME' ? editTxData.toAccountId || '' : editTxData.fromAccountId || ''}
              onChange={e => {
                if (editTxData.type === 'INCOME') {
                  setEditTxData({ ...editTxData, toAccountId: e.target.value })
                } else {
                  setEditTxData({ ...editTxData, fromAccountId: e.target.value })
                }
              }}
            >
              <option value="">-- Select Account --</option>
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>{acc.name}</option>
              ))}
            </select>
          </div>

          {editTxData.type === 'TRANSFER' && (
            <div className="space-y-1">
              <label className="text-xs font-mono text-muted-foreground uppercase">To Account</label>
              <select 
                className="w-full bg-background border border-border/50 rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                value={editTxData.toAccountId || ''}
                onChange={e => setEditTxData({ ...editTxData, toAccountId: e.target.value })}
              >
                <option value="">-- Select Account --</option>
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-mono text-muted-foreground uppercase">Date & Time</label>
            <Input 
              type="datetime-local" 
              className="bg-background rounded-xl" 
              value={formatDateForInput(editTxData.createdAt)} 
              onChange={e => setEditTxData({ ...editTxData, createdAt: new Date(e.target.value).toISOString() })} 
            />
          </div>

          <Button onClick={handleSaveEdit} className="w-full font-heading bg-emerald-500 text-[#0B101E] hover:bg-emerald-400 rounded-xl py-6 mt-4 text-md font-bold">Save Changes</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

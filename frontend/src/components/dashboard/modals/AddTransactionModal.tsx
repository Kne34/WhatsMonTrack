import React, { useState } from 'react';
import { X } from 'lucide-react';

export default function AddTransactionModal({ isOpen, onClose, onSave, accounts }: { isOpen: boolean, onClose: () => void, onSave: (data: any) => Promise<void>, accounts: any[] }) {
  const [type, setType] = useState('EXPENSE');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [createdAt, setCreatedAt] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await onSave({
      type,
      amount: parseInt(amount),
      category: category.toUpperCase(),
      fromAccountId: fromAccountId || null,
      toAccountId: toAccountId || null,
      createdAt: createdAt ? new Date(createdAt).toISOString() : undefined
    });
    setLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-card border border-border w-[90%] max-w-md rounded-3xl shadow-xl overflow-hidden animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-6 border-b border-border/50 sticky top-0 bg-card z-10">
          <h2 className="text-xl font-heading font-bold text-foreground">Add Transaction</h2>
          <button onClick={onClose} className="p-2 hover:bg-secondary rounded-full transition-colors text-muted-foreground"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Type</label>
            <select value={type} onChange={e => setType(e.target.value)} className="w-full bg-background border border-input rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
              <option value="EXPENSE">Expense</option>
              <option value="INCOME">Income</option>
              <option value="TRANSFER">Transfer</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Amount (IDR)</label>
            <input required type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" className="w-full bg-background border border-input rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Category</label>
            <input required type="text" value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. FOOD, TRANSPORT" className="w-full bg-background border border-input rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 uppercase" />
          </div>
          
          {type !== 'INCOME' && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">{type === 'TRANSFER' ? 'From Account' : 'Account'}</label>
              <select required value={fromAccountId} onChange={e => setFromAccountId(e.target.value)} className="w-full bg-background border border-input rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                <option value="">Select Account</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}

          {type !== 'EXPENSE' && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">{type === 'TRANSFER' ? 'To Account' : 'Account'}</label>
              <select required value={toAccountId} onChange={e => setToAccountId(e.target.value)} className="w-full bg-background border border-input rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                <option value="">Select Account</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Date & Time (Optional)</label>
            <input type="datetime-local" value={createdAt} onChange={e => setCreatedAt(e.target.value)} className="w-full bg-background border border-input rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>

          <div className="pt-4 flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-3 px-4 rounded-xl font-medium text-sm border border-input bg-background hover:bg-secondary transition-colors">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 py-3 px-4 rounded-xl font-medium text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
              {loading ? "Saving..." : "Add"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

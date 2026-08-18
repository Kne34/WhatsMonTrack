import React, { useState, useEffect } from 'react';
import { X, Trash2 } from 'lucide-react';
import ConfirmModal from './ConfirmModal';

export default function SetBudgetModal({ 
  isOpen, 
  onClose, 
  onSave, 
  initialBudget, 
  onDelete 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onSave: (cat: string, limit: number) => Promise<void>, 
  initialBudget?: any, 
  onDelete?: (id: string) => Promise<void> 
}) {
  const [category, setCategory] = useState('');
  const [limit, setLimit] = useState('');
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (initialBudget) {
        setCategory(initialBudget.categoryName || '');
        setLimit(initialBudget.limit?.toString() || '');
      } else {
        setCategory('');
        setLimit('');
      }
    }
  }, [isOpen, initialBudget]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await onSave(category.toUpperCase(), parseInt(limit));
    setLoading(false);
    onClose();
  };

  const handleDelete = async () => {
    if (initialBudget && onDelete) {
      setLoading(true);
      await onDelete(initialBudget.id);
      setLoading(false);
      onClose();
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in">
        <div className="bg-card border border-border w-[90%] max-w-md rounded-3xl shadow-xl overflow-hidden animate-in zoom-in-95">
          <div className="flex justify-between items-center p-6 border-b border-border/50">
            <h2 className="text-xl font-heading font-bold text-foreground">{initialBudget ? 'Edit Budget' : 'Set Category Budget'}</h2>
            <button onClick={onClose} className="p-2 hover:bg-secondary rounded-full transition-colors text-muted-foreground"><X size={20} /></button>
          </div>
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Category Name</label>
              <input required type="text" value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. FOOD, TRANSPORT" className="w-full bg-background border border-input rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 uppercase" readOnly={!!initialBudget} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Monthly Limit (IDR)</label>
              <input required type="number" value={limit} onChange={e => setLimit(e.target.value)} placeholder="0" className="w-full bg-background border border-input rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div className="pt-4 flex gap-3">
              {initialBudget && onDelete && (
                <button type="button" onClick={() => setShowConfirm(true)} disabled={loading} className="py-3 px-4 rounded-xl font-medium text-sm border border-input bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors">
                  <Trash2 size={20} />
                </button>
              )}
              <button type="button" onClick={onClose} className="flex-1 py-3 px-4 rounded-xl font-medium text-sm border border-input bg-background hover:bg-secondary transition-colors">Cancel</button>
              <button type="submit" disabled={loading} className="flex-1 py-3 px-4 rounded-xl font-medium text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
                {loading ? "Saving..." : "Save Budget"}
              </button>
            </div>
          </form>
        </div>
      </div>
      <ConfirmModal 
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleDelete}
        title="Delete Budget"
        description={`Are you sure you want to delete the budget for ${initialBudget?.categoryName}?`}
        confirmText="Delete"
      />
    </>
  );
}

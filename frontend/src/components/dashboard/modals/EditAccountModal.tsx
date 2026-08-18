import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ConfirmModal from './ConfirmModal';

interface EditAccountModalProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  account: any;
  onSave: (id: string, name: string, balance: number) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export default function EditAccountModal({
  isOpen,
  setIsOpen,
  account,
  onSave,
  onDelete
}: EditAccountModalProps) {
  const [name, setName] = useState('');
  const [balance, setBalance] = useState('');
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (account && isOpen) {
      setName(account.name || '');
      setBalance(account.balance?.toString() || '0');
    }
  }, [account, isOpen]);

  const handleSave = async () => {
    setLoading(true);
    await onSave(account.id, name, parseFloat(balance) || 0);
    setLoading(false);
    setIsOpen(false);
  };

  const handleDelete = async () => {
    setLoading(true);
    await onDelete(account.id);
    setLoading(false);
    setIsOpen(false);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="bg-card border-border sm:max-w-[425px] rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-heading">Edit Account</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <label className="text-xs font-mono text-muted-foreground uppercase">Account Name</label>
              <Input 
                placeholder="e.g. BCA, OVO, Cash" 
                className="bg-background rounded-xl uppercase" 
                value={name} 
                onChange={e => setName(e.target.value.toUpperCase())} 
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-mono text-muted-foreground uppercase">Balance (Rp)</label>
              <Input 
                type="number" 
                placeholder="0" 
                className="bg-background rounded-xl" 
                value={balance} 
                onChange={e => setBalance(e.target.value)} 
              />
            </div>
            <div className="flex gap-2 mt-2">
              <Button onClick={() => setShowConfirm(true)} disabled={loading} className="w-1/3 bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-xl py-6 text-md font-bold">
                Delete
              </Button>
              <Button onClick={handleSave} disabled={loading} className="w-2/3 font-heading bg-emerald-500 text-[#0B101E] hover:bg-emerald-400 rounded-xl py-6 text-md font-bold">
                {loading ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmModal 
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleDelete}
        title="Delete Account"
        description={`Are you sure you want to delete ${account?.name}? This might fail if it has transactions.`}
        confirmText="Delete"
      />
    </>
  );
}

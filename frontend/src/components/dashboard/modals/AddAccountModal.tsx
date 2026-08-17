import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";

interface AddAccountModalProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  newAccountName: string;
  setNewAccountName: (name: string) => void;
  newAccountBalance: string;
  setNewAccountBalance: (bal: string) => void;
  handleAddAccount: () => void;
}

export default function AddAccountModal({
  isOpen,
  setIsOpen,
  newAccountName,
  setNewAccountName,
  newAccountBalance,
  setNewAccountBalance,
  handleAddAccount
}: AddAccountModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger className="fixed bottom-24 right-6 w-14 h-14 bg-emerald-500 text-[#0B101E] rounded-full shadow-lg shadow-emerald-500/20 flex items-center justify-center hover:bg-emerald-400 active:scale-95 transition-all z-40 outline-none">
        <Plus className="w-6 h-6" strokeWidth={2.5} />
      </DialogTrigger>
      <DialogContent className="bg-card border-border sm:max-w-[425px] rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-heading">Create New Account</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <label className="text-xs font-mono text-muted-foreground uppercase">Account Name</label>
            <Input 
              placeholder="e.g. BCA, OVO, Cash" 
              className="bg-background rounded-xl" 
              value={newAccountName} 
              onChange={e => setNewAccountName(e.target.value)} 
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-mono text-muted-foreground uppercase">Initial Balance (Rp)</label>
            <Input 
              type="number" 
              placeholder="0" 
              className="bg-background rounded-xl" 
              value={newAccountBalance} 
              onChange={e => setNewAccountBalance(e.target.value)} 
            />
          </div>
          <Button onClick={handleAddAccount} className="w-full font-heading bg-emerald-500 text-[#0B101E] hover:bg-emerald-400 rounded-xl py-6 mt-2 text-md font-bold">
            Create Account
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

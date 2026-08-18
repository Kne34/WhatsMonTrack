import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
}

export default function AlertModal({
  isOpen,
  onClose,
  title,
  description
}: AlertModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border sm:max-w-[400px] rounded-3xl z-[100]">
        <DialogHeader>
          <DialogTitle className="font-heading">{title}</DialogTitle>
          <DialogDescription className="mt-2 text-muted-foreground">{description}</DialogDescription>
        </DialogHeader>
        <div className="flex mt-4 pt-4 border-t border-border/50">
          <Button onClick={onClose} className="w-full rounded-xl py-6 font-bold bg-primary hover:bg-primary/90 text-primary-foreground">
            OK
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

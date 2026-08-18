import React, { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { resetWhatsAppSession, fetchWhatsAppStatus } from "@/lib/api";

interface WhatsAppStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: { connected: boolean; qr: string } | null;
  onResetComplete: () => void;
}

export default function WhatsAppStatusModal({ isOpen, onClose, status, onResetComplete }: WhatsAppStatusModalProps) {
  const [resetting, setResetting] = useState(false);
  const [localStatus, setLocalStatus] = useState(status);

  // Sync with parent prop
  useEffect(() => {
    setLocalStatus(status);
  }, [status]);

  // Aggressive polling when modal is open and not connected
  useEffect(() => {
    let interval: any;
    if (isOpen && !localStatus?.connected) {
      interval = setInterval(async () => {
        try {
          const res = await fetchWhatsAppStatus();
          setLocalStatus(res);
        } catch (err) {
          // Ignore errors during aggressive polling
        }
      }, 1500); // 1.5 seconds instead of 5 seconds
    }
    return () => clearInterval(interval);
  }, [isOpen, localStatus?.connected]);

  if (!isOpen) return null;

  const handleReset = async () => {
    setResetting(true);
    try {
      await resetWhatsAppSession();
      onResetComplete();
    } catch (err) {
      console.error("Failed to reset session", err);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl shadow-2xl p-6 sm:p-8 transform transition-all scale-100 flex flex-col items-center relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">WhatsApp Connection</h3>

        {localStatus?.connected ? (
          <div className="flex flex-col items-center justify-center my-8 w-full">
            <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-500 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-emerald-600 dark:text-emerald-400 font-medium text-lg">Connected!</p>
            <p className="text-slate-500 dark:text-slate-400 text-sm text-center mt-2 mb-8">
              Your bot is ready to receive expense logs.
            </p>

            <div className="w-full border-t border-slate-100 dark:border-slate-800 pt-6 mt-4">
              <p className="text-xs text-center text-slate-500 dark:text-slate-400 mb-3">
                Need to switch accounts or force disconnect?
              </p>
              <button
                onClick={handleReset}
                disabled={resetting}
                className="w-full py-2.5 px-4 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 rounded-xl font-medium transition-colors text-sm flex justify-center items-center gap-2"
              >
                {resetting ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <circle cx="12" cy="12" r="10" strokeWidth="4" className="opacity-25"></circle>
                      <path d="M4 12a8 8 0 018-8v8H4z" fill="currentColor" className="opacity-75"></path>
                    </svg>
                    Resetting...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Force Disconnect & Reset
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center w-full">
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-6">
              Scan this QR code with your WhatsApp "Linked Devices" feature.
            </p>

            <div className="bg-white p-4 rounded-xl shadow-inner border border-slate-100 mb-6 flex items-center justify-center w-64 h-64">
              {localStatus?.qr ? (
                <QRCodeSVG value={localStatus.qr} size={224} />
              ) : (
                <div className="flex flex-col items-center text-slate-400 animate-pulse">
                  <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Loading QR...</span>
                </div>
              )}
            </div>

            <div className="w-full border-t border-slate-100 dark:border-slate-800 pt-6">
              <p className="text-xs text-center text-slate-500 dark:text-slate-400 mb-3">
                Stuck loading or invalid session?
              </p>
              <button
                onClick={handleReset}
                disabled={resetting}
                className="w-full py-2.5 px-4 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 rounded-xl font-medium transition-colors text-sm flex justify-center items-center gap-2"
              >
                {resetting ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <circle cx="12" cy="12" r="10" strokeWidth="4" className="opacity-25"></circle>
                      <path d="M4 12a8 8 0 018-8v8H4z" fill="currentColor" className="opacity-75"></path>
                    </svg>
                    Resetting...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Force Wipe & Reset Session
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

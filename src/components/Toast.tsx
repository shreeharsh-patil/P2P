import React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const Toast: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none font-mono">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto p-3.5 rounded-xs border flex items-center justify-between shadow-2xl transition-all ${
            toast.type === 'success'
              ? 'border-emerald-500/40 bg-[#06120b] text-emerald-300'
              : toast.type === 'error'
              ? 'border-[#ff2b2b]/60 bg-[#140809] text-rose-300'
              : 'border-[#1c1c22] bg-[#09090b] text-[#f2f2f2]'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
            {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-[#ff2b2b] flex-shrink-0" />}
            {toast.type === 'info' && <Info className="w-4 h-4 text-[#ff2b2b] flex-shrink-0" />}
            <span className="text-xs font-medium">{toast.text}</span>
          </div>

          <button
            onClick={() => onDismiss(toast.id)}
            className="p-1 text-[#8a8a8a] hover:text-white transition-colors ml-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
};

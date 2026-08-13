
import React from 'react';
import { ToastMessage } from '../types';

interface Props {
  toasts: ToastMessage[];
  onClose: (id: string) => void;
}

export const ToastContainer: React.FC<Props> = ({ toasts, onClose }) => {
  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-3 w-80">
      {toasts.map((t) => (
        <div 
          key={t.id} 
          className={`flex items-start gap-3 p-4 rounded-xl shadow-2xl border animate-in slide-in-from-top-10 duration-300 ${
            t.type === 'success' ? 'bg-white border-green-100 text-green-800' :
            t.type === 'error' ? 'bg-white border-red-100 text-red-800' :
            t.type === 'warning' ? 'bg-white border-amber-100 text-amber-800' :
            'bg-white border-blue-100 text-blue-800'
          }`}
        >
          <span className={`material-symbols-outlined ${
             t.type === 'success' ? 'text-green-500' :
             t.type === 'error' ? 'text-red-500' :
             t.type === 'warning' ? 'text-amber-500' :
             'text-blue-500'
          }`}>
            {t.type === 'success' ? 'check_circle' : t.type === 'error' ? 'error' : t.type === 'warning' ? 'warning' : 'info'}
          </span>
          <div className="flex-1">
             <p className="text-xs font-bold leading-tight">{t.message}</p>
          </div>
          <button onClick={() => onClose(t.id)} className="text-slate-300 hover:text-slate-500">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      ))}
    </div>
  );
};

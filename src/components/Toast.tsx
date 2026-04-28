import { useState, useEffect, useCallback, createContext, useContext } from 'react';

interface ToastItem {
  id: number;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  duration: number;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastItem['type'], duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, type: ToastItem['type'] = 'info', duration = 4000) => {
    const id = ++nextId;
    setToasts((prev) => [...prev, { id, message, type, duration }]);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

const typeColors: Record<ToastItem['type'], string> = {
  info: 'rgba(100, 116, 139, 0.95)',
  success: 'rgba(34, 197, 94, 0.9)',
  warning: 'rgba(234, 179, 8, 0.9)',
  error: 'rgba(239, 68, 68, 0.9)',
};

function ToastContainer({ toasts, onRemove }: { toasts: ToastItem[]; onRemove: (id: number) => void }) {
  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 10000,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '8px',
      pointerEvents: 'none',
    }}>
      {toasts.map((toast) => (
        <ToastMessage key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
}

function ToastMessage({ toast, onRemove }: { toast: ToastItem; onRemove: (id: number) => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onRemove(toast.id), 300);
    }, toast.duration);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onRemove]);

  return (
    <div style={{
      padding: '10px 20px',
      borderRadius: '8px',
      backgroundColor: typeColors[toast.type],
      color: '#fff',
      fontSize: '13px',
      fontWeight: 500,
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      pointerEvents: 'auto',
      cursor: 'pointer',
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(12px)',
      transition: 'opacity 0.3s, transform 0.3s',
      maxWidth: '400px',
      textAlign: 'center',
    }}
      onClick={() => {
        setVisible(false);
        setTimeout(() => onRemove(toast.id), 300);
      }}
    >
      {toast.message}
    </div>
  );
}

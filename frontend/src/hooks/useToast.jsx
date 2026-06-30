import { createContext, useContext, useCallback, useState } from 'react';

const ToastContext = createContext();

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'info', icon = 'fa-info-circle') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type, icon }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => (
          <Toast key={t.id} {...t} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function Toast({ message, type, icon }) {
  const [removing, setRemoving] = useState(false);

  setTimeout(() => setRemoving(true), 3600);

  return (
    <div className={`toast ${type} ${removing ? 'removing' : ''}`}>
      <i className={`fa-solid ${icon} toast-icon`} />
      <span className="toast-text">{message}</span>
    </div>
  );
}

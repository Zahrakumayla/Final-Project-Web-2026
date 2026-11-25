"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Icon } from "@/components/shared/icons";
import { cn } from "@/lib/cn";

const ToastContext = createContext({ show: () => {} });
export const useToast = () => useContext(ToastContext);

const TONES = {
  success: "border-success/40 bg-success-soft text-success",
  error: "border-destructive/40 bg-danger-soft text-destructive",
  info: "border-info/40 bg-info-soft text-info",
};

const FLASH_COOKIE = "ayvora_flash";

// Pembungkus toast untuk seluruh dashboard. `flash` adalah pesan dari server
// (mis. setelah redirect) yang ditampilkan sekali lalu cookie-nya dihapus.
export function ToastProvider({ flash, children }) {
  const [toasts, setToasts] = useState([]);

  const show = useCallback((type, message) => {
    const id = crypto.randomUUID();
    setToasts((current) => [...current, { id, type, message }]);
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 5000);
  }, []);

  useEffect(() => {
    if (!flash) return;
    show(flash.type, flash.message);
    document.cookie = `${FLASH_COOKIE}=; Max-Age=0; path=/`;
  }, [flash, show]);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div aria-live="polite" className="fixed bottom-4 right-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((toast) => (
          <div key={toast.id} role="status" className={cn("flex items-start gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-card", TONES[toast.type] ?? TONES.info)}>
            <Icon name={toast.type === "error" ? "alert" : "check"} className="mt-0.5 size-4 shrink-0" />
            <span className="flex-1">{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// Menampilkan hasil Server Action sebagai toast. Pemakaian: useActionToast(state)
export function useActionToast(state) {
  const { show } = useToast();
  useEffect(() => {
    if (state?.message && (state.status === "success" || state.status === "error")) {
      show(state.status, state.message);
    }
  }, [state, show]);
}

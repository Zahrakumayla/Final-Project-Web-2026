"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

// Tombol submit yang otomatis menonaktifkan diri saat form sedang diproses
export function SubmitButton({ children, pendingLabel = "Memproses...", ...props }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  );
}

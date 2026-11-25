import { AppShell } from "@/components/layout/app-shell";
import { ROLES } from "@/lib/auth/config";

export const metadata = { title: { default: "Dashboard", template: "%s | AYVORA" } };

export default function AdminLayout({ children }) {
  return <AppShell allowedRoles={[ROLES.ADMIN]}>{children}</AppShell>;
}

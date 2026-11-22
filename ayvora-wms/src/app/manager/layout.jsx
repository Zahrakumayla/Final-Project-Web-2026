import { AppShell } from "@/components/layout/app-shell";
import { ROLES } from "@/lib/auth/config";

export const metadata = { title: { default: "Dashboard", template: "%s | AYVORA" } };

export default function ManagerLayout({ children }) {
  return <AppShell allowedRoles={[ROLES.WAREHOUSE_MANAGER]}>{children}</AppShell>;
}

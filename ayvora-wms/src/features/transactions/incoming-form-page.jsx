import { TransactionFormPage } from "@/features/transactions/form-page";

export default async function IncomingFormPage(props) {
  return TransactionFormPage({ ...props, type: "INCOMING" });
}

import { TransactionFormPage } from "@/features/transactions/form-page";

export default async function OutgoingFormPage(props) {
  return TransactionFormPage({ ...props, type: "OUTGOING" });
}

import { TransactionList } from "@/features/transactions/list-page";

export default async function OutgoingListPage(props) {
  return TransactionList({ ...props, type: "OUTGOING" });
}

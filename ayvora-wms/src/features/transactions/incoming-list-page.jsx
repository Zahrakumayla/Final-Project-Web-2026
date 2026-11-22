import { TransactionList } from "@/features/transactions/list-page";

export default async function IncomingListPage(props) {
  return TransactionList({ ...props, type: "INCOMING" });
}

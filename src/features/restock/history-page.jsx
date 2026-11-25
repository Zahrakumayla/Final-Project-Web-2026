import { RestockList } from "@/features/restock/list-page";

// Riwayat pesanan supplier. Detailnya tetap di /supplier/restock/[id].
export default function HistoryPage(props) {
  return <RestockList {...props} scope="history" path="history" />;
}

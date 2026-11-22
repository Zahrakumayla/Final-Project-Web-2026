import { RestockList } from "@/features/restock/list-page";

export default function SupplierActivePage(props) {
  return <RestockList {...props} scope="active" />;
}

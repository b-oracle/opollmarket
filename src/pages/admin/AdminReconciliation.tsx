import NpReconciliation from "@/components/admin/NpReconciliation";
import PayazaReconciliation from "@/components/admin/PayazaReconciliation";
import { Scale } from "lucide-react";

const AdminReconciliation = () => {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Scale className="w-6 h-6 text-primary" />
          Reconciliation
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Boundlesspay full reconciliation — compare and audit deposit &amp; withdrawal records
        </p>
      </div>

      <NpReconciliation />
      <PayazaReconciliation />
    </div>
  );
};

export default AdminReconciliation;

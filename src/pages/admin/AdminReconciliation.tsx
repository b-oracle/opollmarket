import NpReconciliation from "@/components/admin/NpReconciliation";
import PayazaReconciliation from "@/components/admin/PayazaReconciliation";
import FlutterwaveReconciliation from "@/components/admin/FlutterwaveReconciliation";
import BscReconciliation from "@/components/admin/BscReconciliation";
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
          Full reconciliation — compare and audit deposit &amp; withdrawal records across all providers
        </p>
      </div>

      <NpReconciliation />
      <PayazaReconciliation />
      <FlutterwaveReconciliation />
      <BscReconciliation />
    </div>
  );
};


export default AdminReconciliation;

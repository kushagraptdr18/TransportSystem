import { redirect } from "next/navigation";

// Document registration is a tab of the Document Master now; keep old links working.
export default function VehicleDocumentsRedirect() {
  redirect("/masters/document-master?tab=registration");
}

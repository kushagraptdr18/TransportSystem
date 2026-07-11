import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default function Home() {
  const session = getSession();
  if (!session) redirect("/login");
  if (session.firmId && session.fyId) redirect("/dashboard");
  redirect("/select-firm");
}

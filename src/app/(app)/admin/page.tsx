import { getServerSession } from "next-auth/next";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { canViewAnalytics } from "@/lib/admin";
import AnalyticsView from "@/components/AnalyticsView";

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  if (!canViewAnalytics(session?.user?.email)) notFound();
  return <AnalyticsView />;
}

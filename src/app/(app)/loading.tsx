import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-group loading UI: paints instantly on every navigation inside the
 * app shell while the target page's queries run on the server. Without this
 * the whole screen freezes on the old page until the new one is fully ready.
 */
export default function AppLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-48" />
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="space-y-2 rounded-lg border bg-card p-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-5/6" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-4/6" />
      </div>
    </div>
  );
}

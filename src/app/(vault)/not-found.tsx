import Link from "next/link";
import { PageContainer } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <PageContainer>
      <div className="mx-auto max-w-md py-10 text-center">
        <h1 className="text-lg font-semibold">Not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">This entry does not exist in your archive.</p>
        <Button asChild className="mt-4">
          <Link href="/">Back to library</Link>
        </Button>
      </div>
    </PageContainer>
  );
}

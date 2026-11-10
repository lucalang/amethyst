import Link from "next/link";
import { Plus } from "lucide-react";
import { CollectionIcon } from "@/components/categories/collection-icon";
import { NewEntryMenu } from "@/components/home/new-entry-menu";
import { Button } from "@/components/ui/button";
import { accentStyle } from "@/lib/collection-identity";
import { collectionPath, type LibraryCategory } from "@/lib/collections";
import { cn } from "@/lib/utils";

/** "New entry": goes straight to the only collection, or asks which one. */
export function NewEntryButton({ collections, className, label = "New entry" }: { collections: LibraryCategory[]; className?: string; label?: string }) {
  if (collections.length === 0) return null;
  if (collections.length === 1) {
    return (
      <Button asChild size="sm" className={cn("h-9 gap-2 px-3", className)}>
        <Link href={`${collectionPath(collections[0])}/new`}>
          <Plus aria-hidden /> {label}
        </Link>
      </Button>
    );
  }
  const targets = collections.map((collection) => ({
    id: collection.id,
    href: `${collectionPath(collection)}/new`,
    name: collection.name,
    accented: Boolean(collection.accent_color),
    style: accentStyle(collection.accent_color),
    icon: <CollectionIcon icon={collection.icon} className="size-full" />,
  }));
  return <NewEntryMenu targets={targets} className={className} label={label} />;
}

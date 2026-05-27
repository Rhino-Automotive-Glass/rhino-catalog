import { redirect } from "next/navigation";

export default function CatalogGroupsPage() {
  redirect("/catalog?tab=vehicle");
}

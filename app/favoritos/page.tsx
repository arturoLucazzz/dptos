import { redirect } from "next/navigation";

/** Favorites moved into the "Favoritos" inversión. */
export default function FavoritosPage() {
  redirect("/inversiones");
}

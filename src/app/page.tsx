import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { listPlaylists } from "@/lib/db/repo";

export default async function Home() {
  await connection();
  redirect(listPlaylists(getDb()).length > 0 ? "/buscar" : "/importar");
}

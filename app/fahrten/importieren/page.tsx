import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import GpxImportForm from "@/components/GpxImportForm";
import Seitenrahmen from "@/components/ui/Seitenrahmen";
import { getCurrentUser } from "@/lib/supabase/server";
import { NICHT_INDEXIEREN } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Fahrten importieren – Strado",
  robots: NICHT_INDEXIEREN,
};

// GPX-Import früherer Fahrten. Anders als /fahrten/neu nur mit Konto: eine
// Gastaufzeichnung lohnt sich, weil man sie unterwegs beginnt und erst am
// Ziel speichert — ein Import hat kein Unterwegs, er wird sofort gespeichert.
export default async function FahrtenImportierenPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/anmelden?next=/fahrten/importieren");

  return (
    <>
      <Header back="/profil" />
      <Seitenrahmen breite="schmal">
        <GpxImportForm />
      </Seitenrahmen>
    </>
  );
}

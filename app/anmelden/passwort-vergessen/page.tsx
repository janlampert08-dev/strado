import Header from "@/components/Header";
import PasswortVergessenForm from "@/components/PasswortVergessenForm";

export const metadata = { title: "Passwort vergessen – Strado" };

export default function PasswortVergessenPage() {
  return (
    <div className="flex h-dvh flex-col">
      <Header back="/anmelden" />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6">
        <PasswortVergessenForm />
      </main>
    </div>
  );
}

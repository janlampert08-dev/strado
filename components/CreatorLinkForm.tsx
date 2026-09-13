"use client";

import { useActionState } from "react";
import { creatorLinkAnlegen, type CreatorLinkResult } from "@/lib/actions/creatorLinks";
import { Input } from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";

const initialState: CreatorLinkResult = { error: null };

// Die Kanäle, die es heute gibt — als datalist und nicht als <select>:
// ein fester Satz bedeutete, dass ein neuer Kanal wieder ein Deploy wäre,
// und genau davon soll diese Seite wegkommen. Die Vorschläge halten
// trotzdem die Schreibweise zusammen, und darauf kommt es an: "TikTok" und
// "tiktok" wären in der Auswertung zwei Kanäle.
const KANAL_VORSCHLAEGE = ["tiktok", "instagram", "youtube", "reddit", "newsletter"];

export default function CreatorLinkForm() {
  const [state, formAction, pending] = useActionState(creatorLinkAnlegen, initialState);

  return (
    <Card className="p-4">
      <form action={formAction} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Code
            <Input
              type="text"
              name="code"
              required
              minLength={2}
              maxLength={32}
              pattern="[a-zA-Z0-9\-]{2,32}"
              placeholder="max"
              autoComplete="off"
            />
            <span className="text-xs font-normal text-muted">
              Steht hinter /c/ — kurz genug, um ihn in einem Video zu sagen.
            </span>
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Name
            <Input
              type="text"
              name="name"
              required
              maxLength={80}
              placeholder="Max Muster"
              autoComplete="off"
            />
            <span className="text-xs font-normal text-muted">
              Nur für dich — steht in keiner Adresse.
            </span>
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Kanal
            <Input
              type="text"
              name="kanal"
              required
              minLength={2}
              maxLength={32}
              list="creator-kanaele"
              placeholder="tiktok"
              autoComplete="off"
            />
            <datalist id="creator-kanaele">
              {KANAL_VORSCHLAEGE.map((kanal) => (
                <option key={kanal} value={kanal} />
              ))}
            </datalist>
            <span className="text-xs font-normal text-muted">Wird zu utm_source.</span>
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Kampagne <span className="font-normal text-muted">(optional)</span>
            <Input
              type="text"
              name="kampagne"
              maxLength={32}
              placeholder="start26"
              autoComplete="off"
            />
            <span className="text-xs font-normal text-muted">
              Wird zu utm_campaign. Mehrere Creator dürfen dieselbe tragen.
            </span>
          </label>
        </div>

        {state.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}

        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Wird angelegt…" : "Link anlegen"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

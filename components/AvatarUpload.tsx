"use client";

import { useActionState } from "react";
import { Pencil } from "@/components/NavIcons";
import { uploadAvatar, type ProfileActionState } from "@/lib/actions/profile";
import Avatar from "@/components/Avatar";

const initialState: ProfileActionState = { error: null };

// Statt Avatar + separatem "Profilbild ändern"-Textlink daneben: ein
// kleines, rundes Stift-Icon, das unten rechts leicht über das Profilbild
// übergreift — gängiges Muster für "Bild bearbeiten" (z. B. iOS-Kontakte),
// braucht keinen eigenen Textlabel neben dem Bild mehr.
export default function AvatarUpload({
  avatarUrl,
  name,
}: {
  avatarUrl: string | null;
  name: string | null;
}) {
  const [state, formAction, pending] = useActionState(uploadAvatar, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <div className="relative inline-block shrink-0">
        <Avatar url={avatarUrl} name={name} size={56} />
        <input
          type="file"
          name="avatar"
          id="avatar-input"
          accept="image/*"
          onChange={(e) => e.target.form?.requestSubmit()}
          className="sr-only"
        />
        <label
          htmlFor="avatar-input"
          title="Profilbild ändern"
          className={`absolute -right-1 -bottom-1 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm transition-colors duration-fast hover:border-border-strong ${
            pending ? "pointer-events-none opacity-50" : ""
          }`}
        >
          <Pencil className="h-3 w-3" aria-hidden="true" />
          <span className="sr-only">{pending ? "Wird hochgeladen…" : "Profilbild ändern"}</span>
        </label>
      </div>
      {state.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}

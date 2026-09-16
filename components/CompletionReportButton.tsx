"use client";

import IconButton from "@/components/ui/IconButton";
import { useState } from "react";
import { Flag } from "lucide-react";
import ReportDialog from "@/components/ReportDialog";
import { reportCompletion } from "@/lib/actions/reports";

// Melde-Knopf auf der Fahrt-Detailseite, für alle ausser dem Fahrer selbst.
// Eine geteilte Fahrt trägt frei gewählten Titel, Notiz und Fotos — bis
// 0046_fahrt_meldungen.sql gab es dafür keinen Meldeweg, obwohl Strecken und
// Kommentare längst einen hatten.
export default function CompletionReportButton({ completionId }: { completionId: string }) {
  const [open, setOpen] = useState(false);
  const action = reportCompletion.bind(null, completionId);

  return (
    <>
      <IconButton
        onClick={() => setOpen(true)}
        ton="gefahr"
        title="Fahrt melden"
        aria-label="Fahrt melden"
      >
        <Flag className="h-5 w-5" aria-hidden="true" />
      </IconButton>
      <ReportDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Fahrt melden"
        action={action}
      />
    </>
  );
}

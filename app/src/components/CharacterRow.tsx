import { useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteCustomPersona } from "wasp/client/operations";
import type { PersonaWithScenario } from "../server/dto";
import { Alert } from "@/components/arc/alert/alert";
import { Button } from "@/components/arc/button/button";
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog";
import { PersonaAvatar } from "@/components/PersonaAvatar";
import { errorMessage } from "@/client/practice";
import { getUserId } from "@/client/userId";

/** A character in a list: start a date with them, and delete them after a confirmation when they can be deleted. */
export function CharacterRow({ persona, starting, disabled, onStart, onDeleted }: {
  persona: PersonaWithScenario;
  starting: boolean;
  disabled: boolean;
  onStart: () => void;
  /** Called after deleting. Leave it out for characters that can't be deleted, such as the default ones. */
  onDeleted?: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      await deleteCustomPersona({ userId: getUserId(), id: persona.id });
      setConfirming(false);
      onDeleted?.();
    } catch (err) {
      setError(errorMessage(err, "Couldn't delete the character."));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <li className="flex items-center gap-3 py-2">
      <PersonaAvatar persona={persona} size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">{persona.name}, {persona.age}</p>
        <p className="truncate text-xs text-faint">{persona.defaultScenario.setting}</p>
      </div>
      <Button size="sm" variant="secondary" onClick={onStart} loading={starting} loadingLabel="Starting…" disabled={disabled}>Date</Button>
      {onDeleted ? (
        <Button size="sm" variant="ghost" aria-label={`Delete ${persona.name}`} onClick={() => setConfirming(true)} disabled={disabled}>
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      ) : (
        // Default characters stay, so their delete button shows but can't be pressed.
        <Button size="sm" variant="ghost" disabled aria-label={`${persona.name} is a default character and can't be deleted`}
          title="Default characters can't be deleted">
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      )}
      <Dialog open={confirming} onOpenChange={(open) => { if (!deleting) setConfirming(open); }}>
        <DialogContent title={`Delete ${persona.name}?`} description="Past dates stay in your history.">
          {error && <Alert tone="danger" title="Couldn't delete">{error}</Alert>}
          <div className="flex justify-end gap-3">
            <Button variant="ghost" disabled={deleting} onClick={() => setConfirming(false)}>Keep {persona.name}</Button>
            <Button variant="danger" loading={deleting} loadingLabel="Deleting…" onClick={() => void remove()}>Delete</Button>
          </div>
        </DialogContent>
      </Dialog>
    </li>
  );
}

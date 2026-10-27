"use client";

import { ModalActions } from "../modal/ModalActions";
import { useState } from "react";
import { Button } from "../button/Button";
import { TextArea } from "../formFields/FormFields";

export const MIN_REASON_LENGTH = 10;
export const MAX_REASON_LENGTH = 500;

/**
 * Confirmation that requires a written reason: lead reassignment, hierarchy
 * transfer, manual override, correction (§9.3, §12.3). The reason ends up in
 * the audit trail, so a single character or whitespace is not accepted.
 *
 * Use as modal content, like DeleteConfirmationForm:
 *   openModal({ title: "Lead neu zuweisen",
 *               children: <ReasonConfirmForm … onCancel={closeModal} /> })
 */
export const ReasonConfirmForm = ({
  message,
  confirmText = "Bestätigen",
  reasonLabel = "Begründung",
  variant = "primary",
  minLength = MIN_REASON_LENGTH,
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmText?: string;
  reasonLabel?: string;
  variant?: "primary" | "decline";
  minLength?: number;
  onConfirm: (reason: string) => Promise<void>;
  onCancel: () => void;
}) => {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState(false);

  const submit = async () => {
    const trimmed = reason.trim();
    if (trimmed.length < minLength) {
      setError(`Bitte mindestens ${minLength} Zeichen angeben.`);
      return;
    }
    setError(undefined);
    setIsLoading(true);
    try {
      await onConfirm(trimmed);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Aktion fehlgeschlagen.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-4 pt-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p className="text-color-text-secondary">{message}</p>
      <TextArea
        label={reasonLabel}
        value={reason}
        onChange={(v) => {
          setReason(v);
          if (error) setError(undefined);
        }}
        maxLength={MAX_REASON_LENGTH}
        isRequired
        error={error}
        hint={`${reason.trim().length}/${MAX_REASON_LENGTH} Zeichen, mindestens ${minLength}`}
      />
      <ModalActions>
        <Button variant="secondary" text="Abbrechen" onClick={onCancel} isDisabled={isLoading} />
        <Button type="submit" variant={variant} text={confirmText} isLoading={isLoading} />
      </ModalActions>
    </form>
  );
};

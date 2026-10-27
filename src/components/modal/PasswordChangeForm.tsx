import { errorText } from "../../utils/dbErrors";
import { ModalActions } from "./ModalActions";
import { useState } from "react";
import { Button } from "../button/Button";
import { PasswordInput } from "../passwordInput/PasswordInput";
import { LockIcon } from "../icons";
import { passwordChangeSchema } from "../../validation/ChangePasswordValidation";
import { Banner } from "../banner/Banner";

interface PasswordChangeFormProps {
  onCancel: () => void;
  onSave: (newPassword: string) => Promise<void>;
}
export const PasswordChangeForm = ({
  onCancel,
  onSave,
}: PasswordChangeFormProps) => {
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);

    const result = passwordChangeSchema.safeParse({
      password,
      repeatPassword,
    });

    if (!result.success) {
      const firstError = result.error.issues[0]?.message;
      setError(firstError);
      return;
    }

    setIsLoading(true);
    try {
      await onSave(result.data.password);
    } catch (err) {
      setError(errorText(err, "Das Passwort konnte nicht geändert werden. Bitte versuchen Sie es erneut."));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="w-full sm:w-70">
        {error && <Banner bannerType="error" title="Passwort nicht geändert" description={error} />}
      </div>
      <PasswordInput
        label="Neues Passwort"
        value={password}
        onChange={setPassword}
      />
      <PasswordInput
        label="Neues Passwort bestätigen"
        value={repeatPassword}
        onChange={setRepeatPassword}
        isRepeated
      />
      <ModalActions>
        <Button variant="secondary" text="Abbrechen" onClick={onCancel} />
        <Button
          text="Änderung bestätigen"
          icon={LockIcon}
          onClick={handleSave}
          isLoading={isLoading}
        />
      </ModalActions>
    </div>
  );
};

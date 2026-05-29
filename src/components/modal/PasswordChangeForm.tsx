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
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An error occurred while changing the password.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 pt-2">
      <div className="w-full sm:w-70">
        {error && <Banner bannerType="error" description="" title={error} />}
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
      <div className="mt-6 flex flex-wrap gap-3 sm:gap-6">
        <Button variant="secondary" text="Abbrechen" onClick={onCancel} />
        <Button
          text="Änderung bestätigen"
          icon={LockIcon}
          onClick={handleSave}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
};

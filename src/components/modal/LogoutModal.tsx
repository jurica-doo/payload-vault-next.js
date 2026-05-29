import { Button } from "../button/Button";

interface LogoutModalFormProps {
  onCancel: () => void;
  onSave: () => void;
}

export const LogoutModalForm = ({ onCancel, onSave }: LogoutModalFormProps) => {
  return (
    <div className="flex flex-col gap-6 pt-2">
      <p className="text-color-text-secondary w-full sm:w-70">
        Möchten Sie sich wirklich abmelden?
      </p>
      <div className="mt-6 flex flex-wrap gap-3 sm:gap-6">
        <Button variant="secondary" text="Abbrechen" onClick={onCancel} />
        <Button text="Abmelden" variant="decline" onClick={onSave} />
      </div>
    </div>
  );
};

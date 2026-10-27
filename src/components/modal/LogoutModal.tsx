import { ModalActions } from "./ModalActions";
import { Button } from "../button/Button";

interface LogoutModalFormProps {
  onCancel: () => void;
  onSave: () => void;
}

export const LogoutModalForm = ({ onCancel, onSave }: LogoutModalFormProps) => {
  return (
    <div className="flex flex-col gap-5">
      <p className="text-color-text-secondary w-full sm:w-70">
        Möchten Sie sich wirklich abmelden?
      </p>
      <ModalActions>
        <Button variant="secondary" text="Abbrechen" onClick={onCancel} />
        <Button text="Abmelden" variant="decline" onClick={onSave} />
      </ModalActions>
    </div>
  );
};

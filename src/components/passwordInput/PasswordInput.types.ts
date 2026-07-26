type PasswordInputProps = {
  value: string;
  onChange: (password: string) => void;
  label?: string;
  error?: string;
  isRequired?: boolean;
  isRepeated?: boolean;
  name?: string;
  /** "current-password" (login) or "new-password" (signup/reset). */
  autoComplete?: string;
};

export type { PasswordInputProps };

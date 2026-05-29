type PasswordInputProps = {
  value: string;
  onChange: (password: string) => void;
  label?: string;
  error?: string;
  isRequired?: boolean;
  isRepeated?: boolean;
};

export type { PasswordInputProps };

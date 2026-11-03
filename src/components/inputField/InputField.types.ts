type InputFieldPosition = "left" | "right" | "full";
type InputType = "text" | "email" | "number";

type InputFieldProps = {
  label: string;
  placeholder: string;
  position?: InputFieldPosition;
  error?: string;
  type?: InputType;
  isReadOnly?: boolean;
  value: string;
  onChange: (value: string) => void;
  isRequired?: boolean;
  name?: string;
  autoComplete?: string;
  /** E.g. to validate when the user leaves the field instead of on every keystroke. */
  onBlur?: () => void;
};

export type { InputFieldProps, InputFieldPosition, InputType };

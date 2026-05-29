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
};

export type { InputFieldProps, InputFieldPosition, InputType };

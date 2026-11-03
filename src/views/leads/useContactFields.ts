"use client";

import { useState } from "react";
import { normalizeEmail, normalizePhone } from "../../domain/normalize";

type Field = "phone" | "email";

/**
 * Phone and e-mail of a lead form: normalised values plus errors that show
 * once the user left the field or tried to save, not on every keystroke
 * (P4-UX-13). Shared by "Lead anlegen" and "Lead bearbeiten".
 */
export function useContactFields(phoneText: string, emailText: string) {
  const [touched, setTouched] = useState<Record<Field, boolean>>({ phone: false, email: false });
  const phone = phoneText.trim() ? normalizePhone(phoneText) : null;
  const email = emailText.trim() ? normalizeEmail(emailText) : null;
  const phoneInvalid = Boolean(phoneText.trim()) && !phone;
  const emailInvalid = Boolean(emailText.trim()) && !email;
  return {
    phone,
    email,
    invalid: phoneInvalid || emailInvalid,
    phoneError: touched.phone && phoneInvalid ? "Ungültige Telefonnummer (z. B. 0170 1234567)" : undefined,
    emailError: touched.email && emailInvalid ? "Ungültige E-Mail-Adresse" : undefined,
    touch: (field: Field) => () => setTouched((t) => ({ ...t, [field]: true })),
    touchAll: () => setTouched({ phone: true, email: true }),
  };
}

import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "E-Mail-Adresse ist erforderlich")
    .email("Bitte geben Sie eine gültige E-Mail-Adresse ein"),

  password: z.string().min(1, "Passwort ist erforderlich"),
});

export type LoginSchema = z.infer<typeof loginSchema>;

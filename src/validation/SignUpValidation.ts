import { z } from "zod";

// Test-phase allowlist. Missing/empty env must NOT crash the build (this
// module is evaluated while prerendering /signup) — with no list configured,
// the allowlist check is skipped.
const allowedEmails = (process.env.NEXT_PUBLIC_ALLOWED_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const signUpSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email("Bitte geben Sie eine gültige E-Mail-Adresse ein")
      .refine(
        (email) =>
          allowedEmails.length === 0 ||
          allowedEmails.includes(email.toLowerCase()),
        {
          message:
            "Diese E-Mail-Adresse ist nicht für die Testphase freigegeben.",
        },
      ),

    password: z
      .string()
      .min(1, "Passwort ist erforderlich")
      .min(8, "Passwort muss mindestens 8 Zeichen lang sein")
      .regex(/[A-Z]/, "Passwort muss mindestens einen Großbuchstaben enthalten")
      .regex(
        /[^A-Za-z0-9]/,
        "Passwort muss mindestens ein Sonderzeichen enthalten",
      ),

    repeatedPassword: z.string().min(1, "Bitte wiederholen Sie Ihr Passwort"),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.repeatedPassword) {
      ctx.addIssue({
        path: ["repeatedPassword"],
        code: z.ZodIssueCode.custom,
        message: "Passwörter stimmen nicht überein",
      });
    }
  });

export type SignUpSchema = z.infer<typeof signUpSchema>;

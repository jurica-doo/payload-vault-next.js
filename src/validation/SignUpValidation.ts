import { z } from "zod";

// Test-phase allowlist — UX ONLY, NOT a security control.
//
// This runs in the browser and NEXT_PUBLIC_ALLOWED_EMAILS is compiled into the
// client bundle, so anyone can read it and nobody has to run it: the Supabase
// anon key is public too, so a signup can be POSTed straight to
// /auth/v1/signup without ever loading this file. Its only job is to give a
// clear, immediate message to someone typing an address into the form.
//
// Enforcement lives in the database, on the INSERT path every signup route
// must cross — see the BEFORE INSERT trigger on auth.users in
// supabase/migrations/20260907120000_enforce_signup_allowlist.sql. Keep the
// two lists in sync when inviting someone; if they drift, the database wins
// and the form message is merely less specific.
//
// Missing/empty env must NOT crash the build (this module is evaluated while
// prerendering /signup) — with no list configured, this hint is skipped and
// the database still decides.
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

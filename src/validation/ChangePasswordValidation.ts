import { z } from "zod";

const strongPassword = z
  .string()
  .min(8, "Passwort muss mindestens 8 Zeichen lang sein")
  .regex(/[A-Z]/, "Passwort muss mindestens einen Großbuchstaben enthalten")
  .regex(
    /[^A-Za-z0-9]/,
    "Passwort muss mindestens ein Sonderzeichen enthalten",
  );

export const passwordChangeSchema = z
  .object({
    password: z
      .string()
      .min(1, "Passwort ist erforderlich")
      .pipe(strongPassword),

    repeatPassword: z.string().min(1, "Bitte wiederholen Sie Ihr Passwort"),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.repeatPassword) {
      ctx.addIssue({
        path: ["repeatPassword"],
        code: z.ZodIssueCode.custom,
        message: "Passwörter stimmen nicht überein",
      });
    }
  });

export type PasswordChangeSchema = z.infer<typeof passwordChangeSchema>;

import { z } from "zod";
import { normalizeEmail, normalizePhone } from "../domain/normalize";

/**
 * Admin form for a new employee. Mirrors the CHECK constraints on
 * public.employees so most mistakes are caught before the round trip; the
 * database stays the authority.
 */
export const employeeSchema = z.object({
  firstName: z.string().trim().min(1, "Bitte Vornamen angeben").max(100, "Höchstens 100 Zeichen"),
  lastName: z.string().trim().min(1, "Bitte Nachnamen angeben").max(100, "Höchstens 100 Zeichen"),
  email: z
    .string()
    .transform((v, ctx) => {
      const email = normalizeEmail(v);
      if (!email) {
        ctx.addIssue({ code: "custom", message: "Bitte eine gültige E-Mail-Adresse angeben" });
        return z.NEVER;
      }
      return email;
    }),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Bitte ein Startdatum wählen")
    .refine((v) => v >= "2000-01-01", "Startdatum ist zu weit in der Vergangenheit"),
  employmentType: z.enum(["full_time", "part_time"]),
  phone: z.string().transform((v, ctx) => {
    if (v.trim() === "") return null;
    const phone = normalizePhone(v);
    if (!phone) {
      ctx.addIssue({ code: "custom", message: "Bitte eine gültige Telefonnummer angeben, z. B. 0170 1234567" });
      return z.NEVER;
    }
    return phone;
  }),
});

export type EmployeeFormInput = z.input<typeof employeeSchema>;

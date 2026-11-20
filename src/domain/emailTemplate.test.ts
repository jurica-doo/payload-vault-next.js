import { describe, expect, it } from "vitest";
import { SAMPLE_VALUES, checkTemplateText, renderFooter, renderTemplate, salutationLine, sampleUnsubscribeUrl } from "./emailTemplate";

describe("renderTemplate (golden cases shared with supabase/tests/240_email_templates.test.sql)", () => {
  it("GC-MERGE-001 subject merge", () => {
    expect(renderTemplate("Alles Gute, {{rufname}}!", "Text", { rufname: "Erika" }).subject).toBe("Alles Gute, Erika!");
  });
  it("GC-MERGE-002 HTML is escaped, plain text stays as written", () => {
    const r = renderTemplate("S", "Hallo {{vorname}} <b>", { vorname: "<script>" });
    expect(r.html).toBe("<p>Hallo &lt;script&gt; &lt;b&gt;</p>");
    expect(r.text).toBe("Hallo <script> <b>");
  });
  it("GC-MERGE-003 missing values are reported", () => {
    expect(renderTemplate("S", "Liebe {{vorname}}, {{jahr}}", { jahr: "2026" }).missing).toEqual(["vorname"]);
  });
  it("GC-MERGE-004 no line breaks in the subject", () => {
    expect(renderTemplate("Hi {{name}}", "Text", { name: "A\r\nBcc: x" }).subject).toBe("Hi A Bcc: x");
  });
  it("GC-MERGE-005 paragraphs and line breaks", () => {
    expect(renderTemplate("S", "A\n\nB\nC", {}).html).toBe("<p>A</p><p>B<br>C</p>");
  });
  it("GC-MERGE-006 spaces inside braces", () => {
    expect(renderTemplate("S", "Hallo {{ vorname }}", { vorname: "Max" }).text).toBe("Hallo Max");
  });
  it("GC-MERGE-007 special characters in values are literal", () => {
    expect(renderTemplate("S", "Pfad {{vorname}}", { vorname: "C:\\1 & $x" }).text).toBe("Pfad C:\\1 & $x");
  });
});

describe("checkTemplateText", () => {
  it("whitelist and well-formed placeholders", () => {
    expect(checkTemplateText("Hallo {{vorname}}")).toBeNull();
    expect(checkTemplateText("Hallo {{iban}}")).toEqual({ kind: "unknown_merge_field", field: "iban" });
    expect(checkTemplateText("Hallo {{vorname")).toEqual({ kind: "invalid_template" });
  });
});

describe("salutation, footer and unsubscribe link (mirror of migration 20261101180000)", () => {
  it("builds the salutation lines like app_private.salutation_line", () => {
    expect(salutationLine("frau", "Sabine", "Kowalski", false)).toBe("Liebe Frau Kowalski");
    expect(salutationLine("herr", "Jan", "Weber", true)).toBe("Sehr geehrter Herr Weber");
    expect(salutationLine("divers", "Kim", "Lang", false)).toBe("Guten Tag Kim Lang");
    expect(salutationLine("frau", "Kim", null, false)).toBe("Guten Tag Kim");
  });

  it("renders the footer with signature, mandatory details and an escaped unsubscribe link", () => {
    const sender = { company: "Profina Deutschland GmbH", address: "Castroper Straße 270–280, 44791 Bochum", register: "Amtsgericht Bochum HRB 0000",
      management: "Erika Muster", contact_email: "kontakt@profina.example", app_url: "https://app.profina.example/" };
    const url = sampleUnsubscribeUrl(sender, "birthday");
    expect(url).toBe("https://app.profina.example/abmelden?t=00000000-0000-0000-0000-000000000000&z=birthday_email");
    const f = renderFooter(sender, SAMPLE_VALUES, url);
    expect(f.text).toContain("Ihr Ansprechpartner: Max Berater · +49 170 0000000 · max.berater@profina.example");
    expect(f.text).toContain("Amtsgericht Bochum HRB 0000 · Geschäftsführung: Erika Muster · kontakt@profina.example");
    expect(f.html).toContain('<a href="https://app.profina.example/abmelden?t=00000000-0000-0000-0000-000000000000&amp;z=birthday_email">Hier abmelden</a>');
  });

  it("accepts the salutation placeholders in templates", () => {
    expect(checkTemplateText("{{briefanrede}},\n\nherzlichen Glückwunsch!")).toBeNull();
    expect(renderTemplate("Hallo", "{{briefanrede_formell}},", SAMPLE_VALUES).text).toBe("Sehr geehrte Frau Mustermann,");
  });
});

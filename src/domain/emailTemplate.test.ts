import { describe, expect, it } from "vitest";
import { checkTemplateText, renderTemplate } from "./emailTemplate";

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

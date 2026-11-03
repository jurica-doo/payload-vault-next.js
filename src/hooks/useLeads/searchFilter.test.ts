import { describe, expect, it } from "vitest";
import { leadSearchFilter } from "./useLeads";
import { customerSearchFilter } from "../useCustomers/useCustomers";

describe("search filters", () => {
  it("P4-R2-05 '_' is searched literally, not as a wildcard", () => {
    expect(leadSearchFilter("a_b")).toContain("search_name.ilike.*a\\_b*");
    expect(customerSearchFilter("a_b")).toContain("email.ilike.*a\\_b*");
  });
  it("PostgREST syntax characters are dropped", () => {
    expect(leadSearchFilter("(x),*%")).toBe("search_name.ilike.*x*");
    expect(leadSearchFilter("%")).toBeNull();
  });
  it("numbers search the record number and the phone", () => {
    expect(leadSearchFilter("L-00012")).toContain("lead_no.eq.12");
    expect(customerSearchFilter("0171 23")).toContain("phone.ilike.*\\+4917123*");
  });
});

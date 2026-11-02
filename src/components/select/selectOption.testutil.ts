import { fireEvent, screen } from "@testing-library/react";

/** Test helper: opens the <Select>/<Dropdown> named `field` and picks `option`, like a user. */
export function selectOption(field: string | RegExp, option: string | RegExp) {
  fireEvent.click(screen.getByRole("combobox", { name: field }));
  fireEvent.click(screen.getByRole("option", { name: option }));
}

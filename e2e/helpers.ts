import { expect, type Page } from "@playwright/test";

export async function enterGuestMode(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Probar sin cuenta (modo invitado)" }).click();
  await expect(page.getByText("Estás explorando datos demo.")).toBeVisible();
}

// The IA tab button's accessible name gains a " — novedad disponible" suffix until it's been
// visited once (see the tab-new-dot badge in App.tsx) — match by prefix so this survives that.
export function tabButton(page: Page, label: string) {
  return page.getByRole("button", { name: new RegExp(`^${label}\\b`) });
}

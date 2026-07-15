import { test, expect, type Page } from "@playwright/test";

/**
 * Foundational E2E smoke test. Uses guest mode (no Supabase credentials needed) so this can run
 * anywhere, including CI, without secrets. Keep this file the "does the app still boot and every
 * tab still render" safety net — put deeper, feature-specific tests in their own files.
 */

async function enterGuestMode(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Probar sin cuenta (modo invitado)" }).click();
  await expect(page.getByText("Estás explorando datos demo.")).toBeVisible();
}

// The IA tab button's accessible name gains a " — novedad disponible" suffix until it's been
// visited once (see the tab-new-dot badge in App.tsx) — match by prefix so this survives that.
function tabButton(page: Page, label: string) {
  return page.getByRole("button", { name: new RegExp(`^${label}\\b`) });
}

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) => {
    throw new Error(`Uncaught page error: ${error.message}`);
  });
});

test("guest mode loads demo data without an account", async ({ page }) => {
  await enterGuestMode(page);
  await expect(page.getByRole("heading", { name: "Alba" })).toBeVisible();
});

test("every tab renders without a crash", async ({ page }) => {
  await enterGuestMode(page);

  const tabs: Array<{ label: string; expectHeading: string | RegExp }> = [
    { label: "Hoy", expectHeading: "Registro del día" },
    { label: "Calendario", expectHeading: "Calendario" },
    { label: "Temperatura", expectHeading: "Tus temperaturas recientes" },
    { label: "Mapa", expectHeading: /Lectura del día|Resumen del ciclo/ },
    { label: "IA", expectHeading: /Noche|Luna|Mandarino|Frac/ },
    { label: "Ajustes", expectHeading: "Ajustes" },
  ];

  for (const tab of tabs) {
    await tabButton(page, tab.label).click();
    await expect(page.getByRole("heading", { name: tab.expectHeading }).first()).toBeVisible();
  }
});

test("IA tab: chat input and mascot picker are present", async ({ page }) => {
  await enterGuestMode(page);
  await tabButton(page, "IA").click();

  // Network-dependent behavior (the greeting, tool calls) needs a configured provider key and is
  // intentionally NOT asserted here — this test only verifies the chat UI itself is intact.
  await expect(page.getByPlaceholder(/Escríbele a/)).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "Elige tu mascota" })).toBeVisible();
});

test("streak card opens the rewards modal", async ({ page }) => {
  await enterGuestMode(page);
  await page.getByRole("button", { name: /Rachas, toca para ver premios/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Premios de la racha" })).toBeVisible();
});

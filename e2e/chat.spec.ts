import { test, expect } from "@playwright/test";
import { enterGuestMode, tabButton } from "./helpers";

/**
 * These tests hit the real /api/chat endpoint (through whichever provider key is configured for
 * the dev server), so they need at least one of GEMINI_API_KEY / NVIDIA_API_KEY / OPENAI_API_KEY
 * available where `pnpm exec vite` runs. If none are configured, the app itself surfaces a "Falta
 * configurar la clave de X" error banner instead of crashing — we detect that and skip cleanly
 * rather than failing, so this suite stays runnable (just less useful) in an environment with no
 * AI keys, e.g. a fresh CI box.
 */

const AI_TIMEOUT = 45_000;

async function openFreshChat(page: import("@playwright/test").Page) {
  await enterGuestMode(page);
  await tabButton(page, "IA").click();
  // The auto-greeting may already be streaming from the tab mount; clear it for a clean,
  // deterministic starting point instead of racing it.
  await page.getByRole("button", { name: "Nueva conversación" }).click();
  await expect(page.locator(".ai-chat-empty")).toBeVisible();
}

// A tool-call round trip is send → (maybe several) tool-call rounds → final answer; the input
// only re-enables once the whole loop is done, which is a more reliable "are we done" signal than
// "an assistant bubble exists" (an in-progress bubble can be empty/partial mid-loop). Any error
// banner at that point — missing key, or a transient upstream failure (rate limit, provider 5xx) —
// means there's nothing meaningful left to assert about the *reply*, so skip rather than fail: this
// suite is testing our code's round trip, not a third-party API's uptime.
async function waitForReplyToFinish(page: import("@playwright/test").Page) {
  const input = page.getByPlaceholder(/Escríbele a/);
  await expect(input).toBeEnabled({ timeout: AI_TIMEOUT });

  const errorBanner = page.locator(".ai-chat-error");
  if (await errorBanner.isVisible().catch(() => false)) {
    const text = await errorBanner.textContent();
    test.skip(true, `AI reply failed (provider/key issue, not necessarily an app bug): ${text}`);
  }
  return input;
}

test.describe("AI chat send + tool-call flow", () => {
  // The per-test default (30s) is shorter than AI_TIMEOUT above, so a slow-but-not-erroring
  // upstream response could blow the outer test timeout before the inner wait ever gets to decide
  // pass/skip/fail. Give these tests enough room for AI_TIMEOUT to actually be the deciding clock.
  test.describe.configure({ timeout: 60_000 });

  test("sending a question the model must ground in real data returns an answer", async ({ page }) => {
    await openFreshChat(page);

    const input = page.getByPlaceholder(/Escríbele a/);
    await input.fill("¿Cuál es mi racha actual y cuántos días es la más larga?");
    await page.getByRole("button", { name: "Enviar" }).click();

    // User bubble appears immediately, no network wait needed.
    await expect(page.locator(".ai-chat-bubble-user")).toHaveText(/racha actual/);

    await waitForReplyToFinish(page);

    // The model has to call get_streak_and_rewards to answer this at all — if the final bubble
    // comes back with a plausible number, the whole round trip (send → tool call → tool result →
    // final answer) worked, not just "the network call succeeded."
    const assistantBubble = page.locator(".ai-chat-bubble-assistant").last();
    await expect(assistantBubble).not.toHaveText("");
    await expect(assistantBubble).toContainText(/\d/);
    await expect(page.locator(".ai-chat-error")).toHaveCount(0);
  });

  test("follow-up suggestion chips update after a reply", async ({ page }) => {
    await openFreshChat(page);

    const input = page.getByPlaceholder(/Escríbele a/);
    await input.fill("Cuéntame algo curioso sobre mi ciclo");
    await page.getByRole("button", { name: "Enviar" }).click();
    await waitForReplyToFinish(page);

    // The static preset chips ("Resumen de este ciclo", etc.) should have been replaced by the
    // model's own <!--suggestions: ...--> follow-ups once a reply with suggestions lands.
    await expect(page.getByRole("button", { name: "Resumen de este ciclo" })).toHaveCount(0);
    await expect(page.locator(".ai-chat-chip")).not.toHaveCount(0);
  });
});

test.describe("AI chat mascot + conversation controls", () => {
  test("switching mascots updates identity and that mascot's own tone", async ({ page }) => {
    await enterGuestMode(page);
    await tabButton(page, "IA").click();

    await expect(page.getByRole("heading", { name: "Noche" })).toBeVisible();

    await page.getByRole("radio", { name: "Mandarino" }).click();
    await expect(page.getByRole("heading", { name: "Mandarino" })).toBeVisible();
    await expect(page.getByLabel("Tono de Mandarino")).toHaveValue("alegre");

    await page.getByRole("radio", { name: "Luna" }).click();
    await expect(page.getByRole("heading", { name: "Luna" })).toBeVisible();
    await expect(page.getByLabel("Tono de Luna")).toHaveValue("tecnico");
  });

  test("Nueva conversación clears the chat back to the empty state", async ({ page }) => {
    await enterGuestMode(page);
    await tabButton(page, "IA").click();

    await page.getByRole("button", { name: "Nueva conversación" }).click();
    await expect(page.locator(".ai-chat-empty")).toBeVisible();
    await expect(page.locator(".ai-chat-bubble")).toHaveCount(0);
  });
});

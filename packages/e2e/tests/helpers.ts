import { expect, type Browser, type Page } from "@playwright/test";

/** Opens a fresh context so each participant gets its own sessionStorage. */
export async function newParticipant(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

/** Hosts a game and returns the room code. */
export async function hostGame(
  page: Page,
  name = "Quizmaster",
): Promise<string> {
  await page.goto("/");
  await page.getByRole("button", { name: "Host a game" }).click();
  await page.getByPlaceholder("Enter your name").fill(name);
  await page.getByRole("button", { name: "Create room" }).click();

  const code = page.getByTestId("room-code");
  await expect(code).toBeVisible();
  const text = (await code.textContent())?.trim() ?? "";
  expect(text).toMatch(/^[A-Z0-9]{6}$/);
  return text;
}

/** Joins an existing game by typing the code. */
export async function joinGame(
  page: Page,
  roomCode: string,
  name: string,
): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Join a game" }).click();
  await page.getByPlaceholder("Enter your name").fill(name);
  await page.getByPlaceholder("6-letter code").fill(roomCode);
  await page.getByRole("button", { name: "Join room" }).click();
  await expect(page.getByTestId("my-score")).toBeVisible();
}

/** Opens a buzz round in the given mode. */
export async function openRound(
  hostPage: Page,
  mode: "Button" | "Slide" | "Pattern" = "Button",
): Promise<void> {
  await hostPage
    .getByRole("button", { name: new RegExp(mode, "i") })
    .first()
    .click();
  await hostPage.getByRole("button", { name: "Open buzz" }).click();
  await expect(
    hostPage.getByRole("button", { name: "Close buzz window" }),
  ).toBeVisible();
}

import { expect, test } from "@playwright/test";
import { hostGame, joinGame, newParticipant } from "./helpers.js";

test("a stale session lands on the landing screen without an error", async ({
  browser,
}) => {
  // A tab holding a session for a room that has since ended. The player never
  // typed that code, so there is nothing for them to act on -- they should
  // just be put back at the start.
  const page = await newParticipant(browser);

  await page.goto("/");
  await page.evaluate(() =>
    sessionStorage.setItem(
      "buzzroom-session",
      JSON.stringify({
        playerId: "00000000-0000-4000-8000-000000000000",
        roomCode: "ZZZZZZ",
      }),
    ),
  );
  await page.reload();

  await expect(page.getByRole("button", { name: "Host a game" })).toBeVisible();
  await expect(page.getByText(/no longer available/i)).toHaveCount(0);
  expect(
    await page.evaluate(() => sessionStorage.getItem("buzzroom-session")),
  ).toBeNull();
});

test("a player who reloads keeps their seat and their score", async ({
  browser,
}) => {
  const host = await newParticipant(browser);
  const player = await newParticipant(browser);

  const code = await hostGame(host);
  await joinGame(player, code, "Alice");

  // Award a point so there is state worth preserving. The option label
  // carries the running score, so match on value rather than exact text.
  await host.getByRole("button", { name: "Scores" }).click();
  const select = host.getByRole("combobox");
  const aliceId = await select
    .locator("option", { hasText: "Alice" })
    .getAttribute("value");
  await select.selectOption(aliceId!);
  await host.getByRole("button", { name: "Award" }).click();
  await expect(player.getByTestId("my-score")).toHaveText("1");

  await player.reload();

  await expect(player.getByTestId("my-score")).toHaveText("1");
  await expect(player.getByText("Alice")).toBeVisible();
});

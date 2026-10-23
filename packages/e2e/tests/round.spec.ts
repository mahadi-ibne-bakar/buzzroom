import { expect, type Page, test } from "@playwright/test";
import { hostGame, joinGame, newParticipant, openRound } from "./helpers.js";

// "BUZZ" has to be exact: the player screen also has a "Buzzer" tab.
const buzzer = (page: Page) =>
  page.getByRole("button", { name: "BUZZ", exact: true });
const markCorrect = (page: Page) =>
  page.getByRole("button", { name: "✓", exact: true });
const markWrong = (page: Page) =>
  page.getByRole("button", { name: "✗", exact: true });

test("a full round: open, buzz, mark correct, score updates", async ({
  browser,
}) => {
  const host = await newParticipant(browser);
  const player = await newParticipant(browser);

  const code = await hostGame(host);
  await joinGame(player, code, "Alice");

  await openRound(host);

  await expect(buzzer(player)).toBeEnabled();
  await buzzer(player).click();

  // The player holds rank 1 and the host sees them in the queue.
  await expect(
    player.getByTestId("buzz-order").getByRole("listitem").first(),
  ).toContainText("#1");
  await expect(host.getByTestId("buzz-order")).toContainText("Alice");

  await markCorrect(host).click();

  await expect(player.getByTestId("my-score")).toHaveText("1");
});

test("a wrong answer passes the turn to the next player", async ({
  browser,
}) => {
  const host = await newParticipant(browser);
  const alice = await newParticipant(browser);
  const bob = await newParticipant(browser);

  const code = await hostGame(host);
  await joinGame(alice, code, "Alice");
  await joinGame(bob, code, "Bob");

  await openRound(host);

  await buzzer(alice).click();
  await expect(host.getByTestId("buzz-order")).toContainText("Alice");
  await buzzer(bob).click();
  await expect(host.getByTestId("buzz-order")).toContainText("Bob");

  await markWrong(host).click();

  // Alice is eliminated, so the turn and the award go to Bob.
  await markCorrect(host).click();
  await expect(bob.getByTestId("my-score")).toHaveText("1");
  await expect(alice.getByTestId("my-score")).toHaveText("0");
});

test("the presenter view follows the round live", async ({ browser }) => {
  const host = await newParticipant(browser);
  const player = await newParticipant(browser);
  const presenter = await newParticipant(browser);

  const code = await hostGame(host);
  await joinGame(player, code, "Alice");

  await presenter.goto(`/?present=${code}`);
  await expect(presenter.getByText(code, { exact: true })).toBeVisible();

  await openRound(host);
  await buzzer(player).click();
  await expect(presenter.getByTestId("presenter-buzz-order")).toContainText(
    "Alice",
  );

  await markCorrect(host).click();
  await expect(presenter.getByText(/CORRECT/i)).toBeVisible();
});

test("a player cannot buzz twice in one round", async ({ browser }) => {
  const host = await newParticipant(browser);
  const player = await newParticipant(browser);

  const code = await hostGame(host);
  await joinGame(player, code, "Alice");
  await openRound(host);

  await buzzer(player).click();
  await expect(player.getByTestId("buzz-order")).toContainText("Alice");

  // The buzzer is spent for this round: it shows the rank now, not "BUZZ".
  await expect(buzzer(player)).toHaveCount(0);
});

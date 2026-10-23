import { expect, test } from "@playwright/test";
import { hostGame, joinGame, newParticipant } from "./helpers.js";

test("a host creates a room and a player joins it", async ({ browser }) => {
  const host = await newParticipant(browser);
  const player = await newParticipant(browser);

  const code = await hostGame(host);
  await joinGame(player, code, "Alice");

  await expect(host.getByText("Alice")).toBeVisible();
  await expect(host.getByText("2 players")).toBeVisible();
});

test("a scan link pre-fills the join form", async ({ browser }) => {
  // The host's QR encodes /?room=CODE so a phone's camera opens the app with
  // the room already chosen. Nothing but an end-to-end check sees this wiring.
  const host = await newParticipant(browser);
  const player = await newParticipant(browser);

  const code = await hostGame(host);
  await player.goto(`/?room=${code}`);

  await expect(player.getByPlaceholder("6-letter code")).toHaveValue(code);
  await expect(
    player.getByRole("heading", { name: "Join a game" }),
  ).toBeVisible();

  await player.getByPlaceholder("Enter your name").fill("Alice");
  await player.getByRole("button", { name: "Join room" }).click();
  await expect(player.getByTestId("my-score")).toBeVisible();
});

test("a mistyped code reports the error and releases the button", async ({
  browser,
}) => {
  // Regression: `busy` was never cleared on a rejected join, so the form sat
  // disabled on "Connecting…" until a page reload.
  const player = await newParticipant(browser);

  await player.goto("/");
  await player.getByRole("button", { name: "Join a game" }).click();
  await player.getByPlaceholder("Enter your name").fill("Alice");
  await player.getByPlaceholder("6-letter code").fill("ZZZZZZ");
  await player.getByRole("button", { name: "Join room" }).click();

  await expect(player.getByText(/No room found with code/i)).toBeVisible();
  await expect(player.getByRole("button", { name: "Join room" })).toBeEnabled();
});

test("hosting works on a socket that is already connected", async ({
  browser,
}) => {
  // Regression, and the subtler of the two: GameProvider connects on mount to
  // attempt a session restore, so by submission time the socket is often
  // already open -- and "connect" never fires again for an open socket, so a
  // once("connect") emit never ran. Planting a stale session is what forces
  // that early connect.
  const host = await newParticipant(browser);

  await host.goto("/");
  await host.evaluate(() =>
    sessionStorage.setItem(
      "buzzroom-session",
      JSON.stringify({
        playerId: "00000000-0000-4000-8000-000000000000",
        roomCode: "ZZZZZZ",
      }),
    ),
  );
  await host.reload();
  await expect(host.getByRole("button", { name: "Host a game" })).toBeVisible();

  await host.getByRole("button", { name: "Host a game" }).click();
  await host.getByPlaceholder("Enter your name").fill("Quizmaster");
  await host.getByRole("button", { name: "Create room" }).click();

  await expect(host.getByTestId("room-code")).toBeVisible();
});

test("a duplicate name is refused", async ({ browser }) => {
  const host = await newParticipant(browser);
  const alice = await newParticipant(browser);
  const impostor = await newParticipant(browser);

  const code = await hostGame(host);
  await joinGame(alice, code, "Alice");

  await impostor.goto("/");
  await impostor.getByRole("button", { name: "Join a game" }).click();
  await impostor.getByPlaceholder("Enter your name").fill("Alice");
  await impostor.getByPlaceholder("6-letter code").fill(code);
  await impostor.getByRole("button", { name: "Join room" }).click();

  await expect(impostor.getByText(/already taken/i)).toBeVisible();
});

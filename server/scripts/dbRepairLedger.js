// Brings the room-night ledger in line with the reservations: adds nights
// that active reservations should hold and removes nights of reservations
// that no longer hold a room. Reservations themselves are not changed.
//
//   npm run db:repair-ledger -- --confirm=<database name>

const { runConfirmed } = require("./dbCommand");
const { checkRoomNights } = require("../services/dbSafety");
const { syncRoomNights } = require("../services/availability");

runConfirmed("Repair the room-night ledger", async () => {
  const before = await checkRoomNights();
  console.log("Before:", before);

  if (before.missingNights === 0 && before.staleNights === 0) {
    console.log("The ledger already matches the reservations. Nothing to do.");
    return;
  }

  const result = await syncRoomNights();
  console.log("After:", await checkRoomNights());
  if (result.conflicts.length > 0) {
    console.log(`${result.conflicts.length} reservation(s) overlap an earlier one and need a person to move or cancel them.`);
  }
});

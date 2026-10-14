// Builds the indexes the models declare but the database does not have yet.
// Existing indexes and documents are left alone; nothing is dropped.
//
//   npm run db:indexes -- --confirm=<database name>

const mongoose = require("mongoose");

const { runConfirmed } = require("./dbCommand");
const { missingIndexes } = require("../services/dbSafety");

runConfirmed("Build missing indexes", async () => {
  const before = await missingIndexes();
  if (before.length === 0) {
    console.log("All declared indexes already exist. Nothing to do.");
    return;
  }

  console.log("Missing:", before.join("; "));
  for (const model of Object.values(mongoose.models)) {
    await model.createCollection().catch(() => {});
    await model.createIndexes();
  }

  const after = await missingIndexes();
  console.log(after.length === 0 ? "Done. Every declared index now exists." : `Still missing: ${after.join("; ")}`);
  if (after.length > 0) process.exitCode = 1;
});

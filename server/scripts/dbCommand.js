// Shared start for commands that deliberately change the database. They print
// the database they are connected to and do nothing unless that exact name
// was confirmed on the command line:
//
//   npm run db:indexes -- --confirm=luxurystay
//
// The connection string and credentials are never printed.

const mongoose = require("mongoose");

const { env, validateEnv } = require("../config/env");

const confirmedName = () => {
  const flag = process.argv.find((arg) => arg.startsWith("--confirm="));
  return flag ? flag.slice("--confirm=".length) : "";
};

const runConfirmed = async (title, work) => {
  const { errors } = validateEnv();
  if (errors.length > 0) {
    errors.forEach((message) => console.error(message));
    process.exitCode = 1;
    return;
  }

  // The app's models, so the command sees exactly what the server declares.
  require("../app").createApp();

  await mongoose.connect(env.MONGO_URI, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 8000 });
  const name = mongoose.connection.db.databaseName;

  try {
    console.log(`${title}`);
    console.log(`Connected database: ${name}`);

    if (confirmedName() !== name) {
      console.error(`Nothing was changed. To run this against "${name}", repeat the command with --confirm=${name}`);
      process.exitCode = 1;
      return;
    }

    await work(name);
  } catch (error) {
    console.error(`${title} failed:`, error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
};

module.exports = { runConfirmed };

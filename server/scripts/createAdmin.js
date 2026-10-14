// Creates an administrator account.
//
//   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a strong password' npm run create-admin
//
// The password is read from the environment so it is never stored in source
// control, and it is never printed. An existing account is never changed.
//
// Database guard: the script prints the database it is connected to and
// refuses to write unless EXPECTED_DB_NAME is set and matches it exactly.
// The production database ("luxurystay") and the test database
// ("luxurystay_test", which the tests wipe) are always refused.

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const { env, validateEnv } = require("../config/env");
const User = require("../models/User");
const { email, password, accountName } = require("../utils/schemas");
const { databaseInUri, refusalFor } = require("./writeGuard");

const refuse = (reason) => {
  console.error(`Refused: ${reason} No account was created or changed.`);
  process.exitCode = 1;
};

const createAdmin = async () => {
  const { errors } = validateEnv();
  if (errors.length > 0) {
    errors.forEach((message) => console.error(message));
    process.exitCode = 1;
    return;
  }

  const parsedEmail = email.safeParse(process.env.ADMIN_EMAIL);
  const parsedPassword = password.safeParse(process.env.ADMIN_PASSWORD);
  const parsedName = accountName.safeParse(process.env.ADMIN_NAME || "LuxuryStay Admin");

  if (!parsedEmail.success || !parsedPassword.success || !parsedName.success) {
    console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD before running this script.");
    console.error(
      "The password needs at least 8 characters, including a letter and a number."
    );
    process.exitCode = 1;
    return;
  }

  // First check, before connecting: a refused run never touches the database.
  const configured = databaseInUri(env.MONGO_URI);
  const early = refusalFor(configured);
  if (early) {
    console.log(`Configured database: ${configured || "(unknown)"}`);
    refuse(early);
    return;
  }

  try {
    // Index building and collection creation stay off: connecting changes nothing.
    await mongoose.connect(env.MONGO_URI, { autoIndex: false, autoCreate: false });

    // Second check, on the live connection, immediately before any write.
    const connected = mongoose.connection.db.databaseName;
    console.log(`Connected database: ${connected}`);

    const reason = refusalFor(connected);
    if (reason) {
      refuse(reason);
      return;
    }

    if (await User.exists({ email: parsedEmail.data })) {
      console.log("An account with this email already exists. Nothing was changed.");
      return;
    }

    await User.create({
      name: parsedName.data,
      email: parsedEmail.data,
      password: await bcrypt.hash(parsedPassword.data, 12),
      role: "admin",
    });

    console.log("Admin account created:", parsedEmail.data);
  } catch (error) {
    console.error("Admin creation failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
};

createAdmin();

// Adds a small set of demonstration rooms to the development database.
//
//   npm run seed:dev-rooms
//
// Only rooms whose number is not already taken are inserted; existing rooms
// and every other record are left exactly as they are, so running it again
// changes nothing. The same database guard as create-admin applies: the
// database must match EXPECTED_DB_NAME, and the production and test databases
// are always refused.

const mongoose = require("mongoose");

const { env, validateEnv } = require("../config/env");
const Room = require("../models/Room");
const { databaseInUri, refusalFor } = require("./writeGuard");

const ROOMS = [
  {
    roomNumber: "101",
    name: "Serene Garden Room",
    type: "Serene Room",
    description: "A calm room over the garden, with a balcony for the morning.",
    amenities: ["Wi-Fi", "Balcony", "Rain shower", "Tea and coffee", "Writing desk"],
    pricePerNight: 25000,
    capacity: 2,
    bedType: "King bed",
    floor: 1,
  },
  {
    roomNumber: "102",
    name: "Serene Courtyard Room",
    type: "Serene Room",
    description: "A quiet room facing the inner courtyard.",
    amenities: ["Wi-Fi", "Rain shower", "Tea and coffee"],
    pricePerNight: 27000,
    capacity: 2,
    bedType: "Queen bed",
    floor: 1,
  },
  {
    roomNumber: "205",
    name: "Signature City Suite",
    type: "Signature Suite",
    description: "A suite with a separate living room and a long view over the city.",
    amenities: ["Wi-Fi", "Living room", "Soaking tub", "City view"],
    pricePerNight: 40000,
    capacity: 3,
    bedType: "King bed",
    floor: 2,
  },
  {
    roomNumber: "206",
    name: "Signature Terrace Suite",
    type: "Signature Suite",
    description: "A suite opening onto a private terrace.",
    amenities: ["Wi-Fi", "Terrace", "Soaking tub"],
    pricePerNight: 44000,
    capacity: 3,
    bedType: "King bed",
    floor: 2,
  },
  {
    roomNumber: "307",
    name: "Royal Grand Residence",
    type: "Royal Residence",
    description: "A residence with a dining room, a study and two bedrooms.",
    amenities: ["Wi-Fi", "Dining room", "Study", "Butler service"],
    pricePerNight: 65000,
    capacity: 4,
    bedType: "2 King beds",
    floor: 3,
  },
];

const refuse = (reason) => {
  console.error(`Refused: ${reason} Nothing was written.`);
  process.exitCode = 1;
};

const seed = async () => {
  const { errors } = validateEnv();
  if (errors.length > 0) {
    errors.forEach((message) => console.error(message));
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
    await mongoose.connect(env.MONGO_URI, { autoIndex: false, autoCreate: false });

    // Second check, on the live connection, immediately before any write.
    const connected = mongoose.connection.db.databaseName;
    console.log(`Connected database: ${connected}`);

    const reason = refusalFor(connected);
    if (reason) {
      refuse(reason);
      return;
    }

    const taken = new Set(
      (await Room.find({ roomNumber: { $in: ROOMS.map((room) => room.roomNumber) } })
        .select("roomNumber")
        .lean()).map((room) => room.roomNumber)
    );
    const missing = ROOMS.filter((room) => !taken.has(room.roomNumber));

    // Insert one at a time: a duplicate number (added meanwhile) is skipped,
    // never overwritten.
    let added = 0;
    for (const room of missing) {
      try {
        await Room.create(room);
        added += 1;
      } catch (error) {
        if (error.code !== 11000) throw error;
      }
    }

    console.log(`Rooms added: ${added}. Already present and left unchanged: ${ROOMS.length - added}.`);
  } catch (error) {
    console.error("Seeding failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
};

seed();

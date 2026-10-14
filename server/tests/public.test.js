const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

const h = require("./helpers");

let admin;

before(async () => {
  await h.start();
  admin = await h.actor("admin");
});

after(() => h.stop());

test("the website reads hotel details without signing in, and never internal policy", async () => {
  const empty = await h.api("GET", "/api/public/hotel");
  assert.equal(empty.status, 200);
  assert.equal(empty.body.hotel.hotelName, "LuxuryStay Hotel & Resort");
  assert.equal(empty.body.hotel.contactEmail, "");
  assert.equal(empty.body.today, h.day(0));
  assert.ok(empty.body.timezone);
  // An anonymous read must not create the settings document.
  assert.equal(await h.models.Settings.countDocuments(), 0);

  const saved = await h.api("PUT", "/api/settings", {
    token: admin.token,
    body: {
      contactEmail: "stay@example.test",
      instagramUrl: "https://instagram.com/luxurystay",
      allowCheckoutWithBalance: true,
    },
  });
  assert.equal(saved.status, 200);

  const hotel = (await h.api("GET", "/api/public/hotel")).body.hotel;
  assert.equal(hotel.contactEmail, "stay@example.test");
  assert.equal(hotel.instagramUrl, "https://instagram.com/luxurystay");
  assert.equal(hotel.allowCheckoutWithBalance, undefined);
  assert.equal(hotel.taxRate, undefined);
  assert.equal(hotel.updatedBy, undefined);
});

test("profile links must be https addresses", async () => {
  const put = (body) => h.api("PUT", "/api/settings", { token: admin.token, body });

  assert.equal((await put({ facebookUrl: "javascript:alert(1)" })).status, 400);
  assert.equal((await put({ facebookUrl: "http://facebook.com/x" })).status, 400);
  assert.equal((await put({ facebookUrl: "https://facebook.com/x" })).status, 200);
  assert.equal((await put({ facebookUrl: "" })).status, 200);
});

test("the public room collection comes from active rooms, grouped by type", async () => {
  assert.deepEqual((await h.api("GET", "/api/public/rooms")).body.categories, []);

  await h.createRoom({ type: "Serene Room", pricePerNight: 30000, capacity: 2, bedType: "King bed" });
  await h.createRoom({
    type: "Serene Room",
    pricePerNight: 25000,
    capacity: 3,
    bedType: "king bed",
    description: "A quiet room over the garden.",
    amenities: ["Wi-Fi", "Balcony"],
  });
  await h.createRoom({ type: "Royal Residence", pricePerNight: 90000, capacity: 4 });
  await h.createRoom({ type: "Signature Suite", pricePerNight: 1, isActive: false });

  const result = await h.api("GET", "/api/public/rooms");
  assert.equal(result.status, 200);
  assert.deepEqual(
    result.body.categories.map((item) => item.slug),
    ["serene-room", "royal-residence"]
  );

  const serene = result.body.categories[0];
  assert.equal(serene.roomCount, 2);
  assert.equal(serene.fromPrice, 25000);
  assert.equal(serene.maxCapacity, 3);
  assert.deepEqual(serene.bedTypes, ["King bed"]);
  assert.deepEqual(serene.amenities, ["Wi-Fi", "Balcony"]);
  assert.equal(serene.description, "A quiet room over the garden.");

  // Room numbers, status and housekeeping data stay behind sign-in.
  assert.equal(JSON.stringify(result.body).includes("roomNumber"), false);
  assert.equal(JSON.stringify(result.body).includes("status"), false);
});

import heroImage from "../assets/hotel-hero.jpg";

import sereneRoom from "../assets/serene-room.jpg";
import sereneBathroom from "../assets/serene-bathroom.jpg";
import sereneBalcony from "../assets/serene-balcony.jpg";
import sereneLiving from "../assets/serene-living-area.jpg";

import signatureSuite from "../assets/signature-suite.jpg";
import signatureBathroom from "../assets/signature-bathroom.jpg";
import signatureView from "../assets/signature-view.jpg";
import signatureLiving from "../assets/signature-living-area.jpg";

import royalResidence from "../assets/royal-residence.jpg";
import royalBathroom from "../assets/royal-bathroom.jpg";
import royalView from "../assets/royal-view.jpg";
import royalLiving from "../assets/royal-living-area.jpg";

// Photography for each room type. Prices, capacity, beds and descriptions are
// never kept here: they come from the room records in the database.
const MEDIA = {
  "serene-room": {
    image: sereneRoom,
    mood: "Quiet, light and easy to settle into.",
    gallery: [
      { image: sereneRoom, title: "Bedroom" },
      { image: sereneLiving, title: "Sitting area" },
      { image: sereneBathroom, title: "Bathroom" },
      { image: sereneBalcony, title: "Balcony" },
    ],
  },
  "signature-suite": {
    image: signatureSuite,
    mood: "Room to spread out, with a view worth staying in for.",
    gallery: [
      { image: signatureSuite, title: "Bedroom" },
      { image: signatureLiving, title: "Living room" },
      { image: signatureBathroom, title: "Bathroom" },
      { image: signatureView, title: "The view" },
    ],
  },
  "royal-residence": {
    image: royalResidence,
    mood: "Our most private address, made for longer stays.",
    gallery: [
      { image: royalResidence, title: "Bedroom" },
      { image: royalLiving, title: "Living room" },
      { image: royalBathroom, title: "Bathroom" },
      { image: royalView, title: "Terrace" },
    ],
  },
};

const FALLBACK = { image: heroImage, mood: "", gallery: [{ image: heroImage, title: "The hotel" }] };

export const slugOfType = (type = "") =>
  String(type)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export const mediaForSlug = (slug) => MEDIA[slug] || FALLBACK;

export const mediaForType = (type) => mediaForSlug(slugOfType(type));

// Addresses used by the previous website (/rooms/1) keep working.
export const LEGACY_ROOM_IDS = { 1: "serene-room", 2: "signature-suite", 3: "royal-residence" };

export const GALLERY = [
  { image: signatureLiving, title: "Signature Suite", note: "Living room" },
  { image: sereneBalcony, title: "Serene Room", note: "Balcony" },
  { image: royalView, title: "Royal Residence", note: "Terrace" },
  { image: royalBathroom, title: "Royal Residence", note: "Bathroom" },
  { image: signatureView, title: "Signature Suite", note: "Evening view" },
];

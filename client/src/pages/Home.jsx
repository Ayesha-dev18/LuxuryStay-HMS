import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, BedDouble, RefreshCw, Users } from "lucide-react";

import heroImage from "../assets/hotel-hero.jpg";
import diningImage from "../assets/fine-dining.jpg";
import spaImage from "../assets/spa-wellness.jpg";
import poolImage from "../assets/private-pool.jpg";
import transferImage from "../assets/private-transfer.jpg";

import BookingBar from "../components/site/BookingBar";
import EnquiryForm from "../components/site/EnquiryForm";
import Reveal from "../components/site/Reveal";
import SiteFooter from "../components/site/SiteFooter";
import SiteNav from "../components/site/SiteNav";
import { Skeleton } from "../components/ui/kit";
import Tilt from "../components/ui/Tilt";
import { useHotel, useRoomCollection } from "../context/HotelContext";
import { GALLERY, mediaForSlug } from "../lib/roomMedia";
import useParallax from "../lib/useParallax";

import "../styles/site.css";

const EASE = [0.22, 1, 0.36, 1];

// The hotel's services, each tied to an enquiry type the front desk handles.
const EXPERIENCES = [
  {
    key: "dining",
    title: "The table",
    image: diningImage,
    alt: "A table laid for dinner",
    text: "Considered cooking and an unhurried table. Tell us what you are celebrating and we will plan the evening around it.",
    topic: "Dining",
  },
  {
    key: "spa",
    title: "Spa and wellness",
    image: spaImage,
    alt: "A treatment room in the spa",
    text: "Treatments and quiet rooms for slowing down. Reserve a time before you arrive, or ask at the desk once you are here.",
    topic: "Spa & Wellness",
  },
  {
    key: "pool",
    title: "The pool",
    image: poolImage,
    alt: "The hotel pool",
    text: "Still water and somewhere to lie beside it. Bring a book and leave the afternoon open.",
    topic: "General Enquiry",
  },
  {
    key: "transfer",
    title: "Private transfer",
    image: transferImage,
    alt: "A car waiting for a guest",
    text: "A car arranged around your arrival and departure, so the journey is part of the stay and not a chore before it.",
    topic: "Private Transfer",
  },
];

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

// The hero's right-hand side: the hotel's room types as a fanned stack of
// cards in perspective, each a real link with its current "from" rate.
function HeroStack({ categories, money }) {
  const cards = categories.slice(0, 3);
  if (cards.length === 0) return null;

  return (
    <Tilt className="s-stack" max={6} role="group" aria-label="Room types">
      <div className="s-stack-plane">
        {cards.map((room, index) => (
          <motion.div
            key={room.slug}
            className={`s-stack-card s-stack-card-${index + 1}`}
            initial={{ opacity: 0, y: 60, rotateY: 24 }}
            animate={{ opacity: 1, y: 0, rotateY: 0 }}
            transition={{ duration: 1.1, delay: 0.5 + index * 0.15, ease: EASE }}
          >
            <Link to={`/rooms/${room.slug}`} aria-label={`${room.type}, from ${money(room.fromPrice)} per night`}>
              <img src={mediaForSlug(room.slug).image} alt="" />
              <span className="s-stack-caption">
                <strong>{room.type}</strong>
                <small>From {money(room.fromPrice)} / night</small>
              </span>
            </Link>
          </motion.div>
        ))}
      </div>
    </Tilt>
  );
}

function RoomCollection({ collection, money }) {
  if (collection.loading) {
    return (
      <div className="s-room" aria-busy="true" aria-label="Loading rooms">
        <Skeleton height={420} radius={6} />
        <div className="stack">
          <Skeleton width="30%" height={14} />
          <Skeleton width="80%" height={52} />
          <Skeleton height={14} />
          <Skeleton width="70%" height={14} />
        </div>
      </div>
    );
  }

  if (collection.error) {
    return (
      <div className="s-note" role="alert">
        <p className="s-lede" style={{ margin: "0 auto 20px" }}>
          We could not load the rooms just now. {collection.error}
        </p>
        <button type="button" className="btn btn-secondary" onClick={collection.reload}>
          <RefreshCw size={16} aria-hidden="true" /> Try again
        </button>
      </div>
    );
  }

  if (collection.categories.length === 0) {
    return (
      <div className="s-note">
        <p className="s-lede" style={{ margin: "0 auto 20px" }}>
          Our rooms are being prepared for booking. Send us a note and we will let you know as soon
          as reservations open.
        </p>
        <Link to={{ pathname: "/", hash: "#contact" }} className="btn btn-secondary">
          Contact the hotel
        </Link>
      </div>
    );
  }

  return collection.categories.map((room, index) => {
    const media = mediaForSlug(room.slug);

    return (
      <Reveal as="article" className={`s-room ${index % 2 ? "s-room-flip" : ""}`} key={room.slug}>
        <Tilt className="s-room-frame" style={{ "--rest-y": index % 2 ? "5deg" : "-5deg", "--rest-x": "2deg" }}>
          <Link to={`/rooms/${room.slug}`} className="s-room-media" aria-label={`View the ${room.type}`}>
            <img src={media.image} alt={`The ${room.type}`} loading="lazy" />
            <span className="s-room-tag" aria-hidden="true">
              <small>From</small>
              {money(room.fromPrice)}
            </span>
          </Link>
        </Tilt>

        <div className="s-room-body">
          <span className="s-room-index">No. {String(index + 1).padStart(2, "0")}</span>
          <h3>{room.type}</h3>
          <p>{room.description || media.mood}</p>

          <div className="s-specs">
            <span>
              <Users size={16} aria-hidden="true" /> Up to {plural(room.maxCapacity, "guest")}
            </span>
            {room.bedTypes.length > 0 && (
              <span>
                <BedDouble size={16} aria-hidden="true" /> {room.bedTypes.join(" or ")}
              </span>
            )}
          </div>

          <p className="s-price">
            From
            <strong>
              {money(room.fromPrice)} <small>per night</small>
            </strong>
          </p>

          <div className="s-room-actions">
            <Link to={`/rooms/${room.slug}`} className="btn btn-primary">
              View the room
            </Link>
            <Link to={`/rooms/${room.slug}#reserve`} className="s-textlink">
              Check dates <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </Reveal>
    );
  });
}

function Experiences({ onEnquire }) {
  const [active, setActive] = useState(EXPERIENCES[0].key);
  const current = EXPERIENCES.find((item) => item.key === active);

  const onKeyDown = (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const index = EXPERIENCES.findIndex((item) => item.key === active);
    const step = event.key === "ArrowDown" ? 1 : -1;
    const next = EXPERIENCES[(index + step + EXPERIENCES.length) % EXPERIENCES.length];
    setActive(next.key);
    document.getElementById(`exp-tab-${next.key}`)?.focus();
  };

  return (
    <div className="s-exp-grid">
      <div className="s-exp-tabs" role="tablist" aria-label="Experiences" aria-orientation="vertical">
        {EXPERIENCES.map((item, index) => (
          <button
            key={item.key}
            id={`exp-tab-${item.key}`}
            type="button"
            role="tab"
            className="s-exp-tab"
            aria-selected={active === item.key}
            aria-controls="exp-panel"
            tabIndex={active === item.key ? 0 : -1}
            onClick={() => setActive(item.key)}
            onMouseEnter={() => setActive(item.key)}
            onKeyDown={onKeyDown}
          >
            <small>0{index + 1}</small>
            <strong>{item.title}</strong>
            <ArrowRight size={20} aria-hidden="true" />
          </button>
        ))}
      </div>

      <div className="s-exp-panel" id="exp-panel" role="tabpanel" aria-labelledby={`exp-tab-${current.key}`}>
        <Tilt className="s-exp-frame" style={{ "--rest-y": "-4deg", "--rest-x": "2deg" }}>
        <div className="s-exp-media">
          <AnimatePresence initial={false}>
            <motion.img
              key={current.key}
              src={current.image}
              alt={current.alt}
              initial={{ opacity: 0, scale: 1.06 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.7, ease: EASE }}
            />
          </AnimatePresence>
        </div>
        </Tilt>
        <div className="s-exp-text">
          <p>{current.text}</p>
          <button type="button" className="s-textlink" onClick={() => onEnquire(current.topic)}>
            Ask about this <ArrowRight size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

// The hotel website's home page.
export default function Home() {
  const location = useLocation();
  const { hotel, money } = useHotel();
  const collection = useRoomCollection();
  const [topic, setTopic] = useState("");
  const heroRef = useRef(null);
  const parallax = useParallax(heroRef, 160);

  const { categories } = collection;
  const lowest = categories.length > 0 ? Math.min(...categories.map((room) => room.fromPrice)) : null;

  useEffect(() => {
    document.title = hotel.hotelName;
  }, [hotel.hotelName]);

  // In-page links (/#rooms) scroll to their section, including on arrival
  // from another page.
  useEffect(() => {
    if (!location.hash) return;
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [location.hash, location.key]);

  const enquire = (type) => {
    setTopic(type);
    document.getElementById("contact")?.scrollIntoView({ block: "start" });
  };

  const facts = [
    hotel.checkInTime && { label: "Check-in from", value: hotel.checkInTime },
    hotel.checkOutTime && { label: "Check-out by", value: hotel.checkOutTime },
    categories.length > 0 && { label: "Room types", value: categories.length },
    lowest !== null && { label: "Nightly rate from", value: money(lowest) },
  ].filter(Boolean);

  return (
    <div className="site">
      <SiteNav />

      <main>
        <section className="s-hero" ref={heroRef}>
          <motion.div className="s-hero-layer" style={{ y: parallax.y }}>
            <motion.img
              className="s-hero-img"
              src={heroImage}
              alt="The hotel at dusk"
              initial={{ scale: 1.12 }}
              animate={{ scale: 1.04 }}
              transition={{ duration: 2.4, ease: EASE }}
            />
          </motion.div>

          <div className="s-wrap s-hero-grid">
          <motion.div className="s-hero-copy" style={{ opacity: parallax.fade }}>
            <motion.p
              className="s-kicker"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2, ease: EASE }}
            >
              {hotel.address || "Hotel & Resort"}
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.3, ease: EASE }}
            >
              Unhurried days, <em>well-kept nights.</em>
            </motion.h1>
            <motion.p
              className="s-hero-lede"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.45, ease: EASE }}
            >
              Rooms, suites and residences prepared with care, and a team that looks after the rest.
              Choose your dates to see what is free.
            </motion.p>
          </motion.div>

          <HeroStack categories={categories} money={money} />
          </div>

          <div className="s-wrap">

            <motion.div
              className="s-hero-book"
              id="reserve"
              initial={{ opacity: 0, y: 26 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.6, ease: EASE }}
            >
              <BookingBar categories={categories} />
            </motion.div>
          </div>
        </section>

        <section className="s-section" id="hotel">
          <div className="s-wrap s-intro">
            <Reveal>
              <p className="s-kicker">The hotel</p>
              <h2 className="s-h2">
                A place that runs quietly, <em>so your time is your own.</em>
              </h2>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="s-lede">
                We would rather do a few things properly: a good bed, a calm room, a table worth
                sitting at, and people who remember what you asked for. Everything else is arranged
                around that.
              </p>
              {facts.length > 0 && (
                <dl className="s-facts">
                  {facts.map((fact) => (
                    <div key={fact.label}>
                      <dt>{fact.label}</dt>
                      <dd>{fact.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </Reveal>
          </div>
        </section>

        <section className="s-section s-rooms" id="rooms">
          <div className="s-wrap">
            <Reveal className="s-head">
              <div>
                <p className="s-kicker">Rooms and suites</p>
                <h2 className="s-h2">Where you will stay.</h2>
              </div>
              <p>Rates are per night and come straight from our reservations desk. Any tax is shown before you confirm.</p>
            </Reveal>

            <RoomCollection collection={collection} money={money} />
          </div>
        </section>

        <section className="s-section s-exp" id="experiences">
          <div className="s-wrap">
            <Reveal className="s-head">
              <div>
                <p className="s-kicker">Beyond the room</p>
                <h2 className="s-h2">
                  Things to do, <em>or not do.</em>
                </h2>
              </div>
              <p>Each of these is arranged by the front desk. Ask before you arrive and it will be ready.</p>
            </Reveal>

            <Reveal>
              <Experiences onEnquire={enquire} />
            </Reveal>
          </div>
        </section>

        <section className="s-section">
          <div className="s-wrap">
            <Reveal className="s-head">
              <div>
                <p className="s-kicker">A look inside</p>
                <h2 className="s-h2">Rooms with somewhere to sit.</h2>
              </div>
            </Reveal>

            <div className="s-gallery">
              {GALLERY.map((item, index) => (
                <Reveal className="s-tile-cell" key={item.image} delay={(index % 3) * 0.08}>
                  <figure className="s-tile">
                    <img src={item.image} alt={`${item.title}: ${item.note.toLowerCase()}`} loading="lazy" />
                    <figcaption>
                      <strong>{item.title}</strong>
                      {item.note}
                    </figcaption>
                  </figure>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="s-section s-cta">
          <Reveal className="s-wrap">
            <p className="s-kicker">Reserve</p>
            <h2 className="s-h2">Pick your dates. We will hold the room.</h2>
            <p className="s-lede">
              Reserving online takes a few minutes. You will see exactly which rooms are free and
              what the stay costs before you send anything.
            </p>
            <div className="s-cta-actions">
              <Link to={{ pathname: "/", hash: "#reserve" }} className="btn btn-accent btn-lg">
                Check availability
              </Link>
              <Link to={{ pathname: "/", hash: "#contact" }} className="btn btn-secondary btn-lg">
                Ask a question first
              </Link>
            </div>
          </Reveal>
        </section>

        <section className="s-section" id="contact">
          <div className="s-wrap s-contact">
            <Reveal>
              <p className="s-kicker">Contact</p>
              <h2 className="s-h2">Talk to the front desk.</h2>
              <p className="s-lede">
                Planning something particular, or not sure which room suits you? Write to us and a
                member of the team will reply.
              </p>

              <dl className="s-contact-list">
                {hotel.contactEmail && (
                  <div>
                    <dt>Email</dt>
                    <dd>
                      <a href={`mailto:${hotel.contactEmail}`}>{hotel.contactEmail}</a>
                    </dd>
                  </div>
                )}
                {hotel.contactPhone && (
                  <div>
                    <dt>Telephone</dt>
                    <dd>
                      <a href={`tel:${hotel.contactPhone}`}>{hotel.contactPhone}</a>
                    </dd>
                  </div>
                )}
                {hotel.address && (
                  <div>
                    <dt>Address</dt>
                    <dd>{hotel.address}</dd>
                  </div>
                )}
                {hotel.checkInTime && hotel.checkOutTime && (
                  <div>
                    <dt>Arrivals</dt>
                    <dd>
                      Check-in from {hotel.checkInTime}, check-out by {hotel.checkOutTime}
                    </dd>
                  </div>
                )}
              </dl>
            </Reveal>

            <Reveal delay={0.1}>
              <EnquiryForm topic={topic} />
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

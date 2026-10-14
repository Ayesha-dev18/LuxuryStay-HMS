import { useEffect, useRef } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, BedDouble, Check, RefreshCw, Users } from "lucide-react";

import BookingBar from "../components/site/BookingBar";
import Reveal from "../components/site/Reveal";
import SiteFooter from "../components/site/SiteFooter";
import SiteNav from "../components/site/SiteNav";
import { Skeleton } from "../components/ui/kit";
import { useHotel, useRoomCollection } from "../context/HotelContext";
import { LEGACY_ROOM_IDS, mediaForSlug } from "../lib/roomMedia";
import useParallax from "../lib/useParallax";
import Tilt from "../components/ui/Tilt";

import "../styles/site.css";

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

// A page that has no photograph at the top: loading, failure, unknown room.
function Blank({ children }) {
  return (
    <div className="site">
      <SiteNav solid />
      <main className="s-blank">
        <div>{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}

// One room type, with its details and rate read from the room records.
export default function RoomPage() {
  const { slug } = useParams();
  const location = useLocation();
  const { hotel, money } = useHotel();
  const collection = useRoomCollection();

  const room = collection.categories.find((item) => item.slug === slug);
  const heroRef = useRef(null);
  const parallax = useParallax(heroRef, 140);

  useEffect(() => {
    document.title = room ? `${room.type} · ${hotel.hotelName}` : hotel.hotelName;
  }, [room, hotel.hotelName]);

  useEffect(() => {
    if (!room) return;
    if (location.hash) {
      document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: "center" });
    } else {
      window.scrollTo(0, 0);
    }
  }, [room, slug, location.hash]);

  if (LEGACY_ROOM_IDS[slug]) return <Navigate to={`/rooms/${LEGACY_ROOM_IDS[slug]}`} replace />;

  if (collection.loading) {
    return (
      <Blank>
        <div className="stack" style={{ width: "min(520px, 80vw)" }} aria-busy="true" aria-label="Loading room">
          <Skeleton height={56} />
          <Skeleton height={14} />
          <Skeleton width="60%" height={14} />
        </div>
      </Blank>
    );
  }

  if (collection.error) {
    return (
      <Blank>
        <h1>We could not load this room.</h1>
        <p className="s-lede" role="alert">
          {collection.error}
        </p>
        <button type="button" className="btn btn-primary" onClick={collection.reload}>
          <RefreshCw size={16} aria-hidden="true" /> Try again
        </button>
      </Blank>
    );
  }

  if (!room) {
    return (
      <Blank>
        <h1>This room is not available.</h1>
        <p className="s-lede">It may have been renamed or taken off sale. Our current rooms are listed on the home page.</p>
        <Link to={{ pathname: "/", hash: "#rooms" }} className="btn btn-primary">
          See all rooms
        </Link>
      </Blank>
    );
  }

  const media = mediaForSlug(room.slug);
  const others = collection.categories.filter((item) => item.slug !== room.slug);

  return (
    <div className="site">
      <SiteNav />

      <main>
        <section className="s-room-hero" ref={heroRef}>
          <motion.div className="s-hero-layer" style={{ y: parallax.y }}>
            <motion.img
              key={room.slug}
              className="s-hero-img"
              src={media.image}
              alt={`The ${room.type}`}
              initial={{ scale: 1.1 }}
              animate={{ scale: 1.04 }}
              transition={{ duration: 2, ease: [0.22, 1, 0.36, 1] }}
            />
          </motion.div>
          <div className="s-wrap">
            <Link to={{ pathname: "/", hash: "#rooms" }} className="s-back">
              <ArrowLeft size={16} aria-hidden="true" /> All rooms
            </Link>
            <p className="s-kicker">Rooms and suites</p>
            <h1>{room.type}</h1>
          </div>
        </section>

        <section className="s-section">
          <div className="s-wrap">
            <div className="s-room-layout">
              <Reveal>
                <h2>{media.mood || `About the ${room.type}`}</h2>
                {room.description && (
                  <p className="s-lede" style={{ marginTop: 20 }}>
                    {room.description}
                  </p>
                )}

                <div className="s-specs" style={{ fontSize: 15 }}>
                  <span>
                    <Users size={17} aria-hidden="true" /> Sleeps up to {plural(room.maxCapacity, "guest")}
                  </span>
                  {room.bedTypes.length > 0 && (
                    <span>
                      <BedDouble size={17} aria-hidden="true" /> {room.bedTypes.join(" or ")}
                    </span>
                  )}
                  <span>{plural(room.roomCount, "room")} of this type</span>
                </div>

                {room.amenities.length > 0 && (
                  <>
                    <p className="s-kicker" style={{ marginTop: 48 }}>
                      In the room
                    </p>
                    <ul className="s-amenities">
                      {room.amenities.map((amenity) => (
                        <li key={amenity}>
                          <Check size={16} aria-hidden="true" /> {amenity}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </Reveal>

              <Reveal as="aside" className="s-reserve" id="reserve" delay={0.1} aria-label="Reserve this room">
                <p className="s-price">
                  From
                  <strong>
                    {money(room.fromPrice)} <small>per night</small>
                  </strong>
                </p>
                <BookingBar variant="card" roomType={room.type} maxGuests={room.maxCapacity} />
                <p>
                  Nothing is charged online. The final price, including any tax, is shown before you
                  send your request.
                  {hotel.checkInTime && hotel.checkOutTime
                    ? ` Check-in from ${hotel.checkInTime}, check-out by ${hotel.checkOutTime}.`
                    : ""}
                </p>
              </Reveal>
            </div>

            <div className="s-room-gallery">
              {media.gallery.map((item, index) => (
                <Reveal className="s-tile-cell" key={item.image} delay={(index % 2) * 0.08}>
                  <figure className="s-tile">
                    <img src={item.image} alt={`${room.type}: ${item.title.toLowerCase()}`} loading="lazy" />
                    <figcaption>
                      <strong>{item.title}</strong>
                    </figcaption>
                  </figure>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {others.length > 0 && (
          <section className="s-section s-rooms">
            <div className="s-wrap">
              <p className="s-kicker">Also at the hotel</p>
              <div className="s-others">
                {others.map((item) => (
                  <Link key={item.slug} to={`/rooms/${item.slug}`} className="s-other">
                    <Tilt as="span" className="s-other-frame">
                      <span className="s-room-media">
                        <img src={mediaForSlug(item.slug).image} alt="" loading="lazy" />
                      </span>
                    </Tilt>
                    <strong>{item.type}</strong>
                    <span>
                      From {money(item.fromPrice)} per night · up to {plural(item.maxCapacity, "guest")}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}

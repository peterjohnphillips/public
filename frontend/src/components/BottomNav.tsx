import { NavLink } from "react-router-dom";

const LINKS = [
  { to: "/", label: "Home", icon: "⌂", end: true },
  { to: "/lessons", label: "Lessons", icon: "\u{1F4D6}" },
  { to: "/daily", label: "Today", icon: "☀" },
  { to: "/progress", label: "Progress", icon: "\u{1F4C8}" },
];

/** Primary navigation on a phone: fixed to the bottom of the viewport so it
 * stays within thumb reach, which is why it exists separately from the top
 * header's nav (that one only shows at the wide breakpoint - see app.css). */
export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Primary">
      {LINKS.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.end}
          className={({ isActive }) => `bottom-nav__link${isActive ? " active" : ""}`}
        >
          <span className="bottom-nav__icon" aria-hidden="true">
            {link.icon}
          </span>
          {link.label}
        </NavLink>
      ))}
    </nav>
  );
}

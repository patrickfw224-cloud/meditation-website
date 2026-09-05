# Nocturne — meditation studio site

A static, dependency-free landing page and booking page. No build step: open
`index.html` in a browser or serve the folder with any static server.

```sh
python3 -m http.server 8080
# then visit http://localhost:8080
```

## Pages

| File | Purpose |
| --- | --- |
| `index.html` | Landing page: a six-passage full-bleed scroll hero, practices, method, guides, breathing tool, pricing, testimonials, FAQ, call to action, footer |
| `booking.html` | Four-step booking flow: practice → date & time → details → confirm, with a live summary, calendar export and an upcoming-sessions list |
| `styles.css` | Design tokens and all shared styles |
| `support.js` | Shared behaviour: header, mobile nav, scroll reveal, newsletter, breathing tool |
| `booking.js` | Booking flow logic |
| `art/plate-*.svg` | Six abstract art plates used across both pages |

## Design tokens

Everything visual is driven by custom properties at the top of `styles.css`.
The palette follows the Claude Design "Stillpoint Meditation" artboards:

- **Cream page** (`--cream-50` to `--cream-300`) with warm-brown ink
  (`--ink-900`, `--ink-700`, `--ink-500`) and a terracotta accent (`--rust`) for
  eyebrows, selected states and outlined buttons.
- **Dream pastels** (`--coral`, `--peach`, `--periwinkle`, `--sky`) for the art
  plates, glows and the breathing orb.
- **Night sections** (`--night-900`, `--night-800`, `--indigo-900`) with a
  lavender accent (`--lavender`, `--lavender-deep`) for the practice cards and
  the closing call to action, mirroring the design's dark "The practice" block
  and band. Any section gets this treatment by adding the `section-night`
  class.

The hero and footer share one palette on purpose: `--hero-bg` and `--footer-bg`
are mirror images built from the same cream tones and the same peach and
periwinkle glows, so the page opens and closes on matching colour.

The plates in `art/` are hand-drawn SVG stand-ins for the design's PNG plates.
To use the originals, drop `plate-*.png` into `art/` and change the `.svg`
references in `index.html` and `booking.html` to `.png`.

## Booking flow

The booking page is fully functional on the client:

- Practice, format (online / in studio) and plan selection, with `?practice=`
  and `?plan=` query parameters for deep links from the landing page.
- A month calendar (today through 60 days ahead) with keyboard navigation, and
  evening time slots per practice. Some slots are shown as full to simulate
  capacity; slots needing less than an hour's notice are disabled.
- Validated details form with inline errors and focus management.
- Confirmation with a reference number, an `.ics` calendar download, and a
  pre-filled email to the studio.
- Bookings are stored in `localStorage` and listed under "Your upcoming
  sessions", where they can be cancelled. A draft of an unfinished booking is
  kept in `sessionStorage` so a refresh does not lose progress.

To connect a real backend, replace the body of `confirmBooking()` in
`booking.js` with a request to your API; the `booking` object it builds has
everything the server needs.

## Placeholder content

Studio name, address, email, guide names, testimonials and prices are
placeholders. Search for `Nocturne`, `Lantern Lane` and `nocturne.example` to
replace them.

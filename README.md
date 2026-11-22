# RSVP Site — Han Seng & Tanaaz 

Three pieces, all free:
1. **Your Google Sheet** — one row per person
2. **Google Apps Script** — connects the website to the Sheet, handles uploads
3. **Static site** (`site/` folder) — hosted free on GitHub Pages

---

## 1. Your Google Sheet

One tab, one row per person. Use this header row, in this order (the script finds columns by name, case-insensitively, so the order is for your convenience, not a requirement):

```
UID | Name | Party name | POC | Pickup | Mehndi | Haldi | Sangeet | Vidhi | Tea Ceremony | Dinner |
Attending Wedding | Full Name | Phone Number | Travelling from Overseas | Travelling Domestically |
Airport Pickup Required | Arrival Flight Number | Arrival Travel Date | Arrival Travel Time | Arrival Airport |
Mehndi - Attending | Haldi - Attending | Sangeet - Attending | Vidhi - Attending | Tea Ceremony - Attending | Dinner - Attending |
Food Allergies | Local Indian | Song Requests | Message for the Couple |
Passport | Visa / OCI | Aadhar Card
```

(That is one single row of 34 headers, wrapped here for readability.)

**Readable — columns A–K, you fill these in before sharing the site:**

| UID | Name | Party name | POC | Pickup | Mehndi | Haldi | Sangeet | Vidhi | Tea Ceremony | Dinner |
|---|---|---|---|---|---|---|---|---|---|---|
| K7M2QX9TPD | Aarav Mehta | Mehta Family | Aarav Mehta | TRUE | TRUE | TRUE | TRUE | FALSE | FALSE | TRUE |
| K7M2QX9TPD | Riya Mehta | Mehta Family | Aarav Mehta | TRUE | TRUE | TRUE | TRUE | FALSE | FALSE | TRUE |

- **UID**: the party's **10-character login code** (letters and numbers), and the **only** thing a guest types on the site. Use the same UID on every row in the party. Don't make them up by hand: in the sheet use **RSVP → Generate missing UIDs** (this adds the UID column at the far left if it's missing, formats it as plain text, and gives each party a unique code). It's safe to re-run later when you add guests — existing UIDs are never changed. Send each party's UID to its leader privately; anyone with the code can submit for that whole party.
- **Name**: that row's person. No longer typed by guests; the script uses it to find each person's own row when saving, and to name their Drive upload folder.
- **Party name**: a **shared label** — put the exact same value on every row belonging to the same group (e.g. "Mehta Family"). The website groups people by UID; this label is used by *Generate missing UIDs* to decide which rows share one code.
- **POC**: the party leader's name, repeated on every row in that party. It's **display-only** (shown as "Welcome, <POC>"); access is controlled entirely by the UID.
- **Pickup**: **internal only — never appears on the website.** Tick this (checkbox or TRUE/Yes) for a party if you need to collect their overseas travel info. It's a party-level flag, same as the event columns — tick at least one row in the party (simplest to tick every row the same way). If it's left unticked for a party, the whole travel section (overseas / domestic / airport pick-up / arrival fields) is **not shown at all** for anyone in that party, and those columns are always left blank on submit.
- **Mehndi / Haldi / Sangeet / Vidhi / Tea Ceremony / Dinner**: tick the checkbox (or type TRUE/Yes) for every event *the party* is invited to. These are party-level invites — every person in the same party sees the same set of events to confirm. It's simplest to tick the same boxes on every row belonging to that party, but the script also works if you only tick it on one row in the party (it unions across the party's rows).

**Writable — columns L–AH, leave these blank, the form fills them in:**

| Column | What the form puts there |
|---|---|
| **Attending Wedding** | Yes/No, from the "I can attend the wedding" tickbox at the top of each person's block. If left unticked, the rest of that person's fields are hidden; on submit they are recorded as `No`, every invited event is set to `No`, and their other answers and uploaded ID files are cleared. |
| **Full Name** | Labelled "Full name" on the form, with the helper line "Full name as per passport". |
| **Phone Number** | Validated mobile number, stored in international format. |
| **Travelling from Overseas** / **Travelling Domestically** | Yes/No tickboxes (mutually exclusive), only shown if the party's **Pickup** column is ticked; otherwise left blank. |
| **Airport Pickup Required** | Yes/No. Only asked when the guest ticks "Travelling from overseas": a second tickbox asks whether they need an airport pick-up arranged. |
| **Arrival Flight Number / Travel Date / Travel Time / Airport** | Only requested, required and saved if the guest ticks that they need an airport pick-up; otherwise blank. **Arrival Travel Time is entered and stored in IST** — the form carries a notice reminding guests of this (IST is UTC+5:30, 5 h 30 min ahead of UTC). |
| **Mehndi / Haldi / Sangeet / Vidhi / Tea Ceremony / Dinner - Attending** | Each person's Yes/No for each event the party is invited to. |
| **Food Allergies** | Optional free text (max 200 characters). |
| **Local Indian** | Yes/No tickbox; decides which ID slots the guest sees (locals: Aadhar Card; others: Passport + Visa / OCI). |
| **Song Requests** | Optional free text (max 300 characters). |
| **Message for the Couple** | Optional free text (max 500 characters). |
| **Passport / Visa / OCI / Aadhar Card** | One private Drive link per line, for each uploaded file (up to 5 files per document type). |

If you leave any of these headers out, the script adds the missing column at the far right the first time someone submits — so creating them all up front in the order above is the tidiest option.

> **Re-submitting / editing**: when the party leader looks their name up again, the form comes back pre-filled with whatever was last saved for every person in the party (names, phone, attendance, travel details, optional answers) — so they're editing, not starting from scratch.

> **Existing attachments on re-visit**: for privacy, previously uploaded files show up as a **filename only** — no thumbnail, no preview, no clickable link. The leader can remove any of them (✕) to replace it, or just leave it and add more alongside it. Newly added files in the same session still get a full thumbnail preview, since those are still sitting in the browser and haven't been uploaded yet.

> **Upload folders use the `Name` column**, not `Full Name` — so if someone updates their passport-name spelling later, their files stay in the same folder instead of creating a new orphaned one.

> Uploaded verification photos are **private** — never link-shared. Only you (the Drive owner) and anyone you share the folder with can open them, so the Drive links in the sheet only work for those people. Accepted types: JPG, PNG, WebP, HEIC, PDF; max 10 MB per file (checked in the browser and again on the server using the file's real contents).

> Verification photos are saved into Drive under a folder named "RSVP Uploads - Han Seng & Tanaaz", with a **separate subfolder for each guest** (named after their full name) inside it — so every person's photos stay together and are easy to find.

> On the form itself, guests can add photos in multiple batches (it doesn't replace previously added ones), see a small thumbnail preview of each, and remove any individual one with the ✕ button before submitting.

## 2. Set the event date/times in the script

Your sheet doesn't store event dates, so they live in the script instead. Open `apps-script/Code.gs` and edit this block near the top:

```js
const EVENT_INFO = {
  'Mehndi':        '10 Dec 2026, 4:00 PM',
  'Haldi':         '11 Dec 2026, 10:00 AM',
  ...
};
```

## 3. Deploy the Apps Script

1. Open your Sheet → **Extensions → Apps Script**.
2. Delete the placeholder code, paste in all of `apps-script/Code.gs`.
3. At the top, check `SHEET_NAME` matches your tab's actual name (default assumes `Sheet1`).
4. **Deploy → New deployment** → type **Web app** → Execute as **Me** → Who has access **Anyone**.
5. Authorize the permissions (it needs to read/write your Sheet and create files in Drive).
6. Copy the **Web app URL** (ends in `/exec`).
7. Whenever you edit `Code.gs` later: **Deploy → Manage deployments → ✏️ → New version** to push the change live.

## 4. Connect the site

In `site/config.js`:

```js
const API_URL = "https://script.google.com/macros/s/AKfycb.../exec";
```

## 5. Publish on GitHub Pages

1. New GitHub repo, e.g. `rsvp-hanseng-tanaaz`.
2. Push the contents of `site/` (`index.html`, `style.css`, `app.js`, `background.js`, `config.js`, plus the `vendor/`, `data/` and `assets/` folders, including `assets/corners/` and `assets/sides/`) to the repo **root**. Everything the page needs is served from your own repo — the only external request is Google Fonts.
3. Repo → **Settings → Pages** → Source: branch `main`, folder `/ (root)`.
4. Live at `https://<your-username>.github.io/rsvp-hanseng-tanaaz/`.

## 6. Background: couple photo and flowers

The page has a decorative, scrolling background (purely visual; it never blocks clicks or typing):

- **Couple photo**: fixed behind everything at full strength, always fills the screen at any size or orientation, and drifts very slowly as the page scrolls.
- **Corner flowers**: one in each corner of the page, fixed to the page so they scroll with it.
- **Side flowers**: flowers stacked down both edges, fixed to the page like the corners, so the middle of long pages has flowers too. These only show on screens wider than ~900px (phones show corner flowers only), and they only fill the space between the top and bottom corner flowers, so the two never overlap.
- **Centre window**: the white card that holds the text is 60% of the screen width on screens 900px wide or more (change `width: 60vw` in the `.card` rule of `style.css`). Below 900px (phones and tablets, where the side flowers are off) it fills the screen width instead, capped at 640px; the "Mobile / small screens" block at the very end of `style.css` holds those rules. Its text scales with the screen (`--fs` at the top of `style.css`), and is slightly see-through, so the photo and flowers show faintly behind it. Its see-through amount is adjustable (below).
- Guests who have "reduce motion" turned on in their device settings get the same background without the movement.

**Adding your photo:** save it as `assets/couple.jpg` (landscape or portrait both work; ~1600px on the long side and under ~400 KB keeps the page fast). Until that file exists, no photo is shown.

**Tuning** (the first block under "Dynamic background" at the end of `style.css`):

| Setting | What it does |
|---|---|
| `--card-opacity` | The centre window: `1` = solid, `0` = fully see-through. Default `0.88`. Lower it to show more of the photo, raise it for easier reading. |
| `--card-blur` | How blurred the picture is behind the window. Default `4px`; `0px` = sharp. A little blur keeps text readable at low opacity. |
| `--couple-photo-position` | Photo position as `horizontal vertical`, e.g. `50% 30%` (default) or `20% 15%`. Horizontal: `0%` = left edge of the photo, `100%` = right edge. Vertical: `0%` = top, `100%` = bottom. Keywords like `left top` also work. |
| `--couple-photo` | Change the file name if your photo isn't `couple.jpg` (e.g. a `.png` or `.webp`). |

The photo always fills the screen, so it can only slide in the direction it is being cropped: **sideways** when the photo is wider than the screen's shape (e.g. a landscape photo on a phone), **up/down** when it is taller (e.g. a portrait photo on a laptop). Because phones and laptops are shaped differently, check both after changing it.

Scroll speeds are at the top of `background.js` (`PHOTO_SPEED`, `CORNER_SPEED`); smaller numbers move less.

**Flower artwork** lives in `assets/` (all SVGs are pre-cropped so they hug the screen edge):

- `assets/corners/`: `top_left_corner.svg`, `top_right_corner.svg`, `bottom_left_corner.svg`, `bottom_right_corner.svg`. Each corner has its own file (nothing is mirrored). Keep these file names.
- `assets/sides/`: any number of SVGs. A file with **"left"** in its name goes down the left edge; one with **"right"** goes down the right edge. They are stacked in order, and `background.js` adds or removes them as the screen or page height changes.

**Adding, removing or renaming a side SVG:** change the file in `assets/sides/`, then update the `SIDE_FILES` list at the top of `background.js` to match (a website can't list a folder by itself). Spacing and the minimum screen width for side flowers (`SIDE_GAP_RATIO`, `SIDE_MIN_WIDTH`) are in the same place. Corner and side flowers scroll exactly with the page; `CORNER_SPEED` and `SIDE_SPEED` (both `0`) can make them trail behind it, but keep the two equal. No flower is ever wider than 20% of the screen width (`MAX_FLOWER_VW` in `background.js`). Every flower (corner or side) is drawn at the same scale, worked out from the corner's size on the screen, so a flower is the same size wherever it appears and everything grows and shrinks together. For this to work, each side SVG should have its own `width`/`height` (SVGs exported from the same tool as the corners do); if one doesn't, it is drawn at half the corner width (`SIDE_FALLBACK_WIDTH`). The side flowers are spread evenly down each edge together with the corner flowers (the gap from the corner to the first side flower equals the gaps between side flowers); `SIDE_GAP_RATIO` is the smallest gap allowed, as a fraction of the corner width. If you change `SIDE_MIN_WIDTH`, change the `900px` in the `.bg-side` media query in `style.css` too.

---

## One-click invitation links

Instead of asking guests to type their code, send each party leader a link with the UID in it:

```
https://<your-username>.github.io/rsvp-hanseng-tanaaz/#code=K7M2QX9TPD
```

Opening it goes straight to that party's RSVP form. `#K7M2QX9TPD` and `?code=K7M2QX9TPD` also work, and a wrong or mistyped code shows the usual error with the code pre-filled. The typed-code box still works as before.

To build the links in the sheet, put your site address in a spare cell and add a helper column, e.g. with the UID in column A and the site address (ending in `/`) in `Z1`:

```
=$Z$1 & "#code=" & A2
```

## How a guest experiences it

1. Opens their invitation link (or types their party's 10-character UID).
2. If the code isn't recognised → told to check it or contact Han Seng or Tanaaz.
3. If it's valid → they see their party's events (same for everyone in the party) and one RSVP block per person in the party.
4. On submit, the UID is checked again by the script, and only rows belonging to that UID's party can be written to.
5. They fill in, for **every person in the party**: full name (passport name, with phone), Yes/No for each event, and verification photos (any number). If the party's internal **Pickup** flag is ticked, they also see a "Travelling from overseas" tickbox (reveals arrival flight number/date/time/airport only if ticked); if Pickup isn't ticked, that whole section is hidden and skipped entirely.
6. On submit, the script writes straight back into each person's own row — no new rows created.
7. Thank-you screen, with a note to contact Han Seng/Tanaaz directly for travel changes.

## Security notes

- **Deploying the update:** after pasting the new `Code.gs`, **Deploy → Manage deployments → ✏️ → New version**. Then run **RSVP → Make existing uploads private** once, to lock down files uploaded by the earlier version (which were link-shared).
- **No Drive links reach the browser** — only a file ID and filename per stored file. Submissions can only keep or remove files already stored for that party.
- **Guest lookups use POST**, so the UID is never sent to the script in a URL. Invitation links put the UID after a `#`, which browsers never send to any server (so it stays out of GitHub Pages logs and Referer headers); the site removes it from the address bar when a guest goes back or returns home. The trade-off: a link is a credential, so anyone who sees or forwards it can submit for that party, and it sits in the guest's browser history and chat/email. `?code=` links, if you use them, are visible to the host's logs. Repeated wrong codes are slowed down (never locked out).
- **Sheet safety:** text from guests is length-capped, and anything that could be read as a formula is stored as plain text. Only events the party is invited to can be written to.
- **Self-hosted dependencies:** the phone-number library lives in `vendor/intl-tel-input/` (MIT licence included) and the airport list in `data/airports.json`, so no third-party script runs on the page. (The list comes from Algolia's public airports dataset, which has no entry for Navi Mumbai (NMI) as of Nov 2026, so NMI was added by hand, right after Mumbai (BOM). If you ever refresh the file from upstream, re-add it.) Google Fonts is still loaded from Google (stylesheet only).
- **Housekeeping:** don't commit real UIDs; after the wedding, delete the upload folder and the ID columns, and empty Drive's trash (trashed files linger ~30 days).
- Because these are identity documents (passport, visa/OCI, Aadhaar), check the data-protection rules that apply to you and your guests.

## Before sending the link out

- **Test it yourself first**: add a test row, try the full flow, check the sheet updates correctly, then delete the test row.
- Double-check `SHEET_NAME` in the script matches your tab name exactly.
- If submissions fail with a network/CORS error, it's almost always: deployment access isn't set to **Anyone**, or you edited the script but forgot to deploy a **new version**.
- Large photo uploads are fine for normal phone photos but can be slow on weak connections — no hard size limit is enforced, so it's worth a quiet word to guests not to upload, say, 20 huge files each.

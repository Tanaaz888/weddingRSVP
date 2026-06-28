# RSVP Site — Han Seng & Tanaaz

Three pieces, all free:
1. **Your Google Sheet** — one row per person
2. **Google Apps Script** — connects the website to the Sheet, handles uploads
3. **Static site** (`site/` folder) — hosted free on GitHub Pages

---

## 1. Your Google Sheet

One tab, one row per person. Header row exactly like this (order doesn't matter, names do):

**Readable — you fill these in before sharing the site:**

| Name | Party name | POC | Mehndi | Haldi | Sangeet | Vidhi | Tea ceremony | Dinner |
|---|---|---|---|---|---|---|---|---|
| Aarav Mehta | Mehta Family | Aarav Mehta | TRUE | TRUE | TRUE | FALSE | FALSE | TRUE |
| Riya Mehta | Mehta Family | Aarav Mehta | TRUE | TRUE | TRUE | FALSE | FALSE | TRUE |

- **Name**: must match exactly what that person will type on the site (case/spacing-insensitive, so "aarav mehta" still works). Only names that exist in this column can search the form at all; anyone else gets "we could not find that name."
- **Party name**: a **shared label** — put the exact same value on every row belonging to the same group (e.g. "Mehta Family" on every Mehta row). This groups them, it's not a list of names anymore.
- **POC**: the party leader's exact `Name` value, repeated on every row in that party. **Only the person whose own Name matches POC can open and submit the form** for the whole party. Anyone else in that party who tries gets sent to a "please check with your party leader" page instead — they're told who that is, but can't fill in the form themselves.
- **Mehndi / Haldi / Sangeet / Vidhi / Tea ceremony / Dinner**: tick the checkbox (or type TRUE/Yes) for every event *the party* is invited to. These are party-level invites — every person in the same party sees the same set of events to confirm. It's simplest to tick the same boxes on every row belonging to that party, but the script also works if you only tick it on one row in the party (it unions across the party's rows).

**Writable — leave these columns blank, the form fills them in:**

`Full Name | Phone number | Travelling from overseas | Arrival Flight Number | Arrival Travel Date | Arrival Travel Time | Arrival Airport | Identification 1 | Identification 2 | Identification 3`

- **Full Name**: labeled on the form as "Full name", with a helper line underneath saying "Full name as per passport".
- **Travelling from overseas**: Yes/No, set by a tickbox on the form. The four "Arrival..." columns are only filled in if that's ticked Yes — otherwise they're left blank and the form greys those fields out (disabled, not required).

The script will also **automatically add** one column per event the first time anyone submits, e.g. `Mehndi - Attending`, `Haldi - Attending` — that's where each person's Yes/No lands.

> If someone uploads more than 3 ID photos, photos 4 and onward get appended into the `Identification 3` cell (one link per line) so nothing is lost — they're not dropped.

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
2. Push the contents of `site/` (`index.html`, `style.css`, `app.js`, `config.js`) to the repo **root**.
3. Repo → **Settings → Pages** → Source: branch `main`, folder `/ (root)`.
4. Live at `https://<your-username>.github.io/rsvp-hanseng-tanaaz/`.

---

## How a guest experiences it

1. Types their name.
2. If the name isn't found at all → told their name isn't on the guest list, to contact Han Seng or Tanaaz.
3. If found but they're **not** the party's POC/leader → sent to a page telling them who their party leader is, and to pass their details along — they cannot fill in the form themselves.
4. If they **are** the POC → they see their party's events (same for everyone in the party) and one RSVP block per person in the party.
5. They fill in, for **every person in the party**: full name (passport name, with phone), Yes/No for each event, a "Travelling from overseas" tickbox (reveals arrival flight number/date/time/airport only if ticked), and verification photos (any number).
6. On submit, the script writes straight back into each person's own row — no new rows created.
7. Thank-you screen, with a note to contact Han Seng/Tanaaz directly for travel changes.

## Before sending the link out

- **Test it yourself first**: add a test row, try the full flow, check the sheet updates correctly, then delete the test row.
- Double-check `SHEET_NAME` in the script matches your tab name exactly.
- If submissions fail with a network/CORS error, it's almost always: deployment access isn't set to **Anyone**, or you edited the script but forgot to deploy a **new version**.
- Large photo uploads are fine for normal phone photos but can be slow on weak connections — no hard size limit is enforced, so it's worth a quiet word to guests not to upload, say, 20 huge files each.

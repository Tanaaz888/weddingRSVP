/**
 * RSVP backend for Han Seng & Tanaaz's wedding.
 *
 * YOUR SHEET (tab name set in SHEET_NAME below) — ONE ROW PER PERSON:
 *
 *  Readable (you pre-fill these before sharing the site):
 *    UID | Name | Party name | POC | Pickup | Mehndi | Haldi | Sangeet | Vidhi | Tea ceremony | Dinner
 *
 *    - "UID": the party's 10-character alphanumeric LOGIN CODE (e.g. "K7M2QX9TPD").
 *      It is the ONLY thing a guest types on the site. Put the exact same UID
 *      on every row in the party. Whoever you give the code to can open and
 *      submit the form for the whole party. Names are no longer used for login.
 *      Don't type these by hand — run  RSVP > Generate missing UIDs  (or run
 *      generateMissingUids() from the editor). It creates the UID column at the
 *      far left if it's missing, and gives every party one unique code.
 *      The UID column is formatted as plain text so Sheets can't mangle codes
 *      that look like numbers (e.g. leading zeros, or "12E4567890").
 *    - "Name": that row's person, exactly as they'll type it on the site.
 *    - "Party name": a shared human-readable label for the group (e.g. "Mehta
 *      Family"). Parties are now grouped by UID, not by this label; it is only
 *      used by generateMissingUids() to decide which rows share one UID.
 *    - "POC": the name of the party leader — put the SAME value on every row
 *      in that party. It is informational only now (shown as "Welcome, <POC>");
 *      access is controlled purely by the UID.
 *    - "Pickup": INTERNAL ONLY — never shown on the website. Tick = TRUE
 *      (checkbox) or "Yes" if you need to collect overseas travel/arrival
 *      info for this party. It's a party-level flag, just like the event
 *      columns — tick it on at least one row in the party (simplest to tick
 *      it the same way on every row). If it's NOT ticked for the party, the
 *      "Travelling from overseas" question and all arrival detail fields
 *      are hidden entirely on the form for every guest in that party, and
 *      the backend always leaves those columns blank on submit regardless
 *      of anything the browser sends.
 *    - Mehndi/Haldi/etc: tick = TRUE (checkbox) or "Yes" if the PARTY is
 *      invited to that event. Every person in the same party gets the same
 *      events to confirm — tick it on at least one row in the party and
 *      everyone in that party will see it (it's fine, and simplest, to tick
 *      it the same way on every row in the party).
 *
 *  Writable (the form fills these in — leave blank, just have the header):
 *    Full Name | Phone Number | Local Indian | Travelling from Overseas |
 *    Arrival Flight Number | Arrival Travel Date | Arrival Travel Time | Arrival Airport |
 *    Passport | Visa / OCI | Aadhar Card
 *
 *    - "Local Indian": Yes/No, set by a tickbox on the form. Gates which
 *      document slots are shown — Locals see Aadhar Card only; foreigners
 *      see Passport + Visa / OCI.
 *    - "Travelling from Overseas" and "Travelling Domestically" are two
 *      mutually-exclusive Yes/No tickboxes on the form, only shown at all if
 *      the party's "Pickup" column is ticked. Ticking one greys out the
 *      other. The arrival flight fields are only filled in (and only
 *      required) if "Travelling from Overseas" is Yes. If "Travelling
 *      Domestically" is Yes instead, no arrival details are collected and the
 *      arrival fields are simply hidden (nothing is shown in their place). If
 *      "Pickup" isn't ticked, all of these columns are left blank.
 *
 *  On the FIRST submission to the sheet, the script auto-adds these columns
 *  right after "Arrival Airport", in this fixed order, all at once — so the
 *  layout never depends on which event someone happens to RSVP for first:
 *    Mehndi - Attending | Haldi - Attending | Sangeet - Attending |
 *    Vidhi - Attending | Tea ceremony - Attending | Dinner - Attending
 *  ...followed by Local Indian | Passport | Visa / OCI | Aadhar Card at the end.
 *
 *  Uploaded verification photos are saved into Drive under a folder called
 *  UPLOAD_FOLDER_NAME, with one SUBFOLDER PER GUEST — named after their
 *  "Name" column value (NOT "Full Name"), so the folder stays stable even if
 *  someone edits their Full Name later — no orphan folders pile up. Inside
 *  each guest's folder, there's a further subfolder per document type
 *  (Passport / Visa / OCI / Aadhar Card), e.g.
 *  UPLOAD_FOLDER_NAME/Guest Name/Passport/page1.jpg — so multi-page uploads
 *  for the same document stay grouped together. If a document type no
 *  longer applies to a guest (e.g. they switch their "Local Indian" status)
 *  or ends up with no files left in it, its entire subfolder is deleted from
 *  Drive, not just the files inside it — no empty/orphaned folders are left
 *  behind.
 *
 *  If "Pickup" is ticked for a party, guests must tick exactly one of
 *  "Travelling from overseas" or "Travelling domestically" to submit — the
 *  form will not let them submit with neither ticked.
 *
 *  Each document slot accepts up to MAX_FILES_PER_SLOT files (currently 5).
 *  The sheet cell for that slot stores one Drive link per line.
 *
 *  RE-VISITING THE FORM: when the party leader looks up their name again, the
 *  form comes back pre-filled with whatever was last submitted (so they can
 *  edit it instead of starting over). For privacy, previously uploaded
 *  attachments are shown as FILENAMES ONLY (no image preview, no direct
 *  link) — the leader can remove any of them (which deletes that file from
 *  Drive on the next submit) or add new ones alongside the existing ones.
 *
 * SECURITY NOTES:
 *  - Uploaded files are PRIVATE: they are never link-shared, so only you (the
 *    Drive owner) and anyone you explicitly share the folder with can open them.
 *    The Drive links stored in the sheet therefore only work for those people.
 *    Files uploaded by an EARLIER version of this script were link-shared; run
 *    RSVP > Make existing uploads private once to lock those down.
 *  - The browser never receives Drive URLs — only a file ID + filename for each
 *    stored file. On submit the browser sends back only the IDs it wants to
 *    keep, and those are matched against what THAT party's row already holds;
 *    anything else is ignored, so a request can never trash another file.
 *  - Every upload is checked on the server (real file signature, allow-listed
 *    type, size cap) BEFORE anything is written. Text going into the sheet is
 *    length-capped and neutralised so it can't be run as a spreadsheet formula.
 *  - Guest lookups and submissions are POST requests, so the UID never appears
 *    in a URL. Internal error details are logged, not sent to the browser.
 *
 * EVENT DATE/TIME — your sheet doesn't store these, so set them here:
 */
const EVENT_INFO = {
  'Mehndi':        '10 Dec 2026, 4:00 PM',
  'Haldi':         '11 Dec 2026, 10:00 AM',
  'Sangeet':       '11 Dec 2026, 7:00 PM',
  'Vidhi':         '12 Dec 2026, 9:00 AM',
  'Tea ceremony':  '12 Dec 2026, 10:00 AM',
  'Dinner':        '12 Dec 2026, 8:00 PM'
};

const EVENT_COLUMNS = ['Mehndi', 'Haldi', 'Sangeet', 'Vidhi', 'Tea ceremony', 'Dinner'];
const SHEET_NAME = 'Sheet1'; // change if your tab is named differently
const UPLOAD_FOLDER_NAME = 'RSVP Uploads - Han Seng & Tanaaz';
const UID_LENGTH = 10;
const UID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 chars; no I/O/0/1 so codes are easy to read out. 32^10 ≈ 1.1e15 combinations.
const MAX_FILE_BYTES = 10 * 1024 * 1024; // per uploaded file, measured after decoding (keep in sync with MAX_FILE_BYTES in app.js)
const MAX_TEXT_LENGTH = 200;             // cap on every free-text value written to the sheet
const ALLOWED_UPLOAD_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'application/pdf': 'pdf' };
const GENERIC_ERROR = 'Something went wrong on our side. Please try again, or contact Han Seng or Tanaaz.';
const MAX_FILES_PER_SLOT = 5; // per document type (Passport / Visa / OCI / Aadhar Card), matches the form's limit

/** GET is no longer used for anything: guest lookups carry the UID, so they are
 *  POST requests (a GET would put the UID in the URL, browser history and logs). */
function doGet(e) {
  return jsonResponse({ error: 'Unknown action' });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'getParty') return jsonResponse(getPartyByUid(body.uid));
    if (body.action === 'submit')   return jsonResponse(submitRsvp(body));
    return jsonResponse({ error: 'Unknown action' });
  } catch (err) {
    // Details go to the Apps Script execution log, never to the browser.
    console.error(err && err.stack ? err.stack : err);
    return jsonResponse({ error: GENERIC_ERROR });
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error(`Could not find a tab named "${SHEET_NAME}". Check SHEET_NAME in Code.gs.`);
  return sheet;
}

function getHeaders(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
}

function colIndex(headers, name) {
  return headers.indexOf(name); // 0-based; -1 if not found
}

/** Returns the 0-based column index for `name`, creating the column if missing. */
function ensureColumn(sheet, headers, name) {
  let idx = colIndex(headers, name);
  if (idx !== -1) return idx;
  const newColPos = headers.length + 1; // 1-based position for the new column
  sheet.getRange(1, newColPos).setValue(name);
  headers.push(name);
  return headers.length - 1;
}

function findRowByName(sheet, headers, name) {
  const nameCol = colIndex(headers, 'Name');
  if (nameCol === -1) throw new Error('Sheet is missing a "Name" column.');
  const data = sheet.getDataRange().getValues();
  const search = String(name).trim().toLowerCase();
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][nameCol]).trim().toLowerCase() === search) {
      return { rowNum: r + 1, rowData: data[r] }; // rowNum is 1-based sheet row
    }
  }
  return null;
}

/** UIDs are compared trimmed and case-insensitively (stored uppercase). */
function normaliseUid(v) {
  return String(v == null ? '' : v).trim().toUpperCase();
}

function isValidUidFormat(uid) {
  return new RegExp('^[A-Z0-9]{' + UID_LENGTH + '}$').test(uid);
}

/** Every row whose "UID" matches — i.e. every member of that party. */
function findRowsByUid(sheet, headers, uid) {
  const uidCol = colIndex(headers, 'UID');
  if (uidCol === -1) throw new Error('Sheet is missing a "UID" column.');
  const data = sheet.getDataRange().getValues();
  const rows = [];
  for (let r = 1; r < data.length; r++) {
    if (normaliseUid(data[r][uidCol]) === uid) {
      rows.push({ rowNum: r + 1, rowData: data[r] });
    }
  }
  return rows;
}

/** True if a party-level tickbox column (TRUE / "Yes" / "True") is set on
 *  at least one row belonging to the party — same union logic used for the
 *  event invite columns, reused here for any other party-level flag. */
function partyFlagIsSet(partyRows, headers, colName) {
  const c = colIndex(headers, colName);
  if (c === -1) return false;
  return partyRows.some(r => {
    const val = r.rowData[c];
    return val === true || String(val).trim().toLowerCase() === 'yes' || String(val).trim().toLowerCase() === 'true';
  });
}

/** Soft brute-force brake: counts recent failed lookups (shared across all
 *  visitors, ~10 min window) and, once there are more than a handful, makes each
 *  further failure wait a little longer. It never locks anyone out, so a
 *  stranger can't use it to block your real guests. With 32^10 possible codes,
 *  guessing isn't realistic anyway — this just removes any incentive to try. */
function slowDownAfterFailedLookups_() {
  try {
    const cache = CacheService.getScriptCache();
    const n = Number(cache.get('uidFails') || 0) + 1;
    cache.put('uidFails', String(n), 600);
    if (n > 10) Utilities.sleep(Math.min((n - 10) * 150, 3000));
  } catch (err) {
    console.error(err);
  }
}

/** Look up the typed UID and return every member of that party plus the
 *  party's invited events. The UID is the only credential: anyone holding it
 *  may fill in the form for the whole party. */
function getPartyByUid(typedUid) {
  const uid = normaliseUid(typedUid);
  if (!uid) return { status: 'error', error: 'Please enter your invitation code.' };

  // Wrong-format and unknown codes get the same message, so nothing about the
  // code format or the guest list leaks.
  const notFound = () => {
    slowDownAfterFailedLookups_();
    return {
      status: 'not_found',
      error: 'We could not find that invitation code. Please check it and try again, or contact Han Seng or Tanaaz.'
    };
  };
  if (!isValidUidFormat(uid)) return notFound();

  const sheet = getSheet();
  const headers = getHeaders(sheet);
  const partyRows = findRowsByUid(sheet, headers, uid);
  if (!partyRows.length) return notFound();

  const nameCol = colIndex(headers, 'Name');
  const pocCol = colIndex(headers, 'POC');
  if (nameCol === -1) throw new Error('Sheet is missing a "Name" column.');

  // Leader name is display-only now. Fall back to the first member if POC is blank.
  let leaderName = '';
  if (pocCol !== -1) {
    for (const r of partyRows) {
      const v = String(r.rowData[pocCol] || '').trim();
      if (v) { leaderName = v; break; }
    }
  }
  if (!leaderName) leaderName = String(partyRows[0].rowData[nameCol]).trim();

  // Event invites are at the PARTY level — union the tickboxes across every row in the party.
  const invitedEvents = EVENT_COLUMNS.filter(eventName => partyFlagIsSet(partyRows, headers, eventName))
    .map(eventName => ({ name: eventName, dateTime: EVENT_INFO[eventName] || '' }));

  // "Pickup" is also a party-level, internal-only flag: it never reaches the
  // website as a column, but it gates whether the overseas travel/arrival
  // block is shown on the form at all.
  const pickupRequired = partyFlagIsSet(partyRows, headers, 'Pickup');

  const guests = partyRows.map(r => ({
    name: String(r.rowData[nameCol]).trim(),
    invitedEvents: invitedEvents,
    savedData: buildSavedData(r.rowData, headers, invitedEvents)
  }));

  return { status: 'ok', matchedName: leaderName, guests: guests, pickupRequired: pickupRequired };
}

/** Whatever's already in this guest's row, shaped for the form to pre-fill with. */
function buildSavedData(rowData, headers, invitedEvents) {
  const rawGet = colName => {
    const c = colIndex(headers, colName);
    return c === -1 ? '' : rowData[c];
  };
  const get = colName => String(rawGet(colName) || '').trim();

  // Sheets sometimes auto-converts date/time-looking strings into real Date
  // objects — <input type="date"/"time"> needs an exact "YYYY-MM-DD" /
  // "HH:MM" string, so reformat if that happened.
  const getDate = colName => {
    const v = rawGet(colName);
    if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    return String(v || '').trim();
  };
  const getTime = colName => {
    const v = rawGet(colName);
    if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'HH:mm');
    return String(v || '').trim();
  };

  const attendance = {};
  invitedEvents.forEach(ev => {
    attendance[ev.name] = get(`${ev.name} - Attending`);
  });

  // Return each document slot as an array so the form can show every
  // existing file (filename + ✕) for that slot, not just the first one.
  // Only { id, fileName } goes to the browser — never the Drive URL. (Files are
  // private anyway; this just means no link leaves the server.) Cell lines that
  // aren't a real Drive file link (e.g. a failed upload marker) are left out.
  const makeSlot = colName => {
    const out = [];
    getLinksFromCell(rawGet(colName)).forEach(url => {
      const id = extractDriveFileId(url);
      if (id) out.push({ id: id, fileName: getFileNameFromUrl(url) });
    });
    return out;
  };

  return {
    attendingWedding: get('Attending Wedding'),
    fullName: get('Full Name'),
    phone: get('Phone Number'),
    localIndian: get('Local Indian'),
    travellingOverseas: get('Travelling from Overseas'),
    travellingDomestically: get('Travelling Domestically'),
    arrivalFlightNumber: get('Arrival Flight Number'),
    arrivalDate: getDate('Arrival Travel Date'),
    arrivalTime: getTime('Arrival Travel Time'),
    arrivalAirport: get('Arrival Airport'),
    attendance: attendance,
    passport:   makeSlot('Passport'),
    visaOci:    makeSlot('Visa / OCI'),
    aadharCard: makeSlot('Aadhar Card')
  };
}

/**
 * Expected payload:
 * {
 *   uid,                     // the party's UID — re-verified here; every guest.name must belong to this party
 *   guests: [
 *     {
 *       name,                  // must match the "Name" column exactly (as returned by getParty)
 *       fullName, phone,
 *       travellingOverseas,    // "Yes" or "No"
 *       arrivalFlightNumber, arrivalDate, arrivalTime, arrivalAirport,  // only present/used if travellingOverseas === "Yes"
 *       attendance: { "Mehndi": "Yes", "Haldi": "No" },   // only invited events
 *       docSlots: { "Passport": { existingIds: ["<Drive file id>", ...],   // stored files the user chose to KEEP
 *                                 newFiles: [{ name, base64 }, ...] } }   // newly added files
 *     }, ...
 *   ]
 * }
 */
function submitRsvp(payload) {
  if (!payload || !payload.guests || !payload.guests.length) {
    return { error: 'No RSVP data received.' };
  }

  // The UID is re-checked on every submit. Without a valid UID nothing is
  // written, and (below) only rows belonging to THAT UID's party can be edited.
  const uid = normaliseUid(payload.uid);
  if (!isValidUidFormat(uid)) {
    return { error: 'Your invitation code is missing or invalid. Please return to the homepage and enter it again.' };
  }

  // Check every uploaded file BEFORE writing anything, so a bad file can't
  // leave the sheet half-updated. On success each file object gains _bytes/_type.
  const uploadError = validateUploads(payload);
  if (uploadError) return { error: uploadError };

  const sheet = getSheet();
  let headers = getHeaders(sheet);
  const folder = getOrCreateUploadFolder();

  // Fix the column structure up front, in order, so it never depends on
  // which events happen to be submitted first: all "<Event> - Attending"
  // columns (in EVENT_COLUMNS order) come right after the arrival info,
  // then the three document columns and Local Indian at the very end.
  EVENT_COLUMNS.forEach(eventName => {
    ensureColumn(sheet, headers, `${eventName} - Attending`);
  });
  ['Local Indian', 'Passport', 'Visa / OCI', 'Aadhar Card', 'Travelling Domestically', 'Attending Wedding'].forEach(colName => {
    ensureColumn(sheet, headers, colName);
  });

  // Read the party AFTER the columns above exist, so row data is full width.
  const partyRows = findRowsByUid(sheet, headers, uid);
  if (!partyRows.length) {
    return { error: 'We could not verify your invitation code. Please return to the homepage and enter it again.' };
  }
  const pickupRequired = partyFlagIsSet(partyRows, headers, 'Pickup');
  // Only events this party is actually invited to can be written to.
  const invitedEventNames = EVENT_COLUMNS.filter(name => partyFlagIsSet(partyRows, headers, name));

  payload.guests.forEach(guest => {
    // Only rows inside this UID's party can be written to — a name that
    // belongs to any other party is silently skipped.
    const guestKey = String(guest.name || '').trim().toLowerCase();
    const match = partyRows.find(r => String(r.rowData[colIndex(headers, 'Name')]).trim().toLowerCase() === guestKey);
    if (!match) return;
    const rowNum = match.rowNum;

    // "Can this person attend the wedding at all?" Anything other than an
    // explicit Yes is treated as No: the row is marked as not attending, every
    // invited event is set to No, and all other answers (and any uploaded ID
    // documents) are cleared, so nothing personal is kept for someone who isn't coming.
    if (String(guest.attendingWedding || '').trim().toLowerCase() !== 'yes') {
      writeCell(sheet, headers, rowNum, 'Attending Wedding', 'No');
      ['Full Name', 'Phone Number', 'Local Indian', 'Travelling from Overseas', 'Travelling Domestically',
       'Arrival Flight Number', 'Arrival Travel Date', 'Arrival Travel Time', 'Arrival Airport'
      ].forEach(colName => writeCell(sheet, headers, rowNum, colName, ''));
      invitedEventNames.forEach(eventName => writeCell(sheet, headers, rowNum, `${eventName} - Attending`, 'No'));

      const declinerFolder = getOrCreatePersonFolder(folder, String(match.rowData[colIndex(headers, 'Name')]).trim());
      ['Passport', 'Visa / OCI', 'Aadhar Card'].forEach(slotName => {
        getLinksFromCell(getPreviousSlotUrl(match.rowData, headers, slotName)).forEach(url => {
          const id = extractDriveFileId(url);
          if (id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (e) {} }
        });
        trashSlotFolder(declinerFolder, slotName);
        writeCell(sheet, headers, rowNum, slotName, '');
      });
      return;
    }
    writeCell(sheet, headers, rowNum, 'Attending Wedding', 'Yes');

    writeCell(sheet, headers, rowNum, 'Full Name', cleanText(guest.fullName));
    writeCell(sheet, headers, rowNum, 'Phone Number', cleanText(guest.phone, 40));
    writeCell(sheet, headers, rowNum, 'Local Indian', yesNo(guest.localIndian));

    // "Pickup" gates the whole overseas/arrival block. It comes from the
    // sheet (via the verified UID's party), never from the payload, so the
    // columns stay blank even if something odd came in from the browser.
    const isOverseas = pickupRequired && String(guest.travellingOverseas || '').trim().toLowerCase() === 'yes';
    const isDomestic = pickupRequired && !isOverseas && String(guest.travellingDomestically || '').trim().toLowerCase() === 'yes';
    writeCell(sheet, headers, rowNum, 'Travelling from Overseas', pickupRequired ? (isOverseas ? 'Yes' : 'No') : '');
    writeCell(sheet, headers, rowNum, 'Travelling Domestically', pickupRequired ? (isDomestic ? 'Yes' : 'No') : '');
    writeCell(sheet, headers, rowNum, 'Arrival Flight Number', isOverseas ? cleanText(guest.arrivalFlightNumber, 20) : '');
    writeCell(sheet, headers, rowNum, 'Arrival Travel Date', isOverseas ? cleanText(guest.arrivalDate, 20) : '');
    // Time is entered and stored in IST (the form says so explicitly).
    writeCell(sheet, headers, rowNum, 'Arrival Travel Time', isOverseas ? cleanText(guest.arrivalTime, 20) : '');
    writeCell(sheet, headers, rowNum, 'Arrival Airport', isOverseas ? cleanText(guest.arrivalAirport) : '');

    // Attendance per event -> auto-created "<Event> - Attending" columns
    // Event names come from the sheet (never from the browser) and values must be
    // exactly Yes/No, so nothing the browser sends can create columns or odd values.
    invitedEventNames.forEach(eventName => {
      const sent = guest.attendance && Object.prototype.hasOwnProperty.call(guest.attendance, eventName)
        ? String(guest.attendance[eventName]).trim().toLowerCase() : '';
      if (sent !== 'yes' && sent !== 'no') return;
      writeCell(sheet, headers, rowNum, `${eventName} - Attending`, sent === 'yes' ? 'Yes' : 'No');
    });

    // Document slots: Passport, Visa / OCI, Aadhar Card — each can now hold
    // up to MAX_FILES_PER_SLOT files. Each slot type gets its own Drive
    // subfolder inside the guest's personal folder (e.g. .../Guest Name/Passport/).
    // Kept existing files (by Drive file ID) are left untouched; any previously stored
    // file whose ID is no longer in the kept list was removed by the user
    // and gets trashed. New files are uploaded into that slot's subfolder.
    // The cell stores one URL per line, in existing-then-new order.
    // Folder is named from the sheet's own "Name" value, not whatever the browser sent.
    const personFolder = getOrCreatePersonFolder(folder, String(match.rowData[colIndex(headers, 'Name')]).trim());
    const DOC_SLOTS = ['Passport', 'Visa / OCI', 'Aadhar Card'];
    const isLocalIndian = String(guest.localIndian || '').trim().toLowerCase() === 'yes';
    // Slots that don't apply to this guest's current identity type are always
    // treated as empty server-side, regardless of what the client sent. This
    // is a safety net: even if the browser resubmits a stale existingUrl for
    // a slot that no longer applies (e.g. after switching Local Indian
    // status), the old file still gets trashed and the cell still gets
    // cleared, instead of the orphaned link lingering forever.
    const applicableSlots = isLocalIndian ? ['Aadhar Card'] : ['Passport', 'Visa / OCI'];

    DOC_SLOTS.forEach(slotName => {
      const slotApplies = applicableSlots.indexOf(slotName) !== -1;

      // Slot no longer applies at all for this guest (e.g. they switched
      // Local Indian status) — remove its entire subfolder, including every
      // file inside it, rather than leaving an empty/orphaned folder behind.
      if (!slotApplies) {
        trashSlotFolder(personFolder, slotName);
        writeCell(sheet, headers, rowNum, slotName, '');
        return;
      }

      const slot = (guest.docSlots || {})[slotName] || {};

      // The browser only says WHICH stored files to keep, by file ID. Those IDs
      // are matched against what THIS row already has in the sheet, so a made-up
      // or foreign ID is simply ignored — and only files already stored in this
      // row can ever be trashed. Stored files not listed as kept were removed by
      // the user and are trashed.
      const keptIds = Array.isArray(slot.existingIds) ? slot.existingIds.map(String) : [];
      const prevUrls = getLinksFromCell(getPreviousSlotUrl(match.rowData, headers, slotName));
      const keptUrls = [];
      prevUrls.forEach(prevUrl => {
        const id = extractDriveFileId(prevUrl);
        if (!id) return; // not a real Drive link (e.g. an old failed-upload marker): drop it
        if (keptIds.indexOf(id) !== -1) {
          keptUrls.push(prevUrl);
        } else {
          try { DriveApp.getFileById(id).setTrashed(true); } catch (e) {}
        }
      });

      let newFilesData = Array.isArray(slot.newFiles) ? slot.newFiles : [];
      // Server-side safety net matching the form's MAX_FILES_PER_SLOT cap
      const remainingSlots = Math.max(MAX_FILES_PER_SLOT - keptUrls.length, 0);
      newFilesData = newFilesData.slice(0, remainingSlots);

      const finalUrls = keptUrls.slice();
      if (newFilesData.length) {
        const slotFolder = getOrCreateSlotFolder(personFolder, slotName);
        newFilesData.forEach(newFileData => {
          if (!newFileData || !newFileData._bytes) return; // set by validateUploads()
          try {
            // Name and type come from the file's REAL content (validateUploads), not the browser's claim.
            const stem = cleanFileName(newFileData.name).replace(/\.[^.]*$/, '') || 'upload';
            const fileName = stem + '.' + ALLOWED_UPLOAD_TYPES[newFileData._type];
            const blob = Utilities.newBlob(newFileData._bytes, newFileData._type, fileName);
            const driveFile = slotFolder.createFile(blob);
            // Files stay PRIVATE. (Previously this was ANYONE_WITH_LINK.) Set
            // explicitly so a file can't inherit link-sharing from its folder.
            try { driveFile.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE); } catch (shareErr) { console.error(shareErr); }
            finalUrls.push(driveFile.getUrl());
          } catch (fileErr) {
            console.error(fileErr);
            finalUrls.push('UPLOAD FAILED: ' + slotName);
          }
        });
      }

      // If every file was removed and none were added, the slot folder is
      // now empty — remove it entirely rather than leaving an empty folder.
      if (!finalUrls.length) {
        trashSlotFolder(personFolder, slotName);
      }

      writeCell(sheet, headers, rowNum, slotName, finalUrls.join('\n'));
    });
  });

  return { success: true };
}

function writeCell(sheet, headers, rowNum, colName, value) {
  const col = ensureColumn(sheet, headers, colName);
  const cell = sheet.getRange(rowNum, col + 1);
  const text = value == null ? '' : String(value);
  // Anything that could be read as a formula (=, +, -, @ at the start) is stored
  // as plain TEXT instead, so guest-typed input can never run as a spreadsheet
  // formula (e.g. =IMPORTXML(...)). Also stops a phone number's leading "+" being lost.
  if (/^[=+\-@]/.test(text)) cell.setNumberFormat('@');
  cell.setValue(text);
}

/** Free text from the browser: control characters/newlines removed, trimmed, length-capped. */
function cleanText(value, maxLen) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .trim()
    .slice(0, maxLen || MAX_TEXT_LENGTH);
}

function yesNo(value) {
  return String(value == null ? '' : value).trim().toLowerCase() === 'yes' ? 'Yes' : 'No';
}

/** A safe display/storage file name: no paths, only simple characters, max 80 chars. */
function cleanFileName(name) {
  const base = String(name == null ? '' : name).split(/[\\/]/).pop()
    .replace(/[^\w.\- ()]/g, '_').trim().slice(0, 80);
  return base || 'upload';
}

/** Works out what a file REALLY is from its first bytes (the browser's claimed
 *  type and the file extension are ignored). Returns a key of
 *  ALLOWED_UPLOAD_TYPES, or null if it isn't an allowed type. */
function sniffUploadType(bytes) {
  if (!bytes || bytes.length < 12) return null;
  const b = i => bytes[i] & 0xFF; // Apps Script bytes are signed
  const ascii = (start, len) => {
    let s = '';
    for (let i = start; i < start + len; i++) s += String.fromCharCode(b(i));
    return s;
  };
  if (b(0) === 0xFF && b(1) === 0xD8 && b(2) === 0xFF) return 'image/jpeg';
  if (b(0) === 0x89 && ascii(1, 3) === 'PNG') return 'image/png';
  if (ascii(0, 4) === '%PDF') return 'application/pdf';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'image/webp';
  if (ascii(4, 4) === 'ftyp' &&
      ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].indexOf(ascii(8, 4)) !== -1) return 'image/heic';
  return null;
}

/** Decodes and checks every newly uploaded file in the payload. Returns an
 *  error message for the guest, or null if all files are fine. */
function validateUploads(payload) {
  const slotNames = ['Passport', 'Visa / OCI', 'Aadhar Card'];
  for (const guest of payload.guests) {
    const slots = (guest && guest.docSlots) || {};
    for (const slotName of slotNames) {
      const slot = slots[slotName];
      if (!slot || !Array.isArray(slot.newFiles)) continue;
      for (const f of slot.newFiles) {
        if (!f || !f.base64) continue;
        const label = cleanFileName(f.name);
        let bytes;
        try { bytes = Utilities.base64Decode(String(f.base64)); }
        catch (err) { return '"' + label + '" could not be read. Please remove it and add it again.'; }
        if (bytes.length > MAX_FILE_BYTES) {
          return '"' + label + '" is larger than ' + Math.round(MAX_FILE_BYTES / 1048576) + ' MB. Please upload a smaller file.';
        }
        const type = sniffUploadType(bytes);
        if (!type) {
          return '"' + label + '" is not a supported file type. Please upload a JPG, PNG, WebP, HEIC or PDF.';
        }
        f._bytes = bytes;
        f._type = type;
        f.base64 = null; // free memory; the decoded bytes are what get saved
      }
    }
  }
  return null;
}

/** Pulls the file ID out of a Drive file URL as produced by file.getUrl().
 *  Deliberately strict: any other text (e.g. a failed-upload marker that
 *  happens to contain a long word) must never be treated as a file ID. */
function extractDriveFileId(url) {
  const match = String(url || '').trim().match(/^https:\/\/drive\.google\.com\/file\/d\/([-\w]{25,})(?:[\/?#]|$)/);
  return match ? match[1] : null;
}

/** Best-effort filename lookup for a stored Drive link; falls back gracefully. */
function getFileNameFromUrl(url) {
  const id = extractDriveFileId(url);
  if (!id) return 'Attachment';
  try {
    return DriveApp.getFileById(id).getName();
  } catch (err) {
    return 'Attachment (file may have been moved or deleted)';
  }
}

/** Returns the Drive URL currently stored for a specific doc slot column, or '' if empty. */
function getPreviousSlotUrl(rowData, headers, colName) {
  const c = colIndex(headers, colName);
  if (c === -1) return '';
  return String(rowData[c] || '').trim();
}

/** Splits a cell value into an array of non-empty strings (handles newline-separated values). */
function getLinksFromCell(cellValue) {
  if (!cellValue) return [];
  return String(cellValue).split('\n').map(s => s.trim()).filter(Boolean);
}

function getOrCreateUploadFolder() {
  const folders = DriveApp.getFoldersByName(UPLOAD_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(UPLOAD_FOLDER_NAME);
}

/** Each guest gets their own subfolder (by name) inside the main upload folder. */
function getOrCreatePersonFolder(parentFolder, personName) {
  const safeName = String(personName || 'Guest').trim() || 'Guest';
  const existing = parentFolder.getFoldersByName(safeName);
  if (existing.hasNext()) return existing.next();
  return parentFolder.createFolder(safeName);
}

/** Within a guest's folder, each document type (Passport, Visa / OCI, Aadhar
 *  Card) gets its own subfolder, so multi-page uploads for that document
 *  stay grouped together, e.g. .../Guest Name/Passport/page1.jpg. */
function getOrCreateSlotFolder(personFolder, slotName) {
  const existing = personFolder.getFoldersByName(slotName);
  if (existing.hasNext()) return existing.next();
  return personFolder.createFolder(slotName);
}

/** Trashes a guest's slot subfolder (and everything inside it), if it exists.
 *  Used when a document type no longer applies to the guest (e.g. they
 *  switched Local Indian status) or ends up with no files left in it — so no
 *  empty/orphaned folder is left behind in Drive. */
function trashSlotFolder(personFolder, slotName) {
  const existing = personFolder.getFoldersByName(slotName);
  while (existing.hasNext()) {
    try { existing.next().setTrashed(true); } catch (e) {}
  }
}

// ============================================================
// UID generation
// ============================================================

/** Adds an "RSVP" menu to the sheet. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('RSVP')
    .addItem('Generate missing UIDs', 'generateMissingUids')
    .addItem('Make existing uploads private', 'makeExistingUploadsPrivate')
    .addToUi();
}

/** One cryptographically-random UID character per call (256 % 32 == 0, so no modulo bias). */
function randomUid_() {
  let s = '';
  for (let i = 0; i < UID_LENGTH; i++) {
    const byte = parseInt(Utilities.getUuid().substring(0, 2), 16);
    s += UID_ALPHABET.charAt(byte % UID_ALPHABET.length);
  }
  return s;
}

/**
 * Gives every party one unique 10-character UID, written onto every row of
 * that party. Safe to re-run: rows that already have a UID are never changed,
 * and new rows with the same "Party name" as an existing party reuse its UID.
 * Creates the "UID" column at the far left of the sheet if it doesn't exist.
 * Rows with a blank "Party name" each get their own UID.
 */
function generateMissingUids() {
  const sheet = getSheet();
  let headers = getHeaders(sheet);

  if (colIndex(headers, 'UID') === -1) {
    sheet.insertColumnBefore(1);
    sheet.getRange(1, 1).setValue('UID');
    headers = getHeaders(sheet);
  }
  const uidCol = colIndex(headers, 'UID');
  const partyCol = colIndex(headers, 'Party name');
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  // Plain-text format first, so Sheets never reinterprets a code as a number/date.
  const uidRange = sheet.getRange(2, uidCol + 1, lastRow - 1, 1);
  uidRange.setNumberFormat('@');

  const data = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getValues();
  const used = {};      // every UID already in the sheet
  const byParty = {};   // party label -> its UID
  const partyKey = r => {
    const p = partyCol === -1 ? '' : String(data[r][partyCol] || '').trim().toLowerCase();
    return p ? 'party:' + p : 'row:' + r;
  };

  for (let r = 1; r < data.length; r++) {
    const uid = normaliseUid(data[r][uidCol]);
    if (uid) {
      used[uid] = true;
      if (!byParty[partyKey(r)]) byParty[partyKey(r)] = String(data[r][uidCol]).trim();
    }
  }

  let created = 0;
  const out = [];
  for (let r = 1; r < data.length; r++) {
    const existing = String(data[r][uidCol] || '').trim();
    if (existing) { out.push([existing]); continue; }

    const key = partyKey(r);
    if (!byParty[key]) {
      let fresh;
      do { fresh = randomUid_(); } while (used[fresh]);
      used[fresh] = true;
      byParty[key] = fresh;
      created++;
    }
    out.push([byParty[key]]);
  }

  uidRange.setValues(out);
  SpreadsheetApp.getActiveSpreadsheet().toast(created + ' new UID(s) created.', 'RSVP', 5);
}

// ============================================================
// One-time clean-up for files uploaded by the earlier version
// ============================================================

/**
 * Earlier versions made every uploaded file "anyone with the link can view".
 * This switches every file (and folder) under the upload folder back to
 * PRIVATE. Run it once after deploying this version; it is safe to re-run.
 * It does not remove people you have shared the folder with by email.
 */
function makeExistingUploadsPrivate() {
  const root = getOrCreateUploadFolder();
  let fileCount = 0;
  const lock = target => {
    try { target.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE); return true; }
    catch (err) { console.error(err); return false; }
  };
  const walk = folder => {
    lock(folder);
    const files = folder.getFiles();
    while (files.hasNext()) { if (lock(files.next())) fileCount++; }
    const subfolders = folder.getFolders();
    while (subfolders.hasNext()) walk(subfolders.next());
  };
  walk(root);
  SpreadsheetApp.getActiveSpreadsheet().toast(fileCount + ' file(s) set to private.', 'RSVP', 5);
}

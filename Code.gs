/**
 * RSVP backend for Han Seng & Tanaaz's wedding.
 *
 * YOUR SHEET (tab name set in SHEET_NAME below) — ONE ROW PER PERSON:
 *
 *  Readable (you pre-fill these before sharing the site):
 *    Name | Party name | POC | Pickup | Mehndi | Haldi | Sangeet | Vidhi | Tea ceremony | Dinner
 *
 *    - "Name": that row's person, exactly as they'll type it on the site.
 *    - "Party name": a SHARED label/ID for the group — put the exact same
 *      value on every row that belongs to the same party (e.g. "Mehta
 *      Family" on every row for that family). This is NOT a list of names
 *      anymore — everyone with the same Party name is grouped together.
 *    - "POC": the name of the party leader for that party — put the SAME
 *      value (the leader's exact Name) on every row in that party. ONLY the
 *      person whose own Name matches the POC value can open the RSVP form
 *      and fill it in for the whole party. Everyone else in the party who
 *      tries gets redirected to a "please ask your party leader" page.
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
 *    - "Travelling from Overseas" is a Yes/No tickbox on the form, only
 *      shown at all if the party's "Pickup" column is ticked. The arrival
 *      flight fields are only filled in (and only required) if that's Yes —
 *      otherwise (or if "Pickup" isn't ticked) they're left blank.
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
 *  someone edits their Full Name later — no orphan folders pile up.
 *
 *  If a guest uploads MORE than 3 verification photos, photos 4+ get appended
 *  into the "Identification 3" cell (one link per line) so nothing is lost.
 *
 *  RE-VISITING THE FORM: when the party leader looks up their name again, the
 *  form comes back pre-filled with whatever was last submitted (so they can
 *  edit it instead of starting over). For privacy, previously uploaded
 *  attachments are shown as FILENAMES ONLY (no image preview, no direct
 *  link) — the leader can remove any of them (which deletes that file from
 *  Drive on the next submit) or add new ones alongside the existing ones.
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

function doGet(e) {
  try {
    const action = e.parameter.action;
    if (action === 'getParty') {
      return jsonResponse(getPartyByName(e.parameter.name));
    }
    return jsonResponse({ error: 'Unknown action' });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    return jsonResponse(submitRsvp(body));
  } catch (err) {
    return jsonResponse({ error: err.message });
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

/** Every row whose "Party name" matches (case/space-insensitive). */
function findRowsByPartyName(sheet, headers, partyName) {
  const partyCol = colIndex(headers, 'Party name');
  if (partyCol === -1) throw new Error('Sheet is missing a "Party name" column.');
  const data = sheet.getDataRange().getValues();
  const search = String(partyName).trim().toLowerCase();
  const rows = [];
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][partyCol]).trim().toLowerCase() === search) {
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

/** Look up the typed name, find everyone sharing the same Party name, and
 *  check whether the typed name is that party's designated leader (POC). */
function getPartyByName(typedName) {
  if (!typedName) return { status: 'error', error: 'Please enter a name.' };

  const sheet = getSheet();
  const headers = getHeaders(sheet);
  const match = findRowByName(sheet, headers, typedName);

  if (!match) {
    return {
      status: 'not_found',
      error: 'We could not find that name on the guest list. Please check the spelling or contact Han Seng or Tanaaz.'
    };
  }

  const nameCol = colIndex(headers, 'Name');
  const partyCol = colIndex(headers, 'Party name');
  const pocCol = colIndex(headers, 'POC');
  const ownName = String(match.rowData[nameCol]).trim();
  const partyName = partyCol !== -1 ? String(match.rowData[partyCol] || '').trim() : '';

  if (!partyName) {
    return { status: 'error', error: 'Your party name is not set up yet. Please contact Han Seng or Tanaaz.' };
  }

  const partyRows = findRowsByPartyName(sheet, headers, partyName);
  let leaderName = '';
  if (pocCol !== -1) {
    for (const r of partyRows) {
      const v = String(r.rowData[pocCol] || '').trim();
      if (v) { leaderName = v; break; }
    }
  }

  if (!leaderName) {
    return { status: 'error', error: 'Your party leader is not set up yet. Please contact Han Seng or Tanaaz.' };
  }

  if (ownName.toLowerCase() !== leaderName.toLowerCase()) {
    return { status: 'not_leader', leaderName: leaderName };
  }

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

  if (!guests.length) {
    return { status: 'error', error: 'We found your name, but could not resolve your party. Please contact Han Seng or Tanaaz.' };
  }

  return { status: 'ok', matchedName: ownName, guests: guests, pickupRequired: pickupRequired };
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

  // Return each document slot independently so the form can show existing
  // filename + ✕ (or an upload button if empty) for each one separately.
  const makeSlot = colName => {
    const links = getLinksFromCell(rawGet(colName));
    if (!links.length) return null;
    const url = links[0];
    return { url: url, fileName: getFileNameFromUrl(url) };
  };

  return {
    fullName: get('Full Name'),
    phone: get('Phone Number'),
    localIndian: get('Local Indian'),
    travellingOverseas: get('Travelling from Overseas'),
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
 *   guests: [
 *     {
 *       name,                  // must match the "Name" column exactly (as returned by getParty)
 *       fullName, phone,
 *       travellingOverseas,    // "Yes" or "No"
 *       arrivalFlightNumber, arrivalDate, arrivalTime, arrivalAirport,  // only present/used if travellingOverseas === "Yes"
 *       attendance: { "Mehndi": "Yes", "Haldi": "No" },   // only invited events
 *       existingFiles: ["https://drive.google.com/...", ...],  // previously uploaded links the user chose to KEEP
 *       files: [{ name, mimeType, base64 }, ...]          // newly added files (any number)
 *     }, ...
 *   ]
 * }
 */
function submitRsvp(payload) {
  if (!payload || !payload.guests || !payload.guests.length) {
    return { error: 'No RSVP data received.' };
  }

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
  ['Local Indian', 'Passport', 'Visa / OCI', 'Aadhar Card'].forEach(colName => {
    ensureColumn(sheet, headers, colName);
  });

  payload.guests.forEach(guest => {
    const match = findRowByName(sheet, headers, guest.name);
    if (!match) return; // skip unknown guest rows defensively
    const rowNum = match.rowNum;

    writeCell(sheet, headers, rowNum, 'Full Name', guest.fullName || '');
    writeCell(sheet, headers, rowNum, 'Phone Number', guest.phone || '');
    writeCell(sheet, headers, rowNum, 'Local Indian', guest.localIndian || '');

    // "Pickup" gates the whole overseas/arrival block. This is re-checked
    // here from the sheet itself (not trusted from the payload) so the
    // columns stay blank even if something odd came in from the browser.
    const pickupRequired = isPickupRequiredForRow(sheet, headers, match.rowData);
    const isOverseas = pickupRequired && String(guest.travellingOverseas || '').trim().toLowerCase() === 'yes';
    writeCell(sheet, headers, rowNum, 'Travelling from Overseas', pickupRequired ? (isOverseas ? 'Yes' : 'No') : '');
    writeCell(sheet, headers, rowNum, 'Arrival Flight Number', isOverseas ? (guest.arrivalFlightNumber || '') : '');
    writeCell(sheet, headers, rowNum, 'Arrival Travel Date', isOverseas ? (guest.arrivalDate || '') : '');
    writeCell(sheet, headers, rowNum, 'Arrival Travel Time', isOverseas ? (guest.arrivalTime || '') : '');
    writeCell(sheet, headers, rowNum, 'Arrival Airport', isOverseas ? (guest.arrivalAirport || '') : '');

    // Attendance per event -> auto-created "<Event> - Attending" columns
    Object.keys(guest.attendance || {}).forEach(eventName => {
      const col = ensureColumn(sheet, headers, `${eventName} - Attending`);
      sheet.getRange(rowNum, col + 1).setValue(guest.attendance[eventName]);
    });

    // Document slots: Passport, Visa / OCI, Aadhar Card
    // Each slot accepts exactly one file. If the user kept the existing file
    // (existingUrl present, no newFile), write it back unchanged.
    // If they removed it (no existingUrl) and uploaded a new one, save that.
    // If they removed it and didn't upload anything, clear the cell.
    // Files removed by the user are trashed in Drive.
    const personFolder = getOrCreatePersonFolder(folder, guest.name);
    const DOC_SLOTS = ['Passport', 'Visa / OCI', 'Aadhar Card'];

    DOC_SLOTS.forEach(slotName => {
      const slot = (guest.docSlots || {})[slotName] || {};
      const keptUrl = slot.existingUrl || null;
      const newFileData = slot.newFile || null;

      // Trash any previously stored file for this slot that was removed
      const prevUrl = getPreviousSlotUrl(match.rowData, headers, slotName);
      if (prevUrl && prevUrl !== keptUrl) {
        const id = extractDriveFileId(prevUrl);
        if (id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (e) {} }
      }

      let finalUrl = keptUrl || '';
      if (newFileData && newFileData.base64) {
        try {
          const decoded = Utilities.base64Decode(newFileData.base64);
          const blob = Utilities.newBlob(decoded, newFileData.mimeType, newFileData.name);
          const driveFile = personFolder.createFile(blob);
          driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          finalUrl = driveFile.getUrl();
        } catch (fileErr) {
          finalUrl = 'UPLOAD FAILED: ' + (newFileData.name || slotName);
        }
      }

      writeCell(sheet, headers, rowNum, slotName, finalUrl);
    });
  });

  return { success: true };
}

function writeCell(sheet, headers, rowNum, colName, value) {
  const col = ensureColumn(sheet, headers, colName);
  sheet.getRange(rowNum, col + 1).setValue(value);
}

/** Pulls a Drive file ID out of a typical Drive share URL. */
function extractDriveFileId(url) {
  const match = String(url || '').match(/[-\w]{25,}/);
  return match ? match[0] : null;
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

/** Re-derives whether "Pickup" is set for the party that this specific row
 *  belongs to — used at submit time so the answer always comes fresh from
 *  the sheet itself, never from whatever the browser happened to send. */
function isPickupRequiredForRow(sheet, headers, rowData) {
  const partyCol = colIndex(headers, 'Party name');
  if (partyCol === -1) return false;
  const partyName = String(rowData[partyCol] || '').trim();
  if (!partyName) return false;
  const partyRows = findRowsByPartyName(sheet, headers, partyName);
  return partyFlagIsSet(partyRows, headers, 'Pickup');
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

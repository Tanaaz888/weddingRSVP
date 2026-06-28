/**
 * RSVP backend for Han Seng & Tanaaz's wedding.
 *
 * YOUR SHEET (tab name set in SHEET_NAME below) — ONE ROW PER PERSON:
 *
 *  Readable (you pre-fill these before sharing the site):
 *    Name | Party name | Mehndi | Haldi | Sangeet | Vidhi | Tea ceremony | Dinner
 *
 *    - "Name": that row's person, exactly as they'll type it on the site.
 *    - "Party name": comma-separated list of every name in their group
 *      (it's fine to include their own name in the list too).
 *    - Mehndi/Haldi/etc: tick = TRUE (checkbox) or "Yes" if the PARTY is
 *      invited to that event. Every person in the same party gets the same
 *      events to confirm — tick it on at least one row in the party and
 *      everyone in that party will see it (it's fine, and simplest, to tick
 *      it the same way on every row in the party).
 *
 *  Writable (the form fills these in — leave blank, just have the header):
 *    Full Name | Phone number | Travelling from overseas |
 *    Arrival Flight Number | Arrival Travel Date | Arrival Travel Time | Arrival Airport |
 *    Identification 1 | Identification 2 | Identification 3
 *
 *    - "Travelling from overseas" is a Yes/No tickbox on the form. The arrival
 *      flight fields are only filled in (and only required) if that's Yes —
 *      otherwise they're left blank.
 *
 *  The script will also AUTO-ADD these columns the first time someone submits:
 *    "<Event> - Attending"  (one per event, e.g. "Mehndi - Attending")
 *
 *  If a guest uploads MORE than 3 verification photos, photos 4+ get appended
 *  into the "Identification 3" cell (one link per line) so nothing is lost.
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

/** Find a party: look up the typed name, read their "Party name" cell, then
 *  resolve every name in that list to find which events each is invited to. */
function getPartyByName(typedName) {
  if (!typedName) return { error: 'Please enter a name.' };

  const sheet = getSheet();
  const headers = getHeaders(sheet);
  const match = findRowByName(sheet, headers, typedName);

  if (!match) {
    return { error: 'We could not find that name on the guest list. Please check the spelling or contact Han Seng or Tanaaz.' };
  }

  const partyNameCol = colIndex(headers, 'Party name');
  let partyNames = [];
  if (partyNameCol !== -1) {
    const raw = String(match.rowData[partyNameCol] || '');
    partyNames = raw.split(',').map(n => n.trim()).filter(Boolean);
  }
  // Always include the person who searched, even if "Party name" was left blank.
  const ownName = String(match.rowData[colIndex(headers, 'Name')]).trim();
  if (!partyNames.some(n => n.toLowerCase() === ownName.toLowerCase())) {
    partyNames.unshift(ownName);
  }

  // Event invites are at the PARTY level — union the tickboxes across every
  // row in the party, then every guest gets the same set of events to confirm.
  const invitedEvents = EVENT_COLUMNS.filter(eventName => {
    const c = colIndex(headers, eventName);
    if (c === -1) return false;
    return partyNames.some(name => {
      const m = findRowByName(sheet, headers, name);
      if (!m) return false;
      const val = m.rowData[c];
      return val === true || String(val).trim().toLowerCase() === 'yes' || String(val).trim().toLowerCase() === 'true';
    });
  }).map(eventName => ({ name: eventName, dateTime: EVENT_INFO[eventName] || '' }));

  const guests = [];
  partyNames.forEach(name => {
    const guestMatch = findRowByName(sheet, headers, name);
    if (!guestMatch) return; // skip names that don't resolve to a row
    guests.push({ name: name, invitedEvents: invitedEvents });
  });

  if (!guests.length) {
    return { error: 'We found your name, but could not resolve your party. Please contact Han Seng or Tanaaz.' };
  }

  return { matchedName: ownName, guests: guests };
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
 *       files: [{ name, mimeType, base64 }, ...]          // any number
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

  payload.guests.forEach(guest => {
    const match = findRowByName(sheet, headers, guest.name);
    if (!match) return; // skip unknown guest rows defensively
    const rowNum = match.rowNum;

    writeCell(sheet, headers, rowNum, 'Full Name', guest.fullName || '');
    writeCell(sheet, headers, rowNum, 'Phone number', guest.phone || '');

    const isOverseas = String(guest.travellingOverseas || '').trim().toLowerCase() === 'yes';
    writeCell(sheet, headers, rowNum, 'Travelling from overseas', isOverseas ? 'Yes' : 'No');
    writeCell(sheet, headers, rowNum, 'Arrival Flight Number', isOverseas ? (guest.arrivalFlightNumber || '') : '');
    writeCell(sheet, headers, rowNum, 'Arrival Travel Date', isOverseas ? (guest.arrivalDate || '') : '');
    writeCell(sheet, headers, rowNum, 'Arrival Travel Time', isOverseas ? (guest.arrivalTime || '') : '');
    writeCell(sheet, headers, rowNum, 'Arrival Airport', isOverseas ? (guest.arrivalAirport || '') : '');

    // Attendance per event -> auto-created "<Event> - Attending" columns
    Object.keys(guest.attendance || {}).forEach(eventName => {
      const col = ensureColumn(sheet, headers, `${eventName} - Attending`);
      sheet.getRange(rowNum, col + 1).setValue(guest.attendance[eventName]);
    });

    // Identification photos -> Identification 1 / 2 / 3 (overflow appended into #3)
    const links = [];
    (guest.files || []).forEach(file => {
      try {
        const decoded = Utilities.base64Decode(file.base64);
        const blob = Utilities.newBlob(decoded, file.mimeType, file.name);
        const safeName = (guest.fullName || guest.name || 'guest').replace(/[^a-z0-9]+/gi, '_');
        blob.setName(safeName + '_' + file.name);
        const driveFile = folder.createFile(blob);
        driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        links.push(driveFile.getUrl());
      } catch (fileErr) {
        links.push('UPLOAD FAILED: ' + file.name);
      }
    });

    ['Identification 1', 'Identification 2', 'Identification 3'].forEach(colName => {
      ensureColumn(sheet, headers, colName);
    });
    if (links.length > 0) writeCell(sheet, headers, rowNum, 'Identification 1', links[0] || '');
    if (links.length > 1) writeCell(sheet, headers, rowNum, 'Identification 2', links[1] || '');
    if (links.length > 2) writeCell(sheet, headers, rowNum, 'Identification 3', links.slice(2).join('\n'));
  });

  return { success: true };
}

function writeCell(sheet, headers, rowNum, colName, value) {
  const col = ensureColumn(sheet, headers, colName);
  sheet.getRange(rowNum, col + 1).setValue(value);
}

function getOrCreateUploadFolder() {
  const folders = DriveApp.getFoldersByName(UPLOAD_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(UPLOAD_FOLDER_NAME);
}

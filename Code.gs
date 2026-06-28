/**
 * RSVP backend for Han Seng & Tanaaz's wedding.
 *
 * YOUR SHEET (tab name set in SHEET_NAME below) — ONE ROW PER PERSON:
 *
 *  Readable (you pre-fill these before sharing the site):
 *    Name | Party name | POC | Mehndi | Haldi | Sangeet | Vidhi | Tea ceremony | Dinner
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
 *    - Mehndi/Haldi/etc: tick = TRUE (checkbox) or "Yes" if the PARTY is
 *      invited to that event. Every person in the same party gets the same
 *      events to confirm — tick it on at least one row in the party and
 *      everyone in that party will see it (it's fine, and simplest, to tick
 *      it the same way on every row in the party).
 *
 *  Writable (the form fills these in — leave blank, just have the header):
 *    Full Name | Phone Number | Travelling from Overseas |
 *    Arrival Flight Number | Arrival Travel Date | Arrival Travel Time | Arrival Airport |
 *    Identification 1 | Identification 2 | Identification 3
 *
 *    - "Travelling from Overseas" is a Yes/No tickbox on the form. The arrival
 *      flight fields are only filled in (and only required) if that's Yes —
 *      otherwise they're left blank.
 *
 *  On the FIRST submission to the sheet, the script auto-adds these columns
 *  right after "Arrival Airport", in this fixed order, all at once — so the
 *  layout never depends on which event someone happens to RSVP for first:
 *    Mehndi - Attending | Haldi - Attending | Sangeet - Attending |
 *    Vidhi - Attending | Tea ceremony - Attending | Dinner - Attending
 *  ...followed by Identification 1 / 2 / 3 at the very end.
 *
 *  Uploaded verification photos are saved into Drive under a folder called
 *  UPLOAD_FOLDER_NAME, with one SUBFOLDER PER GUEST (named after their full
 *  name) inside it — so everyone's photos are kept separate and easy to find.
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
  const invitedEvents = EVENT_COLUMNS.filter(eventName => {
    const c = colIndex(headers, eventName);
    if (c === -1) return false;
    return partyRows.some(r => {
      const val = r.rowData[c];
      return val === true || String(val).trim().toLowerCase() === 'yes' || String(val).trim().toLowerCase() === 'true';
    });
  }).map(eventName => ({ name: eventName, dateTime: EVENT_INFO[eventName] || '' }));

  const guests = partyRows.map(r => ({
    name: String(r.rowData[nameCol]).trim(),
    invitedEvents: invitedEvents
  }));

  if (!guests.length) {
    return { status: 'error', error: 'We found your name, but could not resolve your party. Please contact Han Seng or Tanaaz.' };
  }

  return { status: 'ok', matchedName: ownName, guests: guests };
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

  // Fix the column structure up front, in order, so it never depends on
  // which events happen to be submitted first: all "<Event> - Attending"
  // columns (in EVENT_COLUMNS order) come right after the arrival info,
  // then Identification 1/2/3 at the very end.
  EVENT_COLUMNS.forEach(eventName => {
    ensureColumn(sheet, headers, `${eventName} - Attending`);
  });
  ['Identification 1', 'Identification 2', 'Identification 3'].forEach(colName => {
    ensureColumn(sheet, headers, colName);
  });

  payload.guests.forEach(guest => {
    const match = findRowByName(sheet, headers, guest.name);
    if (!match) return; // skip unknown guest rows defensively
    const rowNum = match.rowNum;

    writeCell(sheet, headers, rowNum, 'Full Name', guest.fullName || '');
    writeCell(sheet, headers, rowNum, 'Phone Number', guest.phone || '');

    const isOverseas = String(guest.travellingOverseas || '').trim().toLowerCase() === 'yes';
    writeCell(sheet, headers, rowNum, 'Travelling from Overseas', isOverseas ? 'Yes' : 'No');
    writeCell(sheet, headers, rowNum, 'Arrival Flight Number', isOverseas ? (guest.arrivalFlightNumber || '') : '');
    writeCell(sheet, headers, rowNum, 'Arrival Travel Date', isOverseas ? (guest.arrivalDate || '') : '');
    writeCell(sheet, headers, rowNum, 'Arrival Travel Time', isOverseas ? (guest.arrivalTime || '') : '');
    writeCell(sheet, headers, rowNum, 'Arrival Airport', isOverseas ? (guest.arrivalAirport || '') : '');

    // Attendance per event -> auto-created "<Event> - Attending" columns
    Object.keys(guest.attendance || {}).forEach(eventName => {
      const col = ensureColumn(sheet, headers, `${eventName} - Attending`);
      sheet.getRange(rowNum, col + 1).setValue(guest.attendance[eventName]);
    });

    // Identification photos -> each guest's own subfolder, links into Identification 1/2/3 (overflow into #3)
    const personFolder = getOrCreatePersonFolder(folder, guest.fullName || guest.name);
    const links = [];
    (guest.files || []).forEach(file => {
      try {
        const decoded = Utilities.base64Decode(file.base64);
        const blob = Utilities.newBlob(decoded, file.mimeType, file.name);
        const driveFile = personFolder.createFile(blob);
        driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        links.push(driveFile.getUrl());
      } catch (fileErr) {
        links.push('UPLOAD FAILED: ' + file.name);
      }
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

/** Each guest gets their own subfolder (by name) inside the main upload folder. */
function getOrCreatePersonFolder(parentFolder, personName) {
  const safeName = String(personName || 'Guest').trim() || 'Guest';
  const existing = parentFolder.getFoldersByName(safeName);
  if (existing.hasNext()) return existing.next();
  return parentFolder.createFolder(safeName);
}

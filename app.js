// ---------- State ----------
let currentParty = null; // { uid, matchedName, guests: [{ name, invitedEvents: [{name, dateTime}] }] }
let airportsCache = null; // loaded once on first form render
// ---------- Helpers ----------
function show(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
}

function setError(elId, msg) {
  const el = document.getElementById(elId);
  if (!msg) { el.style.display = 'none'; el.textContent = ''; return; }
  el.textContent = msg;
  el.style.display = 'block';
}

/**
 * Scroll an element into view and apply a glowing red error border.
 * Pass the focusable input itself, or a container (e.g. .phone-wrap, .airport-dropdown-wrap).
 *
 * NOTE on the approach: neither el.scrollIntoView({behavior:'smooth'}) nor a
 * plain window.scrollTo() call is reliable on iOS Safari for this — both can
 * silently no-op there, especially for non-text-input elements (selects,
 * checkboxes, wrapper divs). What IS reliable on iOS is focusing a form
 * element: iOS itself uses focus as the trigger to bring a field into view
 * (that's how it decides where to scroll when the keyboard opens), so we
 * lean on that native behaviour first, then do a smooth "center it nicely"
 * pass afterwards for a better look on all browsers.
 */
function flagField(el) {
  if (!el) return;
  el.classList.add('field-error');

  // Container elements (.phone-wrap, .airport-dropdown-wrap, .travel-toggle-row)
  // aren't focusable themselves — find the actual input/select inside them.
  const focusTarget = (el.matches && el.matches('input, select, textarea, button'))
    ? el
    : el.querySelector('input, select, textarea, button');

  // IMPORTANT: skip <select> elements here. Focusing a <select> on iOS opens
  // the native picker wheel; blurring it afterward to close that picker makes
  // iOS snap the page's scroll position back to where it was before the
  // picker opened — which silently cancels the scroll we just did. Text
  // inputs/checkboxes don't have this side effect, so the trick is safe for
  // them; for selects we skip straight to the manual scroll below instead.
  if (focusTarget && focusTarget.tagName !== 'SELECT') {
    try {
      // Let iOS do its native "scroll field into view" — do NOT use
      // preventScroll here, since that native scroll is the reliable part.
      focusTarget.focus();
      // Focusing an <input> can pop the keyboard mid-validation, which we
      // don't want — blur it right after iOS has used the focus event to
      // scroll, but before the user notices anything.
      setTimeout(() => focusTarget.blur(), 50);
    } catch (e) { /* ignore focus errors on unusual elements */ }
  }

  // Follow up with a smooth, centered scroll (covers the case where there
  // was no focusable child, and improves the final resting position).
  requestAnimationFrame(() => {
    const rect = el.getBoundingClientRect();
    const targetY = window.scrollY + rect.top - (window.innerHeight / 2) + (rect.height / 2);
    window.scrollTo({ top: Math.max(targetY, 0), behavior: 'smooth' });
  });
}

/** Remove all glowing error borders from the form before re-validating. */
function clearFieldFlags() {
  document.querySelectorAll('.field-error').forEach(el => el.classList.remove('field-error'));
}

/** Capitalise the first letter of every word (for Full Name on submit). */
function toTitleCase(str) {
  return str.replace(/\S+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

/** Fetch the Algolia airports dataset once and cache it. */
async function loadAirports() {
  if (airportsCache) return airportsCache;
  const res = await fetch('data/airports.json');
  airportsCache = await res.json();
  return airportsCache;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  // textContent->innerHTML escapes & < > but NOT quotes, and this is also used
  // inside value="..." attributes — so escape quotes too.
  return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ---------- Invitation links ----------
// A guest can open https://<site>/#code=K7M2QX9TPD (or just /#K7M2QX9TPD, or /?code=K7M2QX9TPD)
// and skip typing the code. The "#" form is preferred: browsers never send the part after "#"
// to any server, so the code stays out of host logs and Referer headers.
function getUidFromUrl() {
  const hash = window.location.hash.replace(/^#/, '');
  let raw = '';
  if (hash) {
    raw = hash.includes('=') ? (new URLSearchParams(hash).get('code') || '') : hash;
  }
  if (!raw) raw = new URLSearchParams(window.location.search).get('code') || '';
  return raw.replace(/\s+/g, '').toUpperCase();
}

// Remove the code from the address bar so a refresh after "Back"/"Return" lands on the plain welcome page.
function clearUidFromUrl() {
  if (!window.location.hash && !window.location.search) return;
  history.replaceState(null, '', window.location.pathname);
}

// ---------- Screen 1: Welcome / lookup ----------
document.getElementById('find-party-btn').addEventListener('click', findParty);
document.getElementById('name-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') findParty();
});

async function findParty() {
  const nameInput = document.getElementById('name-input');
  // Spaces are stripped and letters uppercased so "k7m2 qx9t pd" still works.
  const uid = nameInput.value.replace(/\s+/g, '').toUpperCase();
  setError('welcome-error', '');

  if (!uid) {
    setError('welcome-error', 'Please enter your invitation code to continue.');
    return;
  }
  if (!/^[A-Z0-9]{10}$/.test(uid)) {
    setError('welcome-error', 'Your invitation code is 10 letters and numbers. Please check it and try again.');
    return;
  }
  if (!API_URL || API_URL.includes('PASTE_YOUR')) {
    setError('welcome-error', 'The site is not connected to the guest list yet. (API_URL missing in config.js)');
    return;
  }

  const btn = document.getElementById('find-party-btn');
  btn.disabled = true;
  btn.textContent = 'Searching…';

  try {
    const res = await fetch(API_URL, {
      method: 'POST', // POST so the code never appears in a URL
      body: JSON.stringify({ action: 'getParty', uid })
    });
    const data = await res.json();

    if (data.status === 'not_leader') {
      document.getElementById('leader-name-display').textContent = data.leaderName;
      show('not-leader-screen');
      return;
    }

    if (data.status !== 'ok') {
      setError('welcome-error', data.error || 'We could not find that invitation code. Please check it or contact Han Seng or Tanaaz.');
      return;
    }

    currentParty = data;
    currentParty.uid = uid; // sent back with the submission so the server can re-verify it
    document.getElementById('form-name').textContent = data.matchedName;
    renderPartyMembers(data.guests, data.matchedName);
    renderEvents(data.guests);
    renderGuestForms(data.guests, data.pickupRequired);
    show('form-screen');
  } catch (err) {
    setError('welcome-error', 'Something went wrong reaching the guest list. Please try again.');
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Continue';
  }
}

document.getElementById('back-from-not-leader-btn').addEventListener('click', () => {
  clearUidFromUrl();
  show('welcome-screen');
});

document.getElementById('form-back-btn').addEventListener('click', () => {
  clearUidFromUrl();
  destroyCardWidgets();
  currentParty = null;
  document.getElementById('rsvp-form').reset();
  document.getElementById('guests-container').innerHTML = '';
  document.getElementById('party-members-block').style.display = 'none';
  setError('form-error', '');
  show('welcome-screen');
});

document.getElementById('return-home-btn').addEventListener('click', () => {
  clearUidFromUrl();
  destroyCardWidgets();
  currentParty = null;
  document.getElementById('name-input').value = '';
  document.getElementById('rsvp-form').reset();
  document.getElementById('guests-container').innerHTML = '';
  document.getElementById('party-members-block').style.display = 'none';
  setError('welcome-error', '');
  setError('form-error', '');
  show('welcome-screen');
});

// Destroy any intl-tel-input instances before the form is torn down, to avoid memory leaks.
function destroyCardWidgets() {
  document.querySelectorAll('.guest-card').forEach(card => {
    if (card._iti) { try { card._iti.destroy(); } catch (e) {} card._iti = null; }
  });
}

// ---------- Screen 2: Form rendering ----------

// Shows a compact party roster above the events block — only for parties of 2+.
function renderPartyMembers(guests, leaderName) {
  const block = document.getElementById('party-members-block');
  block.innerHTML = '';

  if (guests.length <= 1) {
    block.style.display = 'none';
    return;
  }

  block.style.display = 'block';
  block.innerHTML = `
    <div class="party-members-block">
      <h3>Your Party</h3>
      <div class="party-members-list">
        ${guests.map((g, i) => {
          const isLeader = g.name.toLowerCase() === (leaderName || '').toLowerCase();
          return `
            <div class="party-member-row">
              <span class="party-member-index">${i + 1}</span>
              <span class="party-member-name">${escapeHtml(g.name)}</span>
              ${isLeader ? '<span class="party-leader-badge">Party Leader</span>' : ''}
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

// Union of every event any guest in the party is invited to, for the summary block.
function renderEvents(guests) {
  const list = document.getElementById('events-list');
  list.innerHTML = '';
  const seen = new Map();
  guests.forEach(g => g.invitedEvents.forEach(ev => seen.set(ev.name, ev.dateTime)));

  if (!seen.size) {
    list.innerHTML = '<p class="subline" style="margin:0;">No events found for your party. Please contact Han Seng or Tanaaz.</p>';
    return;
  }
  seen.forEach((dateTime, name) => {
    const row = document.createElement('div');
    row.className = 'event-row';
    row.innerHTML = `<span class="ename">${escapeHtml(name)}</span><span class="edate">${escapeHtml(dateTime)}</span>`;
    list.appendChild(row);
  });
}

function renderGuestForms(guests, pickupRequired) {
  const container = document.getElementById('guests-container');
  container.innerHTML = '';

  guests.forEach((guest, idx) => {
    const saved = guest.savedData || {};
    const card = document.createElement('div');
    card.className = 'guest-card';
    card.dataset.guestName = guest.name;
    card.dataset.pickupRequired = pickupRequired ? 'true' : 'false';

    let attendanceHtml = '';
    if (guest.invitedEvents.length) {
      guest.invitedEvents.forEach(ev => {
        const savedValue = (saved.attendance && saved.attendance[ev.name]) || '';
        attendanceHtml += `
          <div class="attendance-row">
            <span>
              <span class="ename">${escapeHtml(ev.name)}</span>
              <span class="edate">${escapeHtml(ev.dateTime)}</span>
            </span>
            <select class="attendance-select" data-event="${escapeHtml(ev.name)}" required>
              <option value="" ${savedValue ? '' : 'selected'} disabled>Select</option>
              <option value="Yes" ${savedValue === 'Yes' ? 'selected' : ''}>Attending</option>
              <option value="No" ${savedValue === 'No' ? 'selected' : ''}>Not Attending</option>
            </select>
          </div>`;
      });
    } else {
      attendanceHtml = '<p class="subline" style="margin:8px 0; text-align:left;">No events listed for this guest.</p>';
    }

    const isOverseasSaved = String(saved.travellingOverseas || '').toLowerCase() === 'yes';
    const isDomesticSaved = String(saved.travellingDomestically || '').toLowerCase() === 'yes';
    // Airport pick-up is only asked when travelling from overseas. Rows saved before
    // this checkbox existed, which already hold flight details, count as "needs pick-up".
    const savedPickup = String(saved.airportPickup || '').toLowerCase();
    const isPickupSaved = isOverseasSaved && (savedPickup === 'yes' || (!savedPickup && !!saved.arrivalFlightNumber));

    // The whole "Travel Details" block (the overseas/domestic tickboxes +
    // arrival fields) only exists in the DOM at all if this party's
    // "Pickup" flag is set. When it's not set, none of these inputs are
    // rendered, so there's nothing to validate and nothing to submit for them.
    const travelDetailsHtml = pickupRequired ? `
      <h3 style="margin-top:24px;">Travel Details</h3>
      <div class="travel-toggle-row">
        <label class="checkbox-label travel-toggle">
          <input type="checkbox" class="overseas-checkbox" ${isOverseasSaved ? 'checked' : ''} />
          Travelling from overseas
        </label>
        <label class="checkbox-label travel-toggle">
          <input type="checkbox" class="domestic-checkbox" ${isDomesticSaved ? 'checked' : ''} />
          Travelling domestically
        </label>
      </div>

      <div class="pickup-wrap" style="${isOverseasSaved ? '' : 'display:none;'}">
        <label class="checkbox-label">
          <input type="checkbox" class="pickup-checkbox" ${isPickupSaved ? 'checked' : ''} />
          I need airport pick-up arranged for me on the day of the event
        </label>
        <p class="helper-text">Tick this and we'll ask for your arrival flight details so we can schedule your pick-up from the airport.</p>
      </div>

      <div class="overseas-fields" data-active="${isPickupSaved}" style="${isPickupSaved ? '' : 'display:none;'}">
        <label>Arrival flight number<span class="req">*</span></label>
        <input type="text" class="arrival-flight-number" placeholder="e.g. SQ123" value="${escapeHtml(saved.arrivalFlightNumber || '')}" ${isPickupSaved ? '' : 'disabled'} />

        <label>Arrival travel date<span class="req">*</span></label>
        <input type="date" class="arrival-date" value="${escapeHtml(saved.arrivalDate || '')}" ${isPickupSaved ? '' : 'disabled'} />

        <label>Arrival travel time (IST)<span class="req">*</span></label>
        <p class="helper-text">Please enter your arrival time in <strong>Indian Standard Time (IST)</strong>. IST is UTC+5:30, i.e. 5 hr 30 min ahead of UTC.</p>
        <input type="time" class="arrival-time" value="${escapeHtml(saved.arrivalTime || '')}" ${isPickupSaved ? '' : 'disabled'} />

        <label>Arrival airport<span class="req">*</span></label>
        <div class="airport-dropdown-wrap" data-value="${escapeHtml(saved.arrivalAirport || '')}">
          <input type="text" class="airport-search" placeholder="Search by city, airport name or IATA code…" autocomplete="off" ${isPickupSaved ? '' : 'disabled'} />
          <div class="airport-dropdown-list" style="display:none;"></div>
          <input type="hidden" class="arrival-airport" value="${escapeHtml(saved.arrivalAirport || '')}" />
        </div>
      </div>

    ` : '';

    // Attending checkbox: ticked if saved as Yes. Rows saved before this
    // checkbox existed (no value, but details already filled in) count as attending.
    const savedAttending = String(saved.attendingWedding || '').toLowerCase();
    const isAttendingSaved = savedAttending === 'yes' || (!savedAttending && !!saved.fullName);

    card.innerHTML = `
      <div class="guest-name-tag">Guest ${idx + 1}</div>
      <h2>${escapeHtml(guest.name)}</h2>

      <label class="checkbox-label attending-toggle">
        <input type="checkbox" class="attending-checkbox" ${isAttendingSaved ? 'checked' : ''} />
        I can attend the wedding
      </label>
      <p class="helper-text attending-helper">Tick this box if ${escapeHtml(guest.name)} can attend. Leave it unticked if they can't make it at all.</p>

      <div class="guest-details" style="${isAttendingSaved ? '' : 'display:none;'}">
      <label>Full name<span class="req">*</span></label>
      <p class="helper-text">Full name as per passport</p>
      <input type="text" class="full-name" required placeholder="Exact name as on your travel document" value="${escapeHtml(saved.fullName || '')}" />

      <label>Phone number<span class="req">*</span></label>
      <div class="phone-wrap">
        <input type="tel" class="phone-input" value="${escapeHtml(saved.phone || '')}" />
      </div>
      <p class="error-text phone-error" style="display:none;"></p>

      <h3 style="margin-top:24px;">Confirm Attendance</h3>
      ${attendanceHtml}

      ${travelDetailsHtml}
      <h3 style="margin-top:28px;">Optional</h3>
      <label>Food allergies / dietary requirements</label>
      <textarea class="food-allergies" rows="2" maxlength="200" placeholder="e.g. peanuts, shellfish, vegetarian">${escapeHtml(saved.foodAllergies || '')}</textarea>

      <label>Song requests</label>
      <textarea class="song-requests" rows="2" maxlength="300" placeholder="Songs you'd love to hear on the dance floor">${escapeHtml(saved.songRequests || '')}</textarea>

      <label>Message or anything else for the Couple</label>
      <textarea class="couple-message" rows="3" maxlength="500" placeholder="Anything you'd like Han Seng &amp; Tanaaz to know">${escapeHtml(saved.messageForCouple || '')}</textarea>
      </div><!-- /.guest-details -->
    `;
    container.appendChild(card);

    initCardWidgets(card, saved);

    // Clear field-error highlight on any plain input/select interaction
    card.querySelectorAll('.full-name, .arrival-flight-number, .arrival-date, .arrival-time, .attendance-select').forEach(el => {
      el.addEventListener('input', () => el.classList.remove('field-error'));
      el.addEventListener('change', () => el.classList.remove('field-error'));
    });

    // Show/hide everything else based on the attending checkbox
    const attendingBox = card.querySelector('.attending-checkbox');
    const detailsWrap = card.querySelector('.guest-details');
    attendingBox.addEventListener('change', () => {
      detailsWrap.style.display = attendingBox.checked ? '' : 'none';
      // The phone field was hidden (zero width) if the card started unticked; re-measure the dial code now.
      if (attendingBox.checked) refreshPhonePadding(card);
      card.querySelectorAll('.field-error').forEach(el => el.classList.remove('field-error'));
    });
  });

  container.querySelectorAll('.overseas-checkbox, .domestic-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      const row = checkbox.closest('.travel-toggle-row');
      if (row) row.classList.remove('field-error');
    });
  });

  // Travel logic for each card:
  //   overseas ticked  -> show the "need airport pick-up?" checkbox
  //   pick-up ticked   -> show (and require) the arrival flight details
  //   otherwise        -> no arrival details are asked for or sent
  container.querySelectorAll('.guest-card').forEach(guestCard => {
    const overseasBox = guestCard.querySelector('.overseas-checkbox');
    if (!overseasBox) return; // party doesn't collect travel info
    const domesticBox = guestCard.querySelector('.domestic-checkbox');
    const pickupBox = guestCard.querySelector('.pickup-checkbox');
    const pickupWrap = guestCard.querySelector('.pickup-wrap');
    const fieldsWrap = guestCard.querySelector('.overseas-fields');

    function updateTravelUI() {
      const overseas = overseasBox.checked;
      pickupWrap.style.display = overseas ? '' : 'none';
      if (!overseas) pickupBox.checked = false;

      const showArrival = overseas && pickupBox.checked;
      fieldsWrap.dataset.active = showArrival;
      fieldsWrap.style.display = showArrival ? '' : 'none';
      fieldsWrap.querySelectorAll('input:not([type="hidden"])').forEach(inp => {
        inp.disabled = !showArrival;
        if (!showArrival) inp.value = '';
      });
      if (!showArrival) {
        const wrap = fieldsWrap.querySelector('.airport-dropdown-wrap');
        wrap.querySelector('.arrival-airport').value = '';
        wrap.querySelector('.airport-dropdown-list').style.display = 'none';
        wrap.classList.remove('field-error');
        fieldsWrap.querySelectorAll('.field-error').forEach(el => el.classList.remove('field-error'));
      }
    }

    overseasBox.addEventListener('change', () => {
      if (overseasBox.checked && domesticBox.checked) domesticBox.checked = false; // only one of the two
      updateTravelUI();
    });
    domesticBox.addEventListener('change', () => {
      if (domesticBox.checked && overseasBox.checked) {
        overseasBox.checked = false;
        updateTravelUI();
      }
    });
    pickupBox.addEventListener('change', updateTravelUI);
  });
}

/**
 * Re-measure the selected-country (flag + dial code) block and set the phone input's left padding to match,
 * so the placeholder/number never overlaps the country code. Works even if the library measured too early.
 */
function refreshPhonePadding(card) {
  const input = card && card.querySelector('.phone-input');
  const sel = input && input.parentElement && input.parentElement.querySelector('.iti__selected-country');
  if (!input || !sel) return;
  const w = sel.offsetWidth;
  if (w > 0) input.style.paddingLeft = (w + 10) + 'px';
}

/** Initialise intl-tel-input on the phone field and airport search on a guest card. */
async function initCardWidgets(card, saved) {
  // ---- Phone: intl-tel-input ----
  const phoneInput = card.querySelector('.phone-input');
  if (phoneInput && window.intlTelInput) {
    const iti = window.intlTelInput(phoneInput, {
      initialCountry: 'sg',
      separateDialCode: true,
      autoPlaceholder: 'aggressive',
      formatAsYouType: false,          // disabled — the library sets userOverrideFormatting=true
                                       // whenever it writes a space, permanently killing the
                                       // formatter. We replicate _formatNumberAsYouType manually.
      placeholderNumberType: 'MOBILE',
    });
    card._iti = iti;
    // The library sizes the input's left padding once, at init, when the web font may not be loaded yet
    // (or the field is hidden), so the dial code ends up overlapping the number/placeholder. Re-measure
    // after fonts load.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => refreshPhonePadding(card));
    requestAnimationFrame(() => refreshPhonePadding(card));

    /**
     * Compute the max national digit count for the selected country.
     * Use getExampleNumber directly — the isPossibleNumber loop used previously
     * over-counted for countries like India (+91 prefix included in the string).
     */
    function computeMaxDigits() {
      const utils = window.intlTelInput && window.intlTelInput.utils;
      if (!utils) return null;
      const iso2 = iti.getSelectedCountryData().iso2;
      if (!iso2) return null;
      try {
        const example = utils.getExampleNumber(iso2, true, utils.numberType.MOBILE, true);
        return utils.getCoreNumber(example, iso2).length;
      } catch (e) { return null; }
    }

    /**
     * Replicates _formatNumberAsYouType():
     * Prepend +dialCode so libphonenumber can parse the number in context,
     * run formatNumberAsYouType, then strip the dial code back off since
     * separateDialCode shows it separately.
     */
    function formatCurrentValue() {
      const utils = window.intlTelInput && window.intlTelInput.utils;
      if (!utils) return;
      const { iso2, dialCode } = iti.getSelectedCountryData();
      const val = phoneInput.value.trim();
      if (!val) return;
      const fullNumber = (val.charAt(0) !== '+' && dialCode) ? `+${dialCode}${val}` : val;
      let formatted = utils.formatNumberAsYouType(fullNumber, iso2);
      const prefix = `+${dialCode}`;
      if (dialCode && formatted.startsWith(prefix)) {
        formatted = formatted.slice(prefix.length).trimStart();
      }
      if (formatted === phoneInput.value) return;
      // Restore caret to same digit position in the newly formatted string
      const caretPos = phoneInput.selectionStart || 0;
      const digitsBefore = phoneInput.value.slice(0, caretPos).replace(/\D/g, '').length;
      phoneInput.value = formatted;
      let digitsFound = 0, newCaret = formatted.length;
      for (let i = 0; i < formatted.length; i++) {
        if (/\d/.test(formatted[i])) digitsFound++;
        if (digitsFound === digitsBefore) { newCaret = i + 1; break; }
      }
      phoneInput.setSelectionRange(newCaret, newCaret);
    }

    card._phoneMaxDigits = computeMaxDigits();

    phoneInput.addEventListener('countrychange', () => {
      refreshPhonePadding(card);
      phoneInput.value = '';
      card._phoneMaxDigits = computeMaxDigits();
    });

    // Block non-digits and enforce max length BEFORE the text is inserted.
    // Uses beforeinput (not keydown) so that:
    //  - typing over highlighted text works: the selected digits are replaced,
    //    so they must not count towards the length limit;
    //  - mobile soft keyboards (which send key="Unidentified" on keydown) work.
    phoneInput.addEventListener('beforeinput', (e) => {
      if (!e.inputType || !e.inputType.startsWith('insert') || e.data == null) return;
      if (/\D/.test(e.data)) { e.preventDefault(); return; }
      const maxDigits = card._phoneMaxDigits;
      if (!maxDigits) return;
      const v = phoneInput.value;
      const start = phoneInput.selectionStart ?? v.length;
      const end = phoneInput.selectionEnd ?? v.length;
      const kept = (v.slice(0, start) + v.slice(end)).replace(/\D/g, '').length;
      if (kept + e.data.length > maxDigits) e.preventDefault();
    });

    // Apply national formatting after each keystroke; clear error highlights
    phoneInput.addEventListener('input', () => {
      // Pasted text bypasses beforeinput's per-character check: clean it up here.
      const digits = phoneInput.value.replace(/\D/g, '');
      const max = card._phoneMaxDigits;
      const trimmed = max ? digits.slice(0, max) : digits;
      if (trimmed !== digits || /[^\d\s\-()]/.test(phoneInput.value)) phoneInput.value = trimmed;
      formatCurrentValue();
      card.querySelector('.phone-wrap')?.classList.remove('field-error');
      const phoneError = card.querySelector('.phone-error');
      if (phoneError) phoneError.style.display = 'none';
    });

    if (saved.phone) { iti.setNumber(saved.phone); }
  }

  // ---- Airport: searchable dropdown ----
  const airportWrap = card.querySelector('.airport-dropdown-wrap');
  if (!airportWrap) return;

  const searchInput = airportWrap.querySelector('.airport-search');
  const dropdownList = airportWrap.querySelector('.airport-dropdown-list');
  const hiddenInput = airportWrap.querySelector('.arrival-airport');

  // If there's a saved value, display it in the search box
  if (saved.arrivalAirport) {
    searchInput.value = saved.arrivalAirport;
  }

  let debounceTimer = null;

  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    // Any edit (including typing over a highlighted selection) invalidates the
    // previously chosen airport; the guest must pick one from the list again.
    hiddenInput.value = '';
    const query = searchInput.value.trim().toLowerCase();
    if (!query) {
      dropdownList.style.display = 'none';
      hiddenInput.value = '';
      return;
    }
    debounceTimer = setTimeout(async () => {
      const airports = await loadAirports();
      const matches = airports.filter(a =>
        a.name.toLowerCase().includes(query) ||
        a.city.toLowerCase().includes(query) ||
        a.iata_code.toLowerCase().includes(query) ||
        a.country.toLowerCase().includes(query)
      ).slice(0, 30); // cap at 30 results

      dropdownList.innerHTML = '';
      if (!matches.length) {
        dropdownList.innerHTML = '<div class="airport-option airport-option-empty">No airports found</div>';
      } else {
        matches.forEach(a => {
          const opt = document.createElement('div');
          opt.className = 'airport-option';
          opt.innerHTML = `<span class="airport-iata">${escapeHtml(a.iata_code)}</span><span class="airport-label">${escapeHtml(a.name)}, ${escapeHtml(a.city)}, ${escapeHtml(a.country)}</span>`;
          opt.addEventListener('mousedown', e => {
            e.preventDefault(); // prevent blur before click registers
            const displayValue = `${a.iata_code} – ${a.name}, ${a.city} (${a.country})`;
            searchInput.value = displayValue;
            hiddenInput.value = displayValue;
            dropdownList.style.display = 'none';
          });
          dropdownList.appendChild(opt);
        });
      }
      dropdownList.style.display = 'block';
    }, 150);
  });

  searchInput.addEventListener('blur', () => {
    // Small delay so mousedown on an option fires first
    setTimeout(() => { dropdownList.style.display = 'none'; }, 200);
  });

  searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim() && dropdownList.children.length) {
      dropdownList.style.display = 'block';
    }
  });

  // Clear error highlight as soon as user starts typing in airport search
  searchInput.addEventListener('input', () => {
    airportWrap.classList.remove('field-error');
  });
}

// ---------- Screen 2: Submit ----------
// Belt-and-suspenders: force novalidate in case the attribute is ever lost
// (e.g. dynamic re-render). Native HTML5 validation on <select required> is
// what silently blocks submission on iOS Safari — it intercepts the submit
// event before this listener runs, and unlike desktop Chrome it shows no
// bubble and does not scroll. Our own flagField/scroll logic below is the
// single source of truth for validation instead.
document.getElementById('rsvp-form').setAttribute('novalidate', 'novalidate');

document.getElementById('rsvp-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  setError('form-error', '');
  clearFieldFlags(); // remove any previous red borders before re-validating

  if (!currentParty) return;

  const submitBtn = document.getElementById('submit-btn');
  const guestCards = document.querySelectorAll('.guest-card');
  const guestsPayload = [];

  // Validation below runs in the same top-down order fields appear in the
  // card: full name -> phone -> attendance -> travel details.
  for (const card of guestCards) {
    const name = card.dataset.guestName;

    // Not attending at all: nothing else to validate or send.
    if (!card.querySelector('.attending-checkbox').checked) {
      guestsPayload.push({ name, attendingWedding: 'No' });
      continue;
    }

    const pickupRequired = card.dataset.pickupRequired === 'true';
    const rawFullName = card.querySelector('.full-name').value.trim();
    const fullName = toTitleCase(rawFullName); // capitalise first letter of each word

    // These fields only exist in the DOM at all when this party's "Pickup"
    // flag is set — otherwise there's nothing to read or validate, and the
    // payload sends "No"/blank for all of them.
    const overseasChecked = pickupRequired ? card.querySelector('.overseas-checkbox').checked : false;
    const airportPickup = pickupRequired && overseasChecked ? card.querySelector('.pickup-checkbox').checked : false;
    const domesticChecked = pickupRequired ? card.querySelector('.domestic-checkbox').checked : false;
    const arrivalFlightNumber = pickupRequired ? card.querySelector('.arrival-flight-number').value.trim() : '';
    const arrivalDate = pickupRequired ? card.querySelector('.arrival-date').value : '';
    const arrivalTime = pickupRequired ? card.querySelector('.arrival-time').value : '';
    const arrivalAirportInput = pickupRequired ? card.querySelector('.arrival-airport') : null;
    const arrivalAirport = arrivalAirportInput ? arrivalAirportInput.value.trim() : '';

    // ---------- 1. Full name ----------
    if (!fullName) {
      const el = card.querySelector('.full-name');
      setError('form-error', `Please enter the full name for ${name}.`);
      flagField(el);
      return;
    }

    // ---------- 2. Phone: validate via intl-tel-input if available, else fall back to raw value ----------
    let phone = '';
    const iti = card._iti;
    if (iti) {
      const e164 = iti.getNumber();           // e.g. "+6591234567"
      const countryData = iti.getSelectedCountryData();
      const iso2 = countryData.iso2;

      /**
       * Robust phone validation tested against SG, IN, AE, US, AU and edge cases:
       * 1. isValidNumber — libphonenumber structural check (length, area code, etc.)
       * 2. Reject non-dialable types: VOIP, PAGER, TOLL_FREE, PREMIUM_RATE,
       *    SHARED_COST, UAN, UNKNOWN (covers SG 3x VOIP numbers passing isValidNumber)
       * 3. For countries where FIXED_LINE overlaps mobile ranges, apply a prefix
       *    rule as a fallback (e.g. India 6-9 prefix for mobile; 1-5 are landlines)
       */
      const utils = window.intlTelInput && window.intlTelInput.utils;
      let phoneOk = false;
      let phoneErrorMsg = `Please enter a valid mobile number for ${name}.`;

      if (!e164 || !utils) {
        phoneOk = false;
      } else {
        const isValid = utils.isValidNumber(e164, iso2);
        if (!isValid) {
          phoneOk = false;
        } else {
          const type = utils.getNumberType(e164, iso2);
          const NT = utils.numberType;
          // Types that are never personal mobile numbers
          const REJECT_TYPES = new Set([NT.VOIP, NT.PAGER, NT.TOLL_FREE,
                                        NT.PREMIUM_RATE, NT.SHARED_COST,
                                        NT.UAN, NT.UNKNOWN]);
          if (REJECT_TYPES.has(type)) {
            phoneOk = false;
            if (type === NT.VOIP) phoneErrorMsg = `Please enter a mobile number, not a VOIP number, for ${name}.`;
          } else if (type === NT.FIXED_LINE) {
            // Some countries classify mobile numbers as FIXED_LINE — apply
            // country-specific prefix rules to distinguish mobile from landline
            const MOBILE_PREFIXES = { 'in': /^[6-9]/ };
            const core = utils.getCoreNumber(e164, iso2);
            const rule = MOBILE_PREFIXES[iso2];
            if (rule && !rule.test(core)) {
              phoneOk = false;
              phoneErrorMsg = `Please enter a mobile number for ${name}. Landline numbers are not accepted.`;
            } else {
              phoneOk = true; // FIXED_LINE in a country without a strict mobile rule, or matches rule
            }
          } else {
            phoneOk = true; // MOBILE, FIXED_LINE_OR_MOBILE, PERSONAL_NUMBER, VOICEMAIL
          }
        }
      }

      if (!phoneOk) {
        const phoneWrap = card.querySelector('.phone-wrap');
        const phoneError = card.querySelector('.phone-error');
        if (phoneError) { phoneError.textContent = phoneErrorMsg; phoneError.style.display = 'block'; }
        setError('form-error', phoneErrorMsg);
        flagField(phoneWrap);
        return;
      }
      // Store in INTERNATIONAL format (e.g. "+65 9123 4567") for readability in the sheet
      phone = utils
        ? utils.formatNumber(e164, iso2, utils.numberFormat.INTERNATIONAL)
        : e164;
    } else {
      phone = card.querySelector('.phone-input').value.trim();
    }

    // ---------- 3. Event attendance ----------
    const attendance = {};
    let firstBadAttendance = null;
    card.querySelectorAll('.attendance-select').forEach(sel => {
      if (!sel.value && !firstBadAttendance) firstBadAttendance = sel;
      attendance[sel.dataset.event] = sel.value;
    });
    if (firstBadAttendance) {
      setError('form-error', `Please confirm attendance for every event for ${name}.`);
      flagField(firstBadAttendance);
      return;
    }

    // ---------- 4. Travel details ----------
    if (pickupRequired && !overseasChecked && !domesticChecked) {
      const el = card.querySelector('.travel-toggle-row');
      setError('form-error', `Please indicate whether ${name} is travelling from overseas or domestically.`);
      flagField(el);
      return;
    }

    // Flight details are only requested if the guest needs airport pick-up.
    if (pickupRequired && overseasChecked && airportPickup) {
      if (!arrivalFlightNumber) {
        const el = card.querySelector('.arrival-flight-number');
        setError('form-error', `Please enter the arrival flight number for ${name}.`);
        flagField(el);
        return;
      }
      if (!arrivalDate) {
        const el = card.querySelector('.arrival-date');
        setError('form-error', `Please enter the arrival date for ${name}.`);
        flagField(el);
        return;
      }
      if (!arrivalTime) {
        const el = card.querySelector('.arrival-time');
        setError('form-error', `Please enter the arrival time for ${name}.`);
        flagField(el);
        return;
      }
      if (!arrivalAirport) {
        const el = card.querySelector('.airport-dropdown-wrap');
        setError('form-error', `Please select an arrival airport for ${name}.`);
        flagField(el);
        return;
      }
    }

    guestsPayload.push({
      name, attendingWedding: 'Yes', fullName, phone,
      travellingOverseas: overseasChecked ? 'Yes' : 'No',
      travellingDomestically: domesticChecked ? 'Yes' : 'No',
      airportPickup: airportPickup ? 'Yes' : 'No',
      arrivalFlightNumber, arrivalDate, arrivalTime, arrivalAirport,
      foodAllergies: card.querySelector('.food-allergies').value.trim(),
      songRequests: card.querySelector('.song-requests').value.trim(),
      messageForCouple: card.querySelector('.couple-message').value.trim(),
      attendance
    });
  }

  submitBtn.disabled = true;
  submitBtn.innerHTML = 'Submitting <span class="loading-dot"></span>';

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'submit', uid: currentParty.uid, guests: guestsPayload })
    });
    const data = await res.json();

    if (data.error) {
      setError('form-error', data.error);
      return;
    }

    show('thankyou-screen');
  } catch (err) {
    setError('form-error', 'Something went wrong submitting your RSVP. Please try again.');
    console.error(err);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Confirm RSVP';
  }
});

// ---------- Auto-open from an invitation link ----------
// Runs last so every function above exists. If the link's code is wrong, the normal
// error message appears with the code pre-filled so the guest can correct it.
(function autoOpenFromLink() {
  const uid = getUidFromUrl();
  if (!uid) return;
  document.getElementById('name-input').value = uid;
  findParty();
})();

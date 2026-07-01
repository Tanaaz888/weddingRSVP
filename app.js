// ---------- State ----------
let currentParty = null; // { matchedName, guests: [{ name, invitedEvents: [{name, dateTime}] }] }
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
 */
function flagField(el) {
  if (!el) return;
  el.classList.add('field-error');
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
  const res = await fetch('https://raw.githubusercontent.com/algolia/datasets/master/airports/airports.json');
  airportsCache = await res.json();
  return airportsCache;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

// ---------- Screen 1: Welcome / lookup ----------
document.getElementById('find-party-btn').addEventListener('click', findParty);
document.getElementById('name-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') findParty();
});

async function findParty() {
  const nameInput = document.getElementById('name-input');
  const name = nameInput.value.trim();
  setError('welcome-error', '');

  if (!name) {
    setError('welcome-error', 'Please type your name to continue.');
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
    const res = await fetch(`${API_URL}?action=getParty&name=${encodeURIComponent(name)}`);
    const data = await res.json();

    if (data.status === 'not_leader') {
      document.getElementById('leader-name-display').textContent = data.leaderName;
      show('not-leader-screen');
      return;
    }

    if (data.status !== 'ok') {
      setError('welcome-error', data.error || 'We could not find that name on the guest list. Please check the spelling or contact Han Seng or Tanaaz.');
      return;
    }

    currentParty = data;
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
  show('welcome-screen');
});

document.getElementById('form-back-btn').addEventListener('click', () => {
  revokeCardObjectUrls();
  currentParty = null;
  document.getElementById('rsvp-form').reset();
  document.getElementById('guests-container').innerHTML = '';
  document.getElementById('party-members-block').style.display = 'none';
  setError('form-error', '');
  show('welcome-screen');
});

document.getElementById('return-home-btn').addEventListener('click', () => {
  revokeCardObjectUrls();
  currentParty = null;
  document.getElementById('name-input').value = '';
  document.getElementById('rsvp-form').reset();
  document.getElementById('guests-container').innerHTML = '';
  document.getElementById('party-members-block').style.display = 'none';
  setError('welcome-error', '');
  setError('form-error', '');
  show('welcome-screen');
});

// Revoke all object URLs held in guest card slot state before the form is torn down.
// Also destroy any intl-tel-input instances to avoid memory leaks.
function revokeCardObjectUrls() {
  document.querySelectorAll('.guest-card').forEach(card => {
    if (card._iti) { try { card._iti.destroy(); } catch (e) {} card._iti = null; }
    if (!card._docSlots) return;
    Object.values(card._docSlots).forEach(state => {
      if (state.newFile && state.newFile.objectUrl) {
        URL.revokeObjectURL(state.newFile.objectUrl);
      }
    });
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

      <div class="overseas-fields" data-active="${isOverseasSaved}" style="${isDomesticSaved ? 'display:none;' : ''}">
        <label>Arrival flight number<span class="req">*</span></label>
        <input type="text" class="arrival-flight-number" placeholder="e.g. SQ123" value="${escapeHtml(saved.arrivalFlightNumber || '')}" ${isOverseasSaved ? '' : 'disabled'} />

        <label>Arrival travel date<span class="req">*</span></label>
        <input type="date" class="arrival-date" value="${escapeHtml(saved.arrivalDate || '')}" ${isOverseasSaved ? '' : 'disabled'} />

        <label>Arrival travel time<span class="req">*</span></label>
        <input type="time" class="arrival-time" value="${escapeHtml(saved.arrivalTime || '')}" ${isOverseasSaved ? '' : 'disabled'} />

        <label>Arrival airport<span class="req">*</span></label>
        <div class="airport-dropdown-wrap" data-value="${escapeHtml(saved.arrivalAirport || '')}">
          <input type="text" class="airport-search" placeholder="Search by city, airport name or IATA code…" autocomplete="off" ${isOverseasSaved ? '' : 'disabled'} />
          <div class="airport-dropdown-list" style="display:none;"></div>
          <input type="hidden" class="arrival-airport" value="${escapeHtml(saved.arrivalAirport || '')}" />
        </div>
      </div>

      <div class="domestic-note" style="display:${isDomesticSaved ? 'block' : 'none'};">
        <p class="helper-text" style="margin:0;">We will follow up with you on more details!</p>
      </div>
    ` : '';

    card.innerHTML = `
      <div class="guest-name-tag">Guest ${idx + 1}</div>
      <h2>${escapeHtml(guest.name)}</h2>

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
      <label>Attachment(s) for verification (Foreigners = Passport + Visa/OCI, Locals = Aadhar Card)<span class="req">*</span></label>
      <p class="helper-text">Required by hotels under local Indian law for all guests.</p>

      <label class="checkbox-label" style="margin-top:12px;">
        <input type="checkbox" class="local-indian-checkbox" ${(saved.localIndian || '').toLowerCase() === 'yes' ? 'checked' : ''} />
        Local Indian?
      </label>

      <div class="doc-slots" style="margin-top:16px;">
        <!-- Foreigner slots -->
        <div class="doc-slot foreigner-slot" data-slot="Passport">
          <div class="doc-slot-label">Passport <span class="req">*</span></div>
          <div class="doc-slot-control"></div>
        </div>
        <div class="doc-slot foreigner-slot" data-slot="Visa / OCI">
          <div class="doc-slot-label">Visa / OCI <span class="req">*</span></div>
          <div class="doc-slot-control"></div>
        </div>
        <!-- Local slot -->
        <div class="doc-slot local-slot" data-slot="Aadhar Card">
          <div class="doc-slot-label">Aadhar Card <span class="req">*</span></div>
          <div class="doc-slot-control"></div>
        </div>
      </div>
    `;
    container.appendChild(card);

    // Per-slot state: { existingFile: {fileName, url} | null, newFile: { file: File, objectUrl: string } | null }
    // objectUrl is created once on file selection and revoked explicitly on removal or form teardown.
    card._docSlots = {
      'Passport':    { existingFile: saved.passport    || null, newFile: null },
      'Visa / OCI':  { existingFile: saved.visaOci     || null, newFile: null },
      'Aadhar Card': { existingFile: saved.aadharCard  || null, newFile: null }
    };

    renderDocSlots(card);
    initCardWidgets(card, saved);

    // Clear field-error highlight on any plain input/select interaction
    card.querySelectorAll('.full-name, .arrival-flight-number, .arrival-date, .arrival-time, .attendance-select').forEach(el => {
      el.addEventListener('input', () => el.classList.remove('field-error'));
      el.addEventListener('change', () => el.classList.remove('field-error'));
    });
    // Doc slots: clear on any upload/remove (re-render handles it via renderDocSlots)
  });

  container.querySelectorAll('.overseas-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      const guestCard = checkbox.closest('.guest-card');
      const fieldsWrap = guestCard.querySelector('.overseas-fields');
      const domesticCheckbox = guestCard.querySelector('.domestic-checkbox');
      fieldsWrap.dataset.active = checkbox.checked;
      fieldsWrap.style.display = '';

      // Enable/disable all plain inputs except the hidden airport value
      fieldsWrap.querySelectorAll('input:not([type="hidden"])').forEach(inp => {
        inp.disabled = !checkbox.checked;
        if (!checkbox.checked) inp.value = '';
      });

      // Also clear the airport hidden value and search display
      if (!checkbox.checked) {
        const wrap = fieldsWrap.querySelector('.airport-dropdown-wrap');
        if (wrap) {
          wrap.querySelector('.arrival-airport').value = '';
          wrap.querySelector('.airport-search').value = '';
          wrap.querySelector('.airport-dropdown-list').style.display = 'none';
        }
      }

      // Ticking "overseas" unticks "domestic" so only one can be selected
      if (checkbox.checked && domesticCheckbox && domesticCheckbox.checked) {
        domesticCheckbox.checked = false;
        domesticCheckbox.dispatchEvent(new Event('change'));
      }
    });
  });

  container.querySelectorAll('.domestic-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      const guestCard = checkbox.closest('.guest-card');
      const overseasCheckbox = guestCard.querySelector('.overseas-checkbox');
      const fieldsWrap = guestCard.querySelector('.overseas-fields');
      const note = guestCard.querySelector('.domestic-note');

      // Ticking "domestic" unticks "overseas" so only one can be selected
      if (checkbox.checked && overseasCheckbox && overseasCheckbox.checked) {
        overseasCheckbox.checked = false;
        overseasCheckbox.dispatchEvent(new Event('change'));
      }

      // Domestic travel skips arrival details entirely — replace them with
      // a simple follow-up note instead.
      if (fieldsWrap) {
        fieldsWrap.style.display = checkbox.checked ? 'none' : '';
        if (checkbox.checked) {
          fieldsWrap.dataset.active = 'false';
          fieldsWrap.querySelectorAll('input:not([type="hidden"])').forEach(inp => {
            inp.disabled = true;
            inp.value = '';
          });
          const wrap = fieldsWrap.querySelector('.airport-dropdown-wrap');
          if (wrap) {
            wrap.querySelector('.arrival-airport').value = '';
            wrap.querySelector('.airport-search').value = '';
            wrap.querySelector('.airport-dropdown-list').style.display = 'none';
          }
        }
      }
      if (note) note.style.display = checkbox.checked ? 'block' : 'none';
    });
  });

  container.querySelectorAll('.local-indian-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      renderDocSlots(checkbox.closest('.guest-card'));
    });
  });
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
      phoneInput.value = '';
      card._phoneMaxDigits = computeMaxDigits();
    });

    // Block non-digits and enforce max length BEFORE the character is inserted,
    // so formatCurrentValue on 'input' only ever sees clean numeric input.
    phoneInput.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' || e.key === 'Delete' || e.key === 'Tab' ||
          e.key === 'Escape' || e.key.startsWith('Arrow') ||
          e.key === 'Home' || e.key === 'End' || e.ctrlKey || e.metaKey) return;
      if (!/^\d$/.test(e.key)) { e.preventDefault(); return; }
      const maxDigits = card._phoneMaxDigits;
      if (maxDigits && phoneInput.value.replace(/\D/g, '').length >= maxDigits) {
        e.preventDefault(); return;
      }
    });

    // Apply national formatting after each keystroke; clear error highlights
    phoneInput.addEventListener('input', () => {
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

// Renders the three document slots (Passport, Visa/OCI, Aadhar Card) for a guest card.
// Shows/hides foreigner vs local slots based on the Local Indian checkbox.
// Each slot shows EITHER an existing filename+✕ OR a new-file preview+✕ OR an upload button.
function renderDocSlots(card) {
  const isLocal = card.querySelector('.local-indian-checkbox').checked;

  card.querySelectorAll('.doc-slot').forEach(slot => {
    const isForeignerSlot = slot.classList.contains('foreigner-slot');
    const isLocalSlot = slot.classList.contains('local-slot');
    // Show the right slots for the selected identity type
    slot.style.display = (isLocal ? isLocalSlot : isForeignerSlot) ? 'block' : 'none';

    const slotName = slot.dataset.slot;
    const state = card._docSlots[slotName];
    const control = slot.querySelector('.doc-slot-control');
    control.innerHTML = '';

    if (state.existingFile) {
      // Show existing filename + X to remove
      const item = document.createElement('div');
      item.className = 'existing-file-item';

      const icon = document.createElement('span');
      icon.className = 'existing-file-icon';
      icon.textContent = '📎';

      const label = document.createElement('span');
      label.className = 'existing-file-name';
      label.textContent = state.existingFile.fileName;

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'existing-file-remove';
      removeBtn.setAttribute('aria-label', `Remove ${state.existingFile.fileName}`);
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', () => {
        state.existingFile = null;
        renderDocSlots(card);
      });

      item.appendChild(icon);
      item.appendChild(label);
      item.appendChild(removeBtn);
      control.appendChild(item);

    } else if (state.newFile) {
      // Show new file preview + X to remove
      const item = document.createElement('div');
      item.className = 'file-preview-item';

      const thumb = document.createElement('div');
      thumb.className = 'file-preview-thumb';
      if (state.newFile.objectUrl) {
        // objectUrl was created once when the file was selected; reuse it here
        // so re-renders (e.g. toggling Local Indian) never produce a broken image.
        const img = document.createElement('img');
        img.src = state.newFile.objectUrl;
        thumb.appendChild(img);
      } else {
        thumb.textContent = 'PDF';
        thumb.classList.add('file-preview-thumb-pdf');
      }

      const label = document.createElement('div');
      label.className = 'file-preview-name';
      label.textContent = state.newFile.file.name;

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'file-preview-remove';
      removeBtn.setAttribute('aria-label', `Remove ${state.newFile.file.name}`);
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', () => {
        // Revoke here — the only place the URL is discarded — not on img.onload.
        if (state.newFile.objectUrl) URL.revokeObjectURL(state.newFile.objectUrl);
        state.newFile = null;
        renderDocSlots(card);
      });

      item.appendChild(thumb);
      item.appendChild(label);
      item.appendChild(removeBtn);
      control.appendChild(item);

    } else {
      // Show upload button
      const hiddenInput = document.createElement('input');
      hiddenInput.type = 'file';
      hiddenInput.accept = 'image/*,application/pdf';
      hiddenInput.style.display = 'none';

      const uploadBtn = document.createElement('button');
      uploadBtn.type = 'button';
      uploadBtn.className = 'add-files-btn';
      uploadBtn.textContent = `+ Upload ${slotName}`;

      uploadBtn.addEventListener('click', () => hiddenInput.click());
      hiddenInput.addEventListener('change', () => {
        if (hiddenInput.files[0]) {
          const file = hiddenInput.files[0];
          const objectUrl = file.type && file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
          state.newFile = { file, objectUrl };
          renderDocSlots(card);
        }
      });

      control.appendChild(hiddenInput);
      control.appendChild(uploadBtn);
    }
  });
}

// ---------- Screen 2: Submit ----------
document.getElementById('rsvp-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  setError('form-error', '');
  clearFieldFlags(); // remove any previous red borders before re-validating

  if (!currentParty) return;

  const submitBtn = document.getElementById('submit-btn');
  const guestCards = document.querySelectorAll('.guest-card');
  const guestsPayload = [];

  for (const card of guestCards) {
    const name = card.dataset.guestName;
    const pickupRequired = card.dataset.pickupRequired === 'true';
    const rawFullName = card.querySelector('.full-name').value.trim();
    const fullName = toTitleCase(rawFullName); // capitalise first letter of each word

    // Phone: validate via intl-tel-input if available, else fall back to raw value
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

    // These fields only exist in the DOM at all when this party's "Pickup"
    // flag is set — otherwise there's nothing to read or validate, and the
    // payload sends "No"/blank for all of them.
    const overseasChecked = pickupRequired ? card.querySelector('.overseas-checkbox').checked : false;
    const domesticChecked = pickupRequired ? card.querySelector('.domestic-checkbox').checked : false;
    const arrivalFlightNumber = pickupRequired ? card.querySelector('.arrival-flight-number').value.trim() : '';
    const arrivalDate = pickupRequired ? card.querySelector('.arrival-date').value : '';
    const arrivalTime = pickupRequired ? card.querySelector('.arrival-time').value : '';
    const arrivalAirportInput = pickupRequired ? card.querySelector('.arrival-airport') : null;
    const arrivalAirport = arrivalAirportInput ? arrivalAirportInput.value.trim() : '';

    if (!fullName) {
      const el = card.querySelector('.full-name');
      setError('form-error', `Please enter the full name for ${name}.`);
      flagField(el);
      return;
    }

    if (pickupRequired && overseasChecked) {
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

    const isLocal = card.querySelector('.local-indian-checkbox').checked;
    const slots = card._docSlots;

    // Determine which slots are required based on Local Indian status
    const requiredSlots = isLocal ? ['Aadhar Card'] : ['Passport', 'Visa / OCI'];
    for (const slotName of requiredSlots) {
      const state = slots[slotName];
      if (!state.existingFile && !state.newFile) {
        const el = card.querySelector(`.doc-slot[data-slot="${slotName}"]`);
        setError('form-error', `Please upload a ${slotName} for ${name}.`);
        flagField(el);
        return;
      }
    }

    // Build per-slot payload
    const docSlotPayload = {};
    for (const [slotName, state] of Object.entries(slots)) {
      docSlotPayload[slotName] = {
        existingUrl: state.existingFile ? state.existingFile.url : null,
        newFile: state.newFile ? state.newFile.file : null
      };
    }

    guestsPayload.push({
      name, fullName, phone,
      localIndian: isLocal ? 'Yes' : 'No',
      travellingOverseas: overseasChecked ? 'Yes' : 'No',
      travellingDomestically: domesticChecked ? 'Yes' : 'No',
      arrivalFlightNumber, arrivalDate, arrivalTime, arrivalAirport,
      attendance,
      docSlots: docSlotPayload
    });
  }

  submitBtn.disabled = true;
  submitBtn.innerHTML = 'Submitting <span class="loading-dot"></span>';

  try {
    for (const guest of guestsPayload) {
      const encodedSlots = {};
      for (const [slotName, slot] of Object.entries(guest.docSlots)) {
        encodedSlots[slotName] = { existingUrl: slot.existingUrl };
        if (slot.newFile) {
          const base64 = await fileToBase64(slot.newFile);
          encodedSlots[slotName].newFile = {
            name: slot.newFile.name,
            mimeType: slot.newFile.type || 'application/octet-stream',
            base64
          };
        } else {
          encodedSlots[slotName].newFile = null;
        }
      }
      guest.docSlots = encodedSlots;
    }

    const res = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({ guests: guestsPayload })
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

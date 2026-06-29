// ---------- State ----------
let currentParty = null; // { matchedName, guests: [{ name, invitedEvents: [{name, dateTime}] }] }

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
function revokeCardObjectUrls() {
  document.querySelectorAll('.guest-card').forEach(card => {
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

    // The whole "Travel Details" block (the overseas tickbox + arrival
    // fields) only exists in the DOM at all if this party's "Pickup" flag
    // is set. When it's not set, none of these inputs are rendered, so
    // there's nothing to validate and nothing to submit for them.
    const travelDetailsHtml = pickupRequired ? `
      <h3 style="margin-top:24px;">Travel Details</h3>
      <label class="checkbox-label">
        <input type="checkbox" class="overseas-checkbox" ${isOverseasSaved ? 'checked' : ''} />
        Travelling from overseas
      </label>

      <div class="overseas-fields" data-active="${isOverseasSaved}">
        <label>Arrival flight number<span class="req">*</span></label>
        <input type="text" class="arrival-flight-number" placeholder="e.g. SQ123" value="${escapeHtml(saved.arrivalFlightNumber || '')}" ${isOverseasSaved ? '' : 'disabled'} />

        <label>Arrival travel date<span class="req">*</span></label>
        <input type="date" class="arrival-date" value="${escapeHtml(saved.arrivalDate || '')}" ${isOverseasSaved ? '' : 'disabled'} />

        <label>Arrival travel time<span class="req">*</span></label>
        <input type="time" class="arrival-time" value="${escapeHtml(saved.arrivalTime || '')}" ${isOverseasSaved ? '' : 'disabled'} />

        <label>Arrival airport<span class="req">*</span></label>
        <input type="text" class="arrival-airport" placeholder="e.g. Singapore Changi (SIN)" value="${escapeHtml(saved.arrivalAirport || '')}" ${isOverseasSaved ? '' : 'disabled'} />
      </div>
    ` : '';

    card.innerHTML = `
      <div class="guest-name-tag">Guest ${idx + 1}</div>
      <h2>${escapeHtml(guest.name)}</h2>

      <label>Full name<span class="req">*</span></label>
      <p class="helper-text">Full name as per passport</p>
      <input type="text" class="full-name" required placeholder="Exact name as on your travel document" value="${escapeHtml(saved.fullName || '')}" />

      <label>Phone number<span class="req">*</span></label>
      <input type="text" class="phone" required placeholder="+65 9123 4567" value="${escapeHtml(saved.phone || '')}" />

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
  });

  container.querySelectorAll('.overseas-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      const fieldsWrap = checkbox.closest('.guest-card').querySelector('.overseas-fields');
      const inputs = fieldsWrap.querySelectorAll('input');
      fieldsWrap.dataset.active = checkbox.checked;
      inputs.forEach(inp => {
        inp.disabled = !checkbox.checked;
        if (!checkbox.checked) inp.value = '';
      });
    });
  });

  container.querySelectorAll('.local-indian-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      renderDocSlots(checkbox.closest('.guest-card'));
    });
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

  if (!currentParty) return;

  const submitBtn = document.getElementById('submit-btn');
  const guestCards = document.querySelectorAll('.guest-card');
  const guestsPayload = [];

  for (const card of guestCards) {
    const name = card.dataset.guestName;
    const pickupRequired = card.dataset.pickupRequired === 'true';
    const fullName = card.querySelector('.full-name').value.trim();
    const phone = card.querySelector('.phone').value.trim();

    // These fields only exist in the DOM at all when this party's "Pickup"
    // flag is set — otherwise there's nothing to read or validate, and the
    // payload sends "No"/blank for all of them.
    const overseasChecked = pickupRequired ? card.querySelector('.overseas-checkbox').checked : false;
    const arrivalFlightNumber = pickupRequired ? card.querySelector('.arrival-flight-number').value.trim() : '';
    const arrivalDate = pickupRequired ? card.querySelector('.arrival-date').value : '';
    const arrivalTime = pickupRequired ? card.querySelector('.arrival-time').value : '';
    const arrivalAirport = pickupRequired ? card.querySelector('.arrival-airport').value.trim() : '';
    if (!fullName || !phone) {
      setError('form-error', `Please complete all required fields for ${name}.`);
      return;
    }

    if (pickupRequired && overseasChecked && (!arrivalFlightNumber || !arrivalDate || !arrivalTime || !arrivalAirport)) {
      setError('form-error', `Please complete the overseas travel details for ${name}.`);
      return;
    }

    const attendance = {};
    let attendanceOk = true;
    card.querySelectorAll('.attendance-select').forEach(sel => {
      if (!sel.value) attendanceOk = false;
      attendance[sel.dataset.event] = sel.value;
    });
    if (!attendanceOk) {
      setError('form-error', `Please confirm attendance for every event for ${name}.`);
      return;
    }

    const isLocal = card.querySelector('.local-indian-checkbox').checked;
    const slots = card._docSlots;

    // Determine which slots are required based on Local Indian status
    const requiredSlots = isLocal ? ['Aadhar Card'] : ['Passport', 'Visa / OCI'];
    for (const slotName of requiredSlots) {
      const state = slots[slotName];
      if (!state.existingFile && !state.newFile) {
        setError('form-error', `Please upload a ${slotName} for ${name}.`);
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

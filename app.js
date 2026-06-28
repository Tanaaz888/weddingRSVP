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

    if (data.error) {
      setError('welcome-error', data.error);
      return;
    }

    currentParty = data;
    document.getElementById('welcome-name').textContent = data.matchedName;
    document.getElementById('form-name').textContent = data.matchedName;
    renderEvents(data.guests);
    renderGuestForms(data.guests);
    show('form-screen');
  } catch (err) {
    setError('welcome-error', 'Something went wrong reaching the guest list. Please try again.');
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Continue';
  }
}

// ---------- Screen 2: Form rendering ----------

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

function renderGuestForms(guests) {
  const container = document.getElementById('guests-container');
  container.innerHTML = '';

  guests.forEach((guest, idx) => {
    const card = document.createElement('div');
    card.className = 'guest-card';
    card.dataset.guestName = guest.name;

    let attendanceHtml = '';
    if (guest.invitedEvents.length) {
      guest.invitedEvents.forEach(ev => {
        attendanceHtml += `
          <div class="attendance-row">
            <span>
              <span class="ename">${escapeHtml(ev.name)}</span>
              <span class="edate">${escapeHtml(ev.dateTime)}</span>
            </span>
            <select class="attendance-select" data-event="${escapeHtml(ev.name)}" required>
              <option value="" disabled selected>Select</option>
              <option value="Yes">Attending</option>
              <option value="No">Not Attending</option>
            </select>
          </div>`;
      });
    } else {
      attendanceHtml = '<p class="subline" style="margin:8px 0; text-align:left;">No events listed for this guest.</p>';
    }

    card.innerHTML = `
      <div class="guest-name-tag">Guest ${idx + 1}</div>
      <h2>${escapeHtml(guest.name)}</h2>

      <label>Full name<span class="req">*</span></label>
      <p class="helper-text">Full name as per passport</p>
      <input type="text" class="full-name" required placeholder="Exact name as on your travel document" />

      <label>Phone number<span class="req">*</span></label>
      <input type="text" class="phone" required placeholder="+65 9123 4567" />

      <h3 style="margin-top:24px;">Confirm Attendance</h3>
      ${attendanceHtml}

      <h3 style="margin-top:24px;">Travel Details</h3>
      <label class="checkbox-label">
        <input type="checkbox" class="overseas-checkbox" />
        Travelling from overseas
      </label>

      <div class="overseas-fields" data-active="false">
        <label>Arrival flight number<span class="req">*</span></label>
        <input type="text" class="arrival-flight-number" placeholder="e.g. SQ123" disabled />

        <label>Arrival travel date<span class="req">*</span></label>
        <input type="date" class="arrival-date" disabled />

        <label>Arrival travel time<span class="req">*</span></label>
        <input type="time" class="arrival-time" disabled />

        <label>Arrival airport<span class="req">*</span></label>
        <input type="text" class="arrival-airport" placeholder="e.g. Singapore Changi (SIN)" disabled />
      </div>

      <label>Photo(s) for verification (Passport / Visa / OCI / Aadhar card)<span class="req">*</span> <span style="font-weight:400;">(upload as many as needed)</span></label>
      <div class="file-input-wrap">
        Tap to upload photo(s)
        <input type="file" class="id-files" accept="image/*,application/pdf" multiple required />
        <div class="file-list"></div>
      </div>
    `;
    container.appendChild(card);
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

  container.querySelectorAll('.id-files').forEach(input => {
    input.addEventListener('change', () => {
      const listEl = input.parentElement.querySelector('.file-list');
      listEl.innerHTML = '';
      Array.from(input.files).forEach(f => {
        const d = document.createElement('div');
        d.textContent = `✓ ${f.name}`;
        listEl.appendChild(d);
      });
    });
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
    const fullName = card.querySelector('.full-name').value.trim();
    const phone = card.querySelector('.phone').value.trim();
    const overseasChecked = card.querySelector('.overseas-checkbox').checked;
    const arrivalFlightNumber = card.querySelector('.arrival-flight-number').value.trim();
    const arrivalDate = card.querySelector('.arrival-date').value;
    const arrivalTime = card.querySelector('.arrival-time').value;
    const arrivalAirport = card.querySelector('.arrival-airport').value.trim();
    const fileInput = card.querySelector('.id-files');
    const files = Array.from(fileInput.files);

    if (!fullName || !phone || files.length === 0) {
      setError('form-error', `Please complete all required fields for ${name}.`);
      return;
    }

    if (overseasChecked && (!arrivalFlightNumber || !arrivalDate || !arrivalTime || !arrivalAirport)) {
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

    guestsPayload.push({
      name, fullName, phone,
      travellingOverseas: overseasChecked ? 'Yes' : 'No',
      arrivalFlightNumber, arrivalDate, arrivalTime, arrivalAirport,
      attendance, _files: files
    });
  }

  submitBtn.disabled = true;
  submitBtn.innerHTML = 'Submitting <span class="loading-dot"></span>';

  try {
    for (const guest of guestsPayload) {
      const encoded = [];
      for (const file of guest._files) {
        const base64 = await fileToBase64(file);
        encoded.push({ name: file.name, mimeType: file.type || 'application/octet-stream', base64 });
      }
      guest.files = encoded;
      delete guest._files;
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

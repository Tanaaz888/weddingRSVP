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

document.getElementById('back-from-not-leader-btn').addEventListener('click', () => {
  show('welcome-screen');
});

document.getElementById('form-back-btn').addEventListener('click', () => {
  currentParty = null;
  document.getElementById('rsvp-form').reset();
  document.getElementById('guests-container').innerHTML = '';
  setError('form-error', '');
  show('welcome-screen');
});

document.getElementById('return-home-btn').addEventListener('click', () => {
  currentParty = null;
  document.getElementById('name-input').value = '';
  document.getElementById('rsvp-form').reset();
  document.getElementById('guests-container').innerHTML = '';
  setError('welcome-error', '');
  setError('form-error', '');
  show('welcome-screen');
});

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
    const saved = guest.savedData || {};
    const card = document.createElement('div');
    card.className = 'guest-card';
    card.dataset.guestName = guest.name;

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

      <label>Photo(s) for verification (Passport / Visa / OCI / Aadhar card)<span class="req">*</span> <span style="font-weight:400;">(upload as many as needed)</span></label>
      <div class="file-input-wrap">
        <input type="file" class="id-files-input" accept="image/*,application/pdf" multiple style="display:none" />
        <button type="button" class="add-files-btn">+ Add Attachment(s)</button>
        <div class="existing-files-list"></div>
        <div class="file-previews"></div>
      </div>
    `;
    container.appendChild(card);
    card._idFiles = []; // newly added files this session (with preview thumbnails)
    card._existingFiles = (saved.existingFiles || []).slice(); // previously uploaded — filename only, no preview
    renderExistingFiles(card);
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

  container.querySelectorAll('.guest-card').forEach(card => {
    const hiddenInput = card.querySelector('.id-files-input');
    const addBtn = card.querySelector('.add-files-btn');

    addBtn.addEventListener('click', () => hiddenInput.click());

    hiddenInput.addEventListener('change', () => {
      Array.from(hiddenInput.files).forEach(file => card._idFiles.push(file));
      hiddenInput.value = ''; // reset so the same file can be re-added later if removed
      renderFilePreviews(card);
    });
  });
}

// Previously uploaded attachments — filename only, no thumbnail/preview/link (privacy).
function renderExistingFiles(card) {
  const wrap = card.querySelector('.existing-files-list');
  wrap.innerHTML = '';

  card._existingFiles.forEach((file, index) => {
    const item = document.createElement('div');
    item.className = 'existing-file-item';

    const icon = document.createElement('span');
    icon.className = 'existing-file-icon';
    icon.textContent = '📎';

    const label = document.createElement('span');
    label.className = 'existing-file-name';
    label.textContent = file.fileName;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'existing-file-remove';
    removeBtn.setAttribute('aria-label', `Remove ${file.fileName}`);
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => {
      card._existingFiles.splice(index, 1);
      renderExistingFiles(card);
    });

    item.appendChild(icon);
    item.appendChild(label);
    item.appendChild(removeBtn);
    wrap.appendChild(item);
  });
}

function renderFilePreviews(card) {
  const wrap = card.querySelector('.file-previews');
  wrap.innerHTML = '';

  card._idFiles.forEach((file, index) => {
    const item = document.createElement('div');
    item.className = 'file-preview-item';

    const thumb = document.createElement('div');
    thumb.className = 'file-preview-thumb';
    if (file.type && file.type.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      img.onload = () => URL.revokeObjectURL(img.src);
      thumb.appendChild(img);
    } else {
      thumb.textContent = 'PDF';
      thumb.classList.add('file-preview-thumb-pdf');
    }

    const label = document.createElement('div');
    label.className = 'file-preview-name';
    label.textContent = file.name;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'file-preview-remove';
    removeBtn.setAttribute('aria-label', `Remove ${file.name}`);
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => {
      card._idFiles.splice(index, 1);
      renderFilePreviews(card);
    });

    item.appendChild(thumb);
    item.appendChild(label);
    item.appendChild(removeBtn);
    wrap.appendChild(item);
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
    const newFiles = card._idFiles || [];
    const keptExisting = card._existingFiles || [];

    if (!fullName || !phone || (newFiles.length + keptExisting.length) === 0) {
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
      attendance,
      existingFiles: keptExisting.map(f => f.url),
      _files: newFiles
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

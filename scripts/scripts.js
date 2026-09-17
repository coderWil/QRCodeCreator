// Event QR Code Creator
//
// Builds an RFC 5545 iCalendar (.ics) VEVENT from the form, encodes it as
// the payload of a QR code, and renders that QR code as inline SVG. Phone
// camera apps that recognize VCALENDAR/VEVENT text in a scanned QR code
// (iOS Camera, most Android scanners) offer an "Add to Calendar" action
// directly &ndash; no server or file download required for that flow to work.
//
// qrcode.js (vendored, ./scripts/qrcode.js) only *registers* a UTF-8 byte
// encoder, it doesn't use it by default &ndash; its default stringToBytes just
// masks each char code to 8 bits, which mangles anything outside ASCII.
// Switch it over before any addData() call so accented text, curly quotes,
// etc. in titles/descriptions survive the round trip.
qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];

(function () {
  'use strict';

  var form = document.getElementById('eventForm');
  var qrTypeSelect = document.getElementById('qrType');
  var eventFields = document.getElementById('eventFields');
  var websiteFields = document.getElementById('websiteFields');
  var websiteUrlInput = document.getElementById('websiteUrl');
  var websiteUrlError = document.getElementById('websiteUrlError');
  var formHeading = document.getElementById('form-heading');
  var formIntro = document.getElementById('formIntro');
  var resultCaption = document.getElementById('resultCaption');
  var titleInput = document.getElementById('eventTitle');
  var locationInput = document.getElementById('eventLocation');
  var mooseLodgeSelect = document.getElementById('mooseLodgeLocation');
  var lodgeListHint = document.getElementById('lodgeListHint');
  var descriptionInput = document.getElementById('eventDescription');
  var allDayCheckbox = document.getElementById('allDay');
  var mooseLodgeToggle = document.getElementById('mooseLodge');

  var startDateInput = document.getElementById('startDate');
  var startHourSelect = document.getElementById('startHour');
  var startMinuteSelect = document.getElementById('startMinute');
  var startAmPmSelect = document.getElementById('startAmPm');
  var startTimeGroup = document.getElementById('startTimeGroup');

  var endDateInput = document.getElementById('endDate');
  var endHourSelect = document.getElementById('endHour');
  var endMinuteSelect = document.getElementById('endMinute');
  var endAmPmSelect = document.getElementById('endAmPm');
  var endTimeGroup = document.getElementById('endTimeGroup');

  var eventTitleError = document.getElementById('eventTitleError');
  var startDateError = document.getElementById('startDateError');
  var endDateError = document.getElementById('endDateError');
  var formError = document.getElementById('formError');

  var resultPlaceholder = document.getElementById('resultPlaceholder');
  var resultOutput = document.getElementById('resultOutput');
  var qrContainer = document.getElementById('qrContainer');
  var qrWrapper = document.getElementById('qrWrapper');
  var downloadBtn = document.getElementById('downloadBtn');
  var generateBtn = document.getElementById('generateBtn');

  var formCard = document.querySelector('.form-card');
  var resultCard = document.querySelector('.result-card');

  var currentSvgMarkup = null;
  var currentFileSlug = 'event';

  // Event Location and the Moose Lodge toggle are remembered across visits
  // via localStorage so a returning user doesn't have to re-enter them.
  // Nothing else on the form is persisted.
  var STORAGE_KEYS = {
    location: 'eventQrCreator.eventLocation',
    mooseLodgeOn: 'eventQrCreator.mooseLodgeOn',
    mooseLodgeSelection: 'eventQrCreator.mooseLodgeSelection'
  };

  var TYPE_COPY = {
    event: {
      heading: 'Event Details',
      intro: 'Fill in your event, then generate a QR code anyone can scan to add it to their calendar.',
      caption: 'Scan with a phone camera to add this event to your calendar.'
    },
    website: {
      heading: 'Website Details',
      intro: 'Enter a URL, then generate a QR code anyone can scan to open it in their browser.',
      caption: 'Scan with a phone camera to open this website.'
    }
  };

  populateMinutes(startMinuteSelect);
  populateMinutes(endMinuteSelect);
  restoreSavedLocation();
  setQrTypeMode(qrTypeSelect.value);

  qrTypeSelect.addEventListener('change', function () {
    setQrTypeMode(qrTypeSelect.value);
  });

  // Swaps the form between the Event ICS fields and the single Website URL
  // field based on the top-of-page type selector. Both share the same
  // generate button and result panel &ndash; only the fields collected and the
  // payload built from them differ.
  function setQrTypeMode(type) {
    var isWebsite = type === 'website';
    eventFields.hidden = isWebsite;
    websiteFields.hidden = !isWebsite;

    var copy = TYPE_COPY[isWebsite ? 'website' : 'event'];
    formHeading.textContent = copy.heading;
    formIntro.textContent = copy.intro;
    resultCaption.textContent = copy.caption;

    formError.textContent = '';
    clearFieldError(websiteUrlInput, websiteUrlError);
    clearFieldError(titleInput, eventTitleError);
    clearFieldError(startDateInput, startDateError);
    clearFieldError(endDateInput, endDateError);
  }

  allDayCheckbox.addEventListener('change', function () {
    startTimeGroup.hidden = allDayCheckbox.checked;
    endTimeGroup.hidden = allDayCheckbox.checked;
  });

  locationInput.addEventListener('input', function () {
    writeStoredValue(STORAGE_KEYS.location, locationInput.value);
  });

  mooseLodgeSelect.addEventListener('change', function () {
    writeStoredValue(STORAGE_KEYS.mooseLodgeSelection, mooseLodgeSelect.value);
  });

  mooseLodgeToggle.addEventListener('click', function () {
    var isOn = mooseLodgeToggle.getAttribute('aria-checked') === 'true';
    var turningOn = !isOn;
    setMooseLodgeMode(turningOn);
    writeStoredValue(STORAGE_KEYS.mooseLodgeOn, String(turningOn));
    if (turningOn) {
      mooseLodgeSelect.focus();
    } else {
      locationInput.focus();
    }
  });

  // Swaps Event Location between the free-text input and the LA County
  // lodge dropdown &ndash; only one is ever the "live" control read on submit.
  // Shared by the toggle's click handler and the on-load restore below so
  // both stay in sync with a single source of truth for the visual state.
  function setMooseLodgeMode(turningOn) {
    mooseLodgeToggle.setAttribute('aria-checked', String(turningOn));
    locationInput.hidden = turningOn;
    mooseLodgeSelect.hidden = !turningOn;
    lodgeListHint.hidden = !turningOn;
  }

  function restoreSavedLocation() {
    var savedLocation = readStoredValue(STORAGE_KEYS.location);
    if (savedLocation !== null) {
      locationInput.value = savedLocation;
    }

    var savedSelection = readStoredValue(STORAGE_KEYS.mooseLodgeSelection);
    if (savedSelection !== null && selectHasOption(mooseLodgeSelect, savedSelection)) {
      mooseLodgeSelect.value = savedSelection;
    }

    setMooseLodgeMode(readStoredValue(STORAGE_KEYS.mooseLodgeOn) === 'true');
  }

  function selectHasOption(selectEl, value) {
    for (var i = 0; i < selectEl.options.length; i++) {
      if (selectEl.options[i].value === value) return true;
    }
    return false;
  }

  function readStoredValue(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (err) {
      return null;
    }
  }

  function writeStoredValue(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (err) {
      // Private browsing / disabled storage &ndash; persistence just won't work.
    }
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    flashElement(generateBtn, 'flash-press');
    handleSubmit();
  });

  downloadBtn.addEventListener('click', downloadQrAsPng);

  function populateMinutes(select) {
    for (var m = 0; m < 60; m++) {
      var value = pad2(m);
      var opt = document.createElement('option');
      opt.value = value;
      opt.textContent = value;
      select.appendChild(opt);
    }
    select.value = '00';
  }

  function handleSubmit() {
    if (qrTypeSelect.value === 'website') {
      handleWebsiteSubmit();
    } else {
      handleEventSubmit();
    }
  }

  function handleWebsiteSubmit() {
    clearFieldError(websiteUrlInput, websiteUrlError);
    formError.textContent = '';

    var rawUrl = websiteUrlInput.value.trim();

    if (!rawUrl) {
      showFieldError(websiteUrlInput, websiteUrlError, 'A URL is required.');
      return;
    }

    // A bare "example.com" is a common thing to type here but isn't a valid
    // absolute URL (and most scanners won't treat it as a link) without a
    // scheme, so assume https:// when the user left one off.
    var url = /^[a-z][a-z0-9+.-]*:/i.test(rawUrl) ? rawUrl : 'https://' + rawUrl;

    try {
      new URL(url);
    } catch (err) {
      showFieldError(websiteUrlInput, websiteUrlError, 'Enter a valid website address.');
      return;
    }

    try {
      renderQrCode(url, 'QR code that opens ' + url + ' when scanned', 'Open website: ' + url);
      currentFileSlug = slugify(url.replace(/^https?:\/\//i, ''));
    } catch (err) {
      formError.textContent = 'This URL is too long to fit in a QR code.';
    }
  }

  function handleEventSubmit() {
    clearFieldError(titleInput, eventTitleError);
    clearFieldError(startDateInput, startDateError);
    clearFieldError(endDateInput, endDateError);
    formError.textContent = '';

    var title = titleInput.value.trim();
    var isMooseLodgeEvent = mooseLodgeToggle.getAttribute('aria-checked') === 'true';
    var location = (isMooseLodgeEvent ? mooseLodgeSelect.value : locationInput.value).trim();
    var description = descriptionInput.value.trim();
    var allDay = allDayCheckbox.checked;
    var startDate = startDateInput.value;
    var endDate = endDateInput.value;

    var hasError = false;

    if (!title) {
      showFieldError(titleInput, eventTitleError, 'Event title is required.');
      hasError = true;
    }
    if (!startDate) {
      showFieldError(startDateInput, startDateError, 'Event start date is required.');
      hasError = true;
    }

    var dtStart, dtEnd, dtStartDate, dtEndDate;

    if (!hasError) {
      if (allDay) {
        dtStartDate = formatDateOnly(startDate);
        if (endDate && endDate < startDate) {
          showFieldError(endDateInput, endDateError, 'End date must be on or after the start date.');
          hasError = true;
        } else {
          var lastDay = endDate || startDate;
          dtEndDate = formatDateOnly(addDays(lastDay, 1));
        }
      } else {
        var startHour24 = to24Hour(parseInt(startHourSelect.value, 10), startAmPmSelect.value);
        var startMinute = parseInt(startMinuteSelect.value, 10);
        dtStart = formatFloatingDateTime(startDate, startHour24, startMinute);

        if (endDate) {
          var endHour24 = to24Hour(parseInt(endHourSelect.value, 10), endAmPmSelect.value);
          var endMinute = parseInt(endMinuteSelect.value, 10);
          dtEnd = formatFloatingDateTime(endDate, endHour24, endMinute);

          if (dtEnd <= dtStart) {
            showFieldError(endDateInput, endDateError, 'End date and time must be after the start date and time.');
            hasError = true;
          }
        } else {
          var plusOne = addOneHour(startDate, startHour24, startMinute);
          dtEnd = formatFloatingDateTime(plusOne.dateStr, plusOne.hour, plusOne.minute);
        }
      }
    }

    if (hasError) {
      return;
    }

    var evt = {
      uid: makeUid(),
      dtstamp: formatUtcStamp(new Date()),
      allDay: allDay,
      dtStart: dtStart,
      dtEnd: dtEnd,
      dtStartDate: dtStartDate,
      dtEndDate: dtEndDate,
      title: title,
      location: location,
      description: description,
      isMooseLodgeEvent: isMooseLodgeEvent
    };

    var icsText = buildIcs(evt);

    try {
      renderQrCode(icsText, 'QR code that adds "' + title + '" to your calendar when scanned', 'Add to calendar: ' + title);
      currentFileSlug = slugify(title);
    } catch (err) {
      formError.textContent = 'This event’s details are too long to fit in a QR code. Try shortening the description.';
    }
  }

  function renderQrCode(payload, altText, titleText) {
    var qr = qrcode(0, 'M');
    qr.addData(payload);
    qr.make();

    var svg = qr.createSvgTag({
      cellSize: 6,
      margin: 4,
      alt: altText,
      title: titleText
    });

    qrContainer.innerHTML = svg;
    currentSvgMarkup = svg;

    resultPlaceholder.hidden = true;
    resultOutput.hidden = false;
    flashElement(qrWrapper, 'flash-new');
    flashElement(qrContainer, 'reveal-in');

    // requestAnimationFrame so the layout has reflowed after the hidden
    // toggle above before we measure it &ndash; otherwise resultCard's rect can
    // still reflect its old (placeholder) height.
    window.requestAnimationFrame(scrollToResultIfBelowForm);
  }

  // On narrow viewports the two-column .layout grid (styles.css) stacks to
  // one column, pushing the result card below the form instead of beside
  // it. Detect that purely from geometry &ndash; the result card's top sitting
  // at/after the form card's bottom edge &ndash; rather than duplicating the
  // CSS breakpoint here, then scroll the newly-generated QR code into view.
  function scrollToResultIfBelowForm() {
    var formRect = formCard.getBoundingClientRect();
    var resultRect = resultCard.getBoundingClientRect();
    var isStackedBelowForm = resultRect.top >= formRect.bottom - 1;

    if (isStackedBelowForm) {
      resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function downloadQrAsPng() {
    if (!currentSvgMarkup) return;

    var svgBlob = new Blob([currentSvgMarkup], { type: 'image/svg+xml;charset=utf-8' });
    var url = URL.createObjectURL(svgBlob);
    var img = new Image();

    img.onload = function () {
      var canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      canvas.toBlob(function (blob) {
        var pngUrl = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = pngUrl;
        a.download = currentFileSlug + '-qr-code.png';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(pngUrl); }, 1000);
      }, 'image/png');
    };

    img.src = url;
  }

  // ---------------------------------------------------------------
  // iCalendar (.ics) construction
  // ---------------------------------------------------------------

  function buildIcs(evt) {
    var lines = [];
    lines.push('BEGIN:VCALENDAR');
    lines.push('VERSION:2.0');
    lines.push('PRODID:-//Event QR Code Creator//EN');
    lines.push('CALSCALE:GREGORIAN');
    lines.push('METHOD:PUBLISH');
    lines.push('BEGIN:VEVENT');
    lines.push('UID:' + evt.uid);
    lines.push('DTSTAMP:' + evt.dtstamp);

    if (evt.allDay) {
      lines.push('DTSTART;VALUE=DATE:' + evt.dtStartDate);
      lines.push('DTEND;VALUE=DATE:' + evt.dtEndDate);
    } else {
      lines.push('DTSTART:' + evt.dtStart);
      lines.push('DTEND:' + evt.dtEnd);
    }

    lines.push('SUMMARY:' + escapeIcsText(evt.title));
    if (evt.location) lines.push('LOCATION:' + escapeIcsText(evt.location));
    if (evt.description) lines.push('DESCRIPTION:' + escapeIcsText(evt.description));
    if (evt.isMooseLodgeEvent) lines.push('CATEGORIES:MOOSE LODGE');

    lines.push('END:VEVENT');
    lines.push('END:VCALENDAR');

    return lines.map(foldIcsLine).join('\r\n') + '\r\n';
  }

  // RFC 5545 3.3.11: backslash, semicolon, and comma are escaped with a
  // leading backslash; newlines become the two-character sequence \n.
  function escapeIcsText(str) {
    return String(str)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r\n|\r|\n/g, '\\n');
  }

  // RFC 5545 3.1: content lines longer than 75 octets must be folded with
  // CRLF + a single leading space. Split on byte boundaries (not char
  // boundaries) so folding never lands mid-UTF-8-sequence.
  function foldIcsLine(line) {
    var bytes = Array.from(new TextEncoder().encode(line));
    if (bytes.length <= 75) return line;

    var decoder = new TextDecoder();
    var segments = [];
    var i = 0;
    var limit = 75;

    while (i < bytes.length) {
      var end = Math.min(i + limit, bytes.length);
      while (end < bytes.length && (bytes[end] & 0xC0) === 0x80) end--;
      segments.push(decoder.decode(new Uint8Array(bytes.slice(i, end))));
      i = end;
      limit = 74; // continuation lines carry a leading space that counts toward the 75-octet cap
    }

    return segments.join('\r\n ');
  }

  function makeUid() {
    var id = (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2);
    return id + '@event-qr-creator.local';
  }

  function formatUtcStamp(date) {
    return date.getUTCFullYear() + pad2(date.getUTCMonth() + 1) + pad2(date.getUTCDate()) +
      'T' + pad2(date.getUTCHours()) + pad2(date.getUTCMinutes()) + pad2(date.getUTCSeconds()) + 'Z';
  }

  // ---------------------------------------------------------------
  // Date/time helpers
  //
  // DTSTART/DTEND are emitted as "floating" local time (no Z, no TZID)
  // since the form has no timezone field &ndash; calendar apps interpret these
  // in the viewer's own local timezone, which matches what the organizer
  // typed without requiring them to think about UTC offsets.
  // ---------------------------------------------------------------

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function to24Hour(hour12, ampm) {
    var h = hour12 % 12;
    if (ampm === 'PM') h += 12;
    return h;
  }

  function formatFloatingDateTime(dateStr, hour, minute) {
    var parts = dateStr.split('-');
    return parts[0] + parts[1] + parts[2] + 'T' + pad2(hour) + pad2(minute) + '00';
  }

  function formatDateOnly(dateStr) {
    var parts = dateStr.split('-');
    return parts[0] + parts[1] + parts[2];
  }

  function addDays(dateStr, days) {
    var parts = dateStr.split('-').map(Number);
    var dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.getUTCFullYear() + '-' + pad2(dt.getUTCMonth() + 1) + '-' + pad2(dt.getUTCDate());
  }

  function addOneHour(dateStr, hour24, minute) {
    var parts = dateStr.split('-').map(Number);
    var dt = new Date(parts[0], parts[1] - 1, parts[2], hour24, minute, 0);
    dt.setHours(dt.getHours() + 1);
    return {
      dateStr: dt.getFullYear() + '-' + pad2(dt.getMonth() + 1) + '-' + pad2(dt.getDate()),
      hour: dt.getHours(),
      minute: dt.getMinutes()
    };
  }

  function slugify(str) {
    return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'event';
  }

  // Re-triggers a CSS animation class even if it's already present (e.g. the
  // user clicks Generate again before the previous flash finished) &ndash; the
  // reflow forced by reading offsetWidth is what makes the restart work.
  function flashElement(el, className) {
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
  }

  // ---------------------------------------------------------------
  // Validation UI
  // ---------------------------------------------------------------

  function showFieldError(input, errorEl, message) {
    errorEl.textContent = message;
    input.setAttribute('aria-invalid', 'true');
  }

  function clearFieldError(input, errorEl) {
    errorEl.textContent = '';
    input.removeAttribute('aria-invalid');
  }
})();

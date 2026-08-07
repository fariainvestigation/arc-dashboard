/* Hero video autoplay.
 *
 * Ported from the prototype's DCLogic componentDidMount: force muted/looping/
 * inline playback and retry, because a browser can refuse the first play()
 * (autoplay policy, tab restored from background, video not yet buffered).
 * The retry timer stops once every video is actually playing and re-arms if
 * one falls back to paused. */
(function () {
  'use strict';

  var videos = Array.prototype.slice.call(document.querySelectorAll('video[autoplay]'));
  if (!videos.length) return;

  var RETRY_MS = 1500;
  var timer = null;

  function arm() {
    if (timer === null) timer = setInterval(kick, RETRY_MS);
  }

  function disarm() {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  function kick() {
    var allPlaying = true;

    videos.forEach(function (video) {
      video.muted = true;
      video.defaultMuted = true;
      video.loop = true;
      video.playsInline = true;

      if (!video.paused) return;

      allPlaying = false;
      var played = video.play();
      if (played && played.catch) played.catch(function () { /* blocked -- retry */ });
    });

    if (allPlaying) disarm();
    else arm();
  }

  kick();

  document.addEventListener('visibilitychange', kick);
  // Autoplay stays blocked until the page has been interacted with in some
  // browsers; the first user gesture is the reliable moment to try again.
  document.addEventListener('click', kick, { once: true });
  window.addEventListener('pagehide', disarm);
})();


/* Form validation for the sign-in and contact forms.
 *
 * These forms have no server behind them yet. Validation is real -- it catches
 * what the visitor got wrong before anything is submitted -- but submission
 * deliberately reports that the form is not connected. It must never imply a
 * successful sign-in or a delivered message. Wire the fetch() to the real
 * endpoint in submit() below when the backend exists. */
(function () {
  'use strict';

  var forms = document.querySelectorAll('#signin-form, #contact-form, #newcase-form');
  if (!forms.length) return;

  var RULES = {
    email: function (v) {
      if (!v) return 'Enter your email address.';
      // Deliberately loose: the server is the only real authority on whether
      // an address exists, and strict patterns reject valid addresses.
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Enter a valid email address.';
      return '';
    },
    password: function (v) {
      if (!v) return 'Enter your password.';
      if (v.length < 8) return 'Passwords are at least 8 characters.';
      return '';
    },
    name: function (v) { return v ? '' : 'Enter your name.'; },
    message: function (v) {
      if (!v) return 'Tell us how we can help.';
      if (v.length < 10) return 'Please add a little more detail.';
      return '';
    },
    task: function (v) {
      if (!v) return 'Describe the first task.';
      if (v.length < 5) return 'Please add a little more detail.';
      return '';
    },
  };

  function ruleFor(input) {
    if (RULES[input.name]) return RULES[input.name];
    // Any other required field gets the baseline check, so a new form field
    // is validated without registering a rule for it.
    if (input.required) return function (v) { return v ? '' : 'This field is required.'; };
    return null;
  }

  function validate(input) {
    var rule = ruleFor(input);
    if (!rule) return true;

    var message = rule(input.value.trim());
    var field = input.closest('.field');
    var slot = field && field.querySelector('[data-error-for="' + input.name + '"]');

    if (field) field.classList.toggle('field--invalid', !!message);
    if (slot) slot.textContent = message;
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    return !message;
  }

  Array.prototype.forEach.call(forms, function (form) {
    var fields = form.querySelectorAll('.field__input');
    var notice = form.querySelector('[data-signin-notice]');

    Array.prototype.forEach.call(fields, function (input) {
      // Validate on blur, then live once a field is already flagged, so the
      // error clears as it gets fixed rather than nagging mid-typing.
      input.addEventListener('blur', function () { validate(input); });
      input.addEventListener('input', function () {
        var field = input.closest('.field');
        if (field && field.classList.contains('field--invalid')) validate(input);
      });
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();

      var firstInvalid = null;
      Array.prototype.forEach.call(fields, function (input) {
        if (!validate(input) && !firstInvalid) firstInvalid = input;
      });

      if (firstInvalid) {
        firstInvalid.focus();
        if (notice) notice.hidden = true;
        return;
      }

      if (notice) {
        notice.textContent = form.id === 'contact-form'
          ? 'This form is not connected to a mail service yet, so nothing was sent. Contact ARC directly using the details on this page.'
          : form.id === 'newcase-form'
            ? 'The portal is not connected to a case system yet, so nothing was saved. This form shows how opening a case will work.'
            : 'Sign-in is not connected yet -- this portal still needs its account system. Nobody has been signed in.';
        notice.hidden = false;
        notice.setAttribute('role', 'status');
      }
    });
  });
})();

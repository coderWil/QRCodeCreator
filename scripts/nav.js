// Site navigation: hamburger toggle for the top nav bar, shared by every
// page (index.html, about.html, contact.html). Kept separate from
// scripts.js since that file assumes the event form's elements exist,
// which isn't true outside index.html.
(function () {
  'use strict';

  var toggle = document.getElementById('navToggle');
  var links = document.getElementById('navLinks');
  if (!toggle || !links) return;

  toggle.addEventListener('click', function () {
    var isOpen = links.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(isOpen));
  });

  // If the viewport grows past the hamburger breakpoint while the panel is
  // open (e.g. rotating a tablet), close it so it doesn't get stuck open
  // once the layout switches back to the inline desktop nav.
  window.addEventListener('resize', function () {
    if (window.innerWidth > 500 && links.classList.contains('open')) {
      links.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });
})();

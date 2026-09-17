// About page: switches between the Event ICS and Website explanations via
// a standard two-tab pattern (roving tabindex, arrow-key navigation).
// Scoped to about.html &ndash; the tab markup doesn't exist elsewhere.
(function () {
  'use strict';

  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab-button'));
  if (!tabs.length) return;

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      selectTab(tab);
    });

    tab.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      var currentIndex = tabs.indexOf(tab);
      var nextIndex = e.key === 'ArrowRight'
        ? (currentIndex + 1) % tabs.length
        : (currentIndex - 1 + tabs.length) % tabs.length;
      selectTab(tabs[nextIndex]);
      tabs[nextIndex].focus();
    });
  });

  function selectTab(selectedTab) {
    tabs.forEach(function (tab) {
      var isSelected = tab === selectedTab;
      tab.setAttribute('aria-selected', String(isSelected));
      tab.tabIndex = isSelected ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !isSelected;
    });
  }
})();

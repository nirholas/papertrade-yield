(function () {
  try {
    if (new URLSearchParams(window.location.search).get('embed') === '1') {
      document.documentElement.setAttribute('data-embed', '1');
    }
  } catch (e) {}
})();

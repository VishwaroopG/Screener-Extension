// Sets the browser variant on the welcome page (?browser=firefox from the
// Firefox build, Chrome by default). No inline script needed (MV3 CSP).
(function () {
  try {
    var params = new URLSearchParams(window.location.search || '');
    var b = params.get('browser') === 'firefox' ? 'firefox' : 'chrome';
    document.documentElement.setAttribute('data-browser', b);
  } catch (e) {}
})();

(function () {
  try {
    if (sessionStorage.getItem("cz-proposals-unlock") === "1") {
      document.documentElement.classList.add("proposals-unlocked");
    }
  } catch (e) {}

  try {
    var screenW = Math.min(screen.width || 0, screen.height || 0);
    var narrow = window.matchMedia("(max-width: 720px)").matches;
    var desktopSiteOnPhone =
      screenW > 0 && screenW <= 540 && window.innerWidth > screenW * 1.25;
    var coarsePhone =
      window.matchMedia("(hover: none) and (pointer: coarse)").matches &&
      screenW > 0 &&
      screenW <= 540;
    if (narrow || desktopSiteOnPhone || coarsePhone) {
      document.documentElement.classList.add("hero-phone");
    }
  } catch (e) {}
})();

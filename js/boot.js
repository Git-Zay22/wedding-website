(function () {
  var KEY = "cz-owners-unlock";

  function cookieLevel() {
    var match = document.cookie.match(/(?:^|; )cz-owners-unlock=([^;]*)/);
    if (!match) return "";
    try {
      return decodeURIComponent(match[1]);
    } catch (e) {
      return "";
    }
  }

  function normalize(level) {
    if (level === "all") return "all";
    if (level === "cards" || level === "1") return "cards";
    return "";
  }

  var level = "";
  try {
    level = normalize(sessionStorage.getItem(KEY) || "");
  } catch (e) {
    level = "";
  }
  if (!level) {
    level = normalize(cookieLevel());
    if (level) {
      try {
        sessionStorage.setItem(KEY, level);
      } catch (e) {}
    }
  }

  if (level === "cards" || level === "all") {
    document.documentElement.classList.add("proposals-unlocked");
  }
  if (level === "all") {
    document.documentElement.classList.add("guestlist-unlocked");
  }

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

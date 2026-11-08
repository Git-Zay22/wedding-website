window.RSVP_CONFIG = {
  // Cloudflare Worker proxy (adds RSVP token server-side)
  scriptUrl: "https://wedding-rsvp.bzayrol.workers.dev",
  demoMode: false,
  // Used only until Apps Script list returns invitedCount. Remove after that deploy.
  invitedCount: 105,
  // End of day Asia/Manila — after this, the form is closed.
  rsvpClosesAt: "2026-11-14T23:59:59+08:00",
};

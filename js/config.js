window.RSVP_CONFIG = {
  // Cloudflare Worker proxy (adds RSVP token server-side)
  scriptUrl: "https://wedding-rsvp.bzayrol.workers.dev",
  demoMode: false,
  // Used only until Apps Script list returns invitedCount. Remove after that deploy.
  invitedCount: 105
};

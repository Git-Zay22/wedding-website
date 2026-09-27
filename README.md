# Caren & Zayrol — Wedding Website

Static wedding site for **XAMPP** (local) and **GitHub Pages** (live), with RSVP via **HTML/JS form → Google Apps Script → Google Sheets**.

## Theme

**Powder blue** + **buttermilk yellow** — soft pastels, elegant type, full-bleed prenup hero.

## Stack

| Layer | Role |
|--------|------|
| GitHub Pages | Hosts the static site |
| HTML / CSS / JS | Landing + RSVP form |
| Google Apps Script | Receives POSTs |
| Google Sheets | Stores RSVPs |

## Local with XAMPP

1. Copy this folder to `F:\xampp\htdocs\wedding-website` (or open this repo path if you already mirrored it).
2. Start Apache in XAMPP.
3. Open [http://localhost/wedding-website/](http://localhost/wedding-website/).

RSVP works in **demo mode** until you paste your Apps Script URL (responses log to the browser console).

## Google Sheets + Apps Script

1. Create a Google Sheet.
2. From the Sheet: **Extensions → Apps Script**.
3. Paste `google-apps-script/Code.gs`, save.
4. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the web app URL.
6. Copy the example config, then paste your URL:

```powershell
copy js\config.example.js js\config.js
```

```js
window.RSVP_CONFIG = {
  scriptUrl: "https://script.google.com/macros/s/XXXX/exec",
  demoMode: false,
};
```

`js/config.js` is **gitignored** so your live Apps Script URL is not pushed to GitHub.

7. Submit a test RSVP; check the `RSVPs` tab in the Sheet.

## GitHub Pages

1. Create a repo and push this project (`js/config.js` stays local; commit `js/config.example.js` only).
2. **Settings → Pages → Source: Deploy from a branch** → `main` / root (or `/docs` if you move files).
3. On the live host, create `js/config.js` from the example (or set it in your deploy step) with your Web App URL.
4. Site URL will be `https://YOUR_USER.github.io/REPO_NAME/`.

If the site is in a project subpath, relative asset paths (`css/`, `js/`, `assets/`) already work.

## Customize

- Couple names / copy: `index.html`
- Colors & type: `css/styles.css` (`:root`)
- Photos: `assets/hero.jpg`, `assets/gallery-1.jpg` … `gallery-3.jpg`
- RSVP fields: `index.html` + `js/rsvp.js` + matching columns in `Code.gs`

## Project layout

```
wedding-website/
├── index.html
├── css/styles.css
├── js/config.example.js   ← commit this
├── js/config.js           ← local only (gitignored)
├── js/main.js
├── js/rsvp.js
├── assets/          ← your photos
├── google-apps-script/Code.gs
└── README.md
```

# Advent calendar

A 25-day calendar made for Christopher. It uses Supabase for sign-in, private content, photos and saved progress. Open `index.html` with VS Code's Live Server. The calendar needs an internet connection.

This is a personal project that others can copy and adapt for their own calendar. A copy needs its **own Supabase project and users**; it should not point at this calendar's project.

## Files

- `index.html`: the calendar page.
- `style.css`: styling and animations.
- `calendar.js`: calendar behaviour, sign-in and photo uploads.
- `config.js`: project connection, account email addresses and displayed names.
- `supabase-setup.sql`: one-time setup for a new Supabase project. **Do not rerun it on the existing calendar.**
- `SETUP-SUPABASE.md`: instructions for a new Supabase project and testing.

## Adapting a copy

1. Copy or fork the project. Create your own free Supabase project and private `calendar-media` bucket, then follow `SETUP-SUPABASE.md` to set up its database and two sign-ins.
2. Replace the URL, publishable key, names and account email addresses in **your copy** of `config.js` with your own. Don't use the original calendar's accounts or project details.
3. In your Supabase project's `calendar_days` table, replace the placeholder messages, add your own media and Spotify links, and check the unlock dates.
4. The example dates are for **December 2026 in Europe/London**. For another year or time zone, adjust the unlock dates in Supabase; also review the year in `index.html` and the London time-zone references in `calendar.js`.
5. Some details are personal to this calendar: the organiser's login label is in `index.html`, and the day 2 hot chocolate challenge, day 3 water effect and day 13 fireworks are in `calendar.js`. Change those if they don't fit your version.
6. Test both accounts, date restrictions and storage privacy before sharing your site. Full steps are in `SETUP-SUPABASE.md`.

If you publish a copy, `config.js` will be public, including the two account email addresses. Use addresses you are comfortable making public, and never include passwords or secret/service-role keys. Each person should protect their own Supabase project with their own access rules.

## Test on GitHub Pages

1. Sign in to GitHub and create a repository. GitHub Free requires a public repository for GitHub Pages.
2. Upload **`index.html`, `style.css`, `calendar.js` and `config.js`** to the root of the repository, keeping their names exactly as written. Include `README.md`, `SETUP-SUPABASE.md` and `supabase-setup.sql` too if you want others to understand and adapt the project. Do not upload private media or passwords.
3. In the repository, open **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**. Select the branch that contains the files (often `main` or `master`) and the `/ (root)` folder; save.
4. When the site address appears in Pages settings, open it on your phone. Changes to local files do not appear on the site until uploaded or pushed to GitHub.

`config.js` is publicly visible when the site is published. It contains the two calendar account email addresses and a Supabase publishable key; only publish addresses you are comfortable making public. Never put passwords, a Supabase secret key, a `service_role` key or the database password in these files or a public repository. The publishable key is intended for use in a browser; privacy depends on the actual Supabase permissions and row-level security (RLS) policies.

Before sharing the link, verify that the `calendar-media` bucket is private, public sign-ups are disabled, and the live policies prevent signed-out and unauthorised users from reading content, and prevent the partner from reading future days and their media. Test the published site on a phone and check real door progress and uploads. The organiser's date and door previews are local and do not change the partner's progress; testing as the partner does.

## Edit the surprises

Edit day titles, messages, unlock dates and media paths in Supabase's `calendar_days` table. Store personal media in the private `calendar-media` bucket. A Spotify share link in `spotify_url` displays a player and, when Spotify provides it, cover art. See `SETUP-SUPABASE.md` for paths and details.

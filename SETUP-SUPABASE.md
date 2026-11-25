# Set up the shared calendar

The shared calendar is `index.html`. These instructions are for someone setting up **their own copy** with a new Supabase project. They don't need access to the original calendar's project or accounts. If your calendar is already set up, don't repeat the database setup; use the content and testing sections as needed.

## Before you start

1. Create or sign in to a Supabase account and create an organisation on the Free plan.
2. Create a new project, choose a region and save its database password somewhere private. Enable the Data API; for a new project, leave automatic API grants for new tables disabled.
3. Under **Storage**, create a bucket named `calendar-media` and leave it **private**.
4. Keep your project URL and publishable key available for step 3. Never share the database password, Supabase secret key or `service_role` key.

## 1. Database and access rules

In Supabase, open **SQL Editor**, start a new query, copy the entire `supabase-setup.sql` file into it, and click Run. Run this script once: the policy creation statements are not designed to be run twice. If it reports an error, copy the error message before trying again. It creates the tables, private role mapping, rules, and placeholder days for December 2026, using Europe/London midnight. It assumes your private bucket is named exactly `calendar-media`. It enables row-level security, including on the private membership table. It does not create logins or assign roles. If you already set up this project, do not run it again.

## 2. Create the two sign-ins

In Supabase, open **Authentication → Users → Add user** and look for the option to create a user directly (not an email invitation). Create two distinct email/password users, one for the organiser and one for the partner. Confirm the accounts when creating them if that option appears. Choose strong, different passwords; share the partner's password privately, and never put passwords in the code or chat. Verify you control the account emails before manually confirming them. If the dashboard does not offer direct creation, stop and ask for help; invitations and password resets may require custom SMTP. Disable public sign-ups under Authentication configuration after creating the two users. This also prevents unwanted extra accounts. Email and password provider must stay enabled.

Copy the UUID for each user from Authentication → Users. In SQL Editor, run the following after replacing the two placeholders with the corresponding UUIDs, keeping their quote marks:

```sql
insert into calendar_private.members (user_id, role) values
  ('ORGANISER-USER-UUID', 'organiser'),
  ('PARTNER-USER-UUID', 'partner');
```

Only these users will have calendar access. Never assign the organiser role to the partner.

## 3. Connect the site

Open `config.js`. Replace the original project's URL and publishable key with those from your own Supabase dashboard. Set `recipient` and `sender` to your chosen names, and replace `organiserEmail` and `partnerEmail` with the addresses of your own two calendar accounts. These email addresses and the publishable key will be publicly visible in the website source, so use addresses you are comfortable exposing. The passwords never belong in this file. The login form shows a role selector and password; email addresses are used behind the scenes. The "Anna" organiser login label is in `index.html` and can be changed there for a different organiser. There is no self-service password reset screen; an administrator will need to manage forgotten passwords or set up email recovery.

## 4. Add your surprises

Open Supabase → Table Editor → `calendar_days` and edit the title, message and type for each day. The rows are placeholders. To add private media, upload it to your private `calendar-media` bucket under `surprises/<day>/<filename>`, for example `surprises/3/our-video.mp4`. Paste exactly that path into the corresponding row's `media_path` field. Use `image` for pictures, `video` for videos, `song` for audio or a Spotify link, or `message` for a voice note; set `spotify_url` to a Spotify track, album, or playlist share link to display an embedded player. Spotify may play only a preview depending on the listener and browser. One media file is supported per day. For private images or videos attached to other entry types, change the type accordingly. Dates in `unlock_at` are stored as timestamps; update them deliberately if you change the year.

The organiser can view the surprise before it unlocks. The partner can read the private day and its media only when the server says its unlock time has passed. The partner can upload JPEG, PNG, GIF, or WebP photos on day 2 once it is available. The website limits individual photo uploads to 10 MB; also set a maximum file size and allowed MIME types in Storage bucket settings if you want server-enforced restrictions. Server bucket-wide restrictions apply to your own surprise media too.

## 5. Run and publish

Run a local web server in this folder, e.g. with VS Code Live Server or `python3 -m http.server 8000`, and visit the local address. This requires internet access to Supabase and the Supabase client library. For GitHub Pages, publish `index.html`, `config.js`, `calendar.js` and `style.css` at the repository root. The root page opens the calendar. In GitHub Settings → Pages, choose Deploy from a branch and the branch containing your files, with `/ (root)` as the folder. Do not publish private media, passwords or personal messages as files in the public site.

## 6. Test before sharing

- Sign in as the organiser and as the partner. Check only the organiser can preview all days; the partner sees only unlocked content. The organiser preview date, opened doors and test photos are local to the browser session and do not change real progress. The real opened-door count is shown in the organiser controls.
- Test day 2 on a phone: take or choose a photo and save it as the partner, sign out and view it in the day 2 tile as organiser. For testing, temporarily set day 2's `unlock_at` to a past date, then restore it. A real partner login creates a real progress record and upload; clean up only test records and files when finished. Organiser photo previews do not upload to Supabase.
- In a separate private browser session, confirm no private content is accessible while signed out. Test that the partner cannot read a future day's row or media directly; do not rely only on the appearance of a locked door. Check Supabase's SQL/API policies if any test fails.
- Set secure bucket restrictions appropriate for both uploads and your own files. Keep copies of originals elsewhere. Review storage and bandwidth limits. Free projects can pause after inactivity.

Progress is saved in Supabase, so it is shared across browsers. Auth sessions are stored by the Supabase client in browser local storage; signing out clears the session. Do not share the service_role or secret key, database password or user passwords. If the site is loaded on GitHub Pages, published source files are public.

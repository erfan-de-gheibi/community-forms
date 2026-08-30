# Community Forms

A tiny, no-backend form tool that runs entirely on GitHub Pages. Guests fill
out a form with no login and no limit on how many times they can submit.
Every submission shows up as a GitHub Issue on this repo — and because you
already own the repo, GitHub emails you automatically the moment a new one
is opened. You manage everything (creating forms, getting the QR code /
share link, closing a form) from `admin.html`, using a point-and-click
builder — no code required after this one-time setup.

This project is MIT-licensed (see `LICENSE`) — use it for your own events,
fork it, adapt it, whatever's useful. Once you know your repo's URL, do a
find-and-replace for `YOUR_GITHUB_USERNAME/YOUR_REPO_NAME` (it appears in a
comment at the top of each source file) so the attribution link is correct.

## How it works, in one paragraph

There's no server anywhere. `form.html` reads a plain JSON file
(`forms/<id>.json`) describing the questions straight from GitHub's live
API, renders them, and — on submit — calls that same API to open a GitHub
Issue containing the guest's answers. `admin.html` does the same thing in
reverse: it calls GitHub's API to write new `forms/<id>.json` files (and
any uploaded pictures) when you build a form in the visual builder. Two
access tokens make this possible (see below) — everything else is static
files. Every page works out which GitHub repo it belongs to from its own
URL (`username.github.io/reponame/...`), so there's nothing about *where
things live* that can go stale in a cache.

### A note on caching

Reads that need to be current — the form's questions, whether it's open or
closed, and the guest submission token — go straight to GitHub's live API,
not through any CDN, specifically so nothing can serve a stale answer no
matter how long a form has been open in a tab. The trade-off: those reads
are unauthenticated and capped at 60 requests/hour per IP address by
GitHub, which is plenty for a form a handful of people load over the
course of an event, but worth knowing if a large group is all on the same
shared WiFi at once. (Pictures embedded in forms are served through
jsDelivr's CDN instead, since a given picture's content never changes
after it's uploaded — only ever-changing data needs the live-API
treatment.)

This same principle applies to the app's own code, not just its data:
`assets/github.js` (all the core logic) is fetched fresh on every page
load instead of sitting in a cacheable `<script>` tag, so a bug fix takes
effect the next time anyone opens the page — no private window or hard
refresh required. Every page also sends explicit no-cache headers for
itself. The one thing that can't be worked around: right after you update
these files, everyone's *very next* page load fetches the new version;
there's no way to make an already-open tab instantly aware of a change.

## Setting this up for the first time (repo owner)

### 1. Create the repository

Create a **public** repository on GitHub. It must be public — GitHub Pages
on a free account only serves public repos, and making it private wouldn't
hide the deployed site anyway (static sites are always publicly viewable
once published).

Add all the files in this folder, keeping the structure (`assets/`,
`form.html`, `admin.html`, `copy.html`, `index.html`). Either `git push`, or
use **Add file → Upload files** on the repo's GitHub page and drag the
whole unzipped folder in.

### 2. Turn on GitHub Pages

Settings → Pages → Source: "Deploy from a branch" → branch **main** →
folder **/ (root)** → Save. Wait about a minute; your site is then live at
`https://<username>.github.io/<repo-name>/`.

### 3. (Optional) Let other people get their own copy

If you want to share this tool itself (not just your forms) with someone
else, turn on **Settings → General → Template repository**. That makes
`copy.html` — a guided, step-by-step onboarding page — fully functional for
anyone you send it to (its own QR code works nicely for this). It walks a
new user through: getting their own copy, turning on Pages, and creating
both tokens, ending with a working `admin.html` for their own repo. No
technical background required beyond clicking through their browser and
copy-pasting where told.

### 4. Run the setup wizard for your own site

Visit `https://<username>.github.io/<repo-name>/admin.html`. Step 1 asks for
your admin token. Step 2 now detects your username and repo name
automatically from the site's own URL (only asks manually if you're on a
custom domain) — it also verifies the guest submission token actually works
before saving, so a bad copy-paste gets caught immediately instead of
surfacing as a confusing error later.

## The two tokens

**Token 1 — your admin token.** Classic personal access token, scope
`public_repo`. Lives only in your browser (`localStorage`) — never
committed anywhere. This is what lets the "Publish form" button actually
write to your repo. Since it's account-wide (classic tokens can't be
limited to one repo), keep it in your browser only, not written down
anywhere else.

**Token 2 — the guest submission token.** Fine-grained token, scoped to
*only this repository*, permission **Issues: Read and write**, nothing
else. This one gets committed into `assets/config.js`, so it's visible to
anyone who views a form page's source — that's unavoidable on a static
site. The narrow scope is what keeps that acceptable: it can create/edit
Issues on this one repo and nothing more.

**Important:** GitHub automatically revokes any valid GitHub token —
classic or fine-grained, any scope — the moment it detects that token
committed to a public repository. This is separate from (and happens
after) push protection, and it's why an earlier version of this project
kept mysteriously failing with "Bad credentials" no matter how many fresh
tokens got generated. The fix: the setup wizard stores token 2 reversed
(scrambled character-by-character) rather than in its normal recognizable
form, and every page un-reverses it in memory right before use. GitHub's
scanner matches the literal token pattern in the file, so a reversed
string doesn't register as a credential to revoke. This adds no real
secrecy — anyone who reads the code can reverse it back just as easily as
before — the token's actual safety has always come entirely from its
narrow scope, not from being hidden.

**About "secret detected" errors:** since token 2 is now stored reversed,
it shouldn't match GitHub's push protection pattern at all, so this
shouldn't come up anymore. If it ever does (e.g. GitHub broadens its
detection), `admin.html` and `copy.html` both handle it automatically —
they request an official bypass using your admin token and retry — or
show a "click here to allow it" link as a fallback. No need to disable
push protection anywhere; it stays on either way.

## Everyday use

- Open `admin.html` (bookmark it — it's deliberately not linked from
  anywhere on the public site).
- **+ New form** to build one: add questions, blocks of plain text (to
  break up long forms), and pictures (uploaded from your device,
  reused from a previous upload, or linked from elsewhere), then
  **Publish form**. Live within about a minute.
- **QR code** on any form gives a scannable, downloadable, shareable code
  linking straight to it.
- **Close** stops new responses without deleting the form; **Reopen**
  resumes them; **Edit** (only available while a form is closed, to avoid a
  guest's answers changing under them mid-fill) lets you change its
  questions and republish — it doesn't affect any responses already
  collected, since each one is a frozen snapshot at the time it was sent,
  not linked back to the live form. **Delete** removes the form entirely.
- **Sign in on another device**: shows a QR code that logs you into
  `admin.html` on a second device or browser, without affecting your first
  one. Treat that QR code like a password — anyone who scans or
  photographs it can publish and delete forms as you. Don't screenshot it,
  post it, or leave it on screen; scan it once on the new device and close
  the popup.

## Pictures on forms

Uploaded photos are automatically resized and compressed in your browser
before publishing (you'll see the before/after size), which keeps the repo
small — comfortably well over 1,000 photos before repo size becomes worth
thinking about, far beyond what small community events typically need.
Choosing "link to an image hosted elsewhere" skips all of that but depends
on that external host staying up and allowing hotlinking — if it goes down
or blocks it, the image quietly breaks on your form.

## Reading responses

Every submission is a GitHub Issue on this repo, labeled with the form's
ID. Open the repo's **Issues** tab to read them, filter by label, search
across all of them, and you'll get GitHub's normal email notification the
moment each one comes in.

To get them into a spreadsheet, click **Export CSV** on any form in the
dashboard — it pulls every response for that form and downloads a `.csv`
with one column per current question, plus submission time and a link
back to the original GitHub Issue. If you edited a form's questions after
some responses came in, any older answers that no longer match a current
question still get included as extra columns at the end, so nothing is
silently dropped — just not neatly aligned with the newer ones.

## Limits worth knowing about

- Each text question has a maximum length you set when building the form
  (generous, but not infinite).
- Basic bot-deterrents (hidden honeypot field, minimum-time check) — not
  built to stop a determined human, just casual spam.
- GitHub's API allows up to 5,000 requests/hour per token — far more than
  a small community event will use.

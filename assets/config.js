/* Community Forms — https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPO_NAME — MIT License */
/* ============================================================
   CONFIG — the admin setup wizard writes this file for you;
   you shouldn't need to edit it by hand. Everything in it is
   PUBLIC — anyone visiting the site can read it (unavoidable on
   a static site). That's why SUBMISSION_TOKEN must be a token
   that can ONLY create GitHub Issues on this one repo — nothing
   else. See README.md for exactly how it's created.

   Owner/repo aren't stored here — every page works them out from
   its own URL (username.github.io/reponame/...), so there's
   nothing here that can go stale except the token itself.

   SUBMISSION_TOKEN is stored reversed (character-by-character),
   not as GitHub would normally format it. This is deliberate: any
   real GitHub token committed to a public repo gets automatically
   revoked by GitHub itself, regardless of scope — the admin setup
   wizard writes it reversed and every page un-reverses it in
   memory before use, purely to avoid that auto-revocation. It adds
   no real secrecy (that was never the point); this token's safety
   comes entirely from what little it's allowed to do.
   ============================================================ */
window.SITE_CONFIG = {
  SUBMISSION_TOKEN: "PASTE_ISSUES_ONLY_TOKEN_HERE",
};

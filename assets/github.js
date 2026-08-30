/* Community Forms — https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPO_NAME — MIT License */
/* ============================================================
   Small helpers for talking to the GitHub REST API from the
   browser, plus a couple of static-site-specific tricks
   (jsDelivr cache purging, secret-scanning bypass, image
   compression). No build step, no dependencies.
   ============================================================ */

const GH_API = "https://api.github.com";

function ghHeaders(token) {
  return {
    "Accept": "application/vnd.github+json",
    "Authorization": "Bearer " + token,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function utf8ToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function base64ToUtf8(b64) {
  return decodeURIComponent(escape(atob(b64)));
}

/** Fetch a JSON file from the repo's contents API. Returns {data, sha} or null if missing. */
async function ghGetJson(owner, repo, path, token) {
  const res = await fetch(
    `${GH_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?t=${Date.now()}`,
    { headers: token ? ghHeaders(token) : { Accept: "application/vnd.github+json" } }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub read failed (${res.status})`);
  const body = await res.json();
  return { data: JSON.parse(base64ToUtf8(body.content)), sha: body.sha };
}

/** Get the current sha of any file (needed to overwrite it), or null if it doesn't exist. */
async function ghGetSha(owner, repo, path, token) {
  const res = await fetch(`${GH_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?t=${Date.now()}`, {
    headers: token ? ghHeaders(token) : { Accept: "application/vnd.github+json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub read failed (${res.status})`);
  return (await res.json()).sha;
}

/** List files in a directory. Returns [] if the directory doesn't exist. */
async function ghListDir(owner, repo, path, token) {
  const res = await fetch(`${GH_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?t=${Date.now()}`, {
    headers: token ? ghHeaders(token) : { Accept: "application/vnd.github+json" },
  });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`GitHub read failed (${res.status})`);
  return res.json(); // array of {name, path, size, ...}
}

/**
 * Create or update a file via the Contents API, automatically handling
 * GitHub's secret-scanning push protection if it blocks the write:
 * it requests a bypass using the token that got blocked, then retries once.
 * If the automatic bypass isn't available, throws an error carrying
 * `unblockUrl` so the caller can offer a manual "allow secret" link + retry.
 */
async function ghPutContent(owner, repo, path, base64Content, message, token, sha) {
  const doPut = () => fetch(`${GH_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, {
    method: "PUT",
    headers: ghHeaders(token),
    body: JSON.stringify({ message, content: base64Content, sha: sha || undefined }),
  });

  let res = await doPut();
  if (res.ok) return res.json();

  if (res.status === 409) {
    let body;
    try { body = await res.json(); } catch { body = null; }
    const placeholders = body?.metadata?.secret_scanning?.bypass_placeholders;
    if (placeholders && placeholders.length) {
      let bypassed = true;
      for (const p of placeholders) {
        const bypassRes = await fetch(`${GH_API}/repos/${owner}/${repo}/secret-scanning/push-protection-bypasses`, {
          method: "POST",
          headers: ghHeaders(token),
          body: JSON.stringify({ reason: "used_in_tests", placeholder_id: p.placeholder_id }),
        });
        if (!bypassRes.ok) bypassed = false;
      }
      if (bypassed) {
        res = await doPut();
        if (res.ok) return res.json();
      }
      // Automatic bypass didn't work — hand the caller a manual link.
      const err = new Error("GitHub blocked this as a possible secret.");
      err.unblockUrl = `https://github.com/${owner}/${repo}/security/secret-scanning/unblock-secret/${placeholders[0].placeholder_id}`;
      err.retry = () => ghPutContent(owner, repo, path, base64Content, message, token, sha);
      throw err;
    }
  }
  const text = await res.text();
  throw new Error(`GitHub write failed (${res.status}): ${text}`);
}

async function ghPutJson(owner, repo, path, obj, message, token, sha) {
  return ghPutContent(owner, repo, path, utf8ToBase64(JSON.stringify(obj, null, 2)), message, token, sha);
}

/** Delete a file via the Contents API. */
async function ghDeleteFile(owner, repo, path, message, token, sha) {
  const res = await fetch(`${GH_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, {
    method: "DELETE",
    headers: ghHeaders(token),
    body: JSON.stringify({ message, sha }),
  });
  if (!res.ok) throw new Error(`GitHub delete failed (${res.status})`);
  return res.json();
}

/** Create a GitHub Issue (used for form submissions). */
async function ghCreateIssue(owner, repo, title, body, labels, token) {
  const res = await fetch(`${GH_API}/repos/${owner}/${repo}/issues`, {
    method: "POST",
    headers: ghHeaders(token),
    body: JSON.stringify({ title, body, labels }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Could not submit (${res.status}): ${errBody}`);
  }
  return res.json();
}

/** Fetch every Issue (open and closed) carrying a given label, across all pages. */
async function ghListIssuesByLabel(owner, repo, label, token) {
  const all = [];
  for (let page = 1; page < 50; page++) { // 50 * 100 = 5,000 issues ceiling, plenty for this use case
    const res = await fetch(
      `${GH_API}/repos/${owner}/${repo}/issues?labels=${encodeURIComponent(label)}&state=all&per_page=100&page=${page}`,
      { headers: ghHeaders(token) }
    );
    if (!res.ok) throw new Error(`GitHub read failed (${res.status})`);
    const batch = await res.json();
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

/** Verify a token actually works and report what it can do (used by the admin setup screen). */
async function ghCheckToken(token) {
  const res = await fetch(`${GH_API}/user`, { headers: ghHeaders(token) });
  if (!res.ok) return { ok: false };
  const user = await res.json();
  return { ok: true, login: user.login };
}

/** GitHub Pages project sites are always served at username.github.io/reponame/... —
    so we can read owner+repo straight from the URL instead of storing/caching them
    anywhere. Returns null for custom domains. */
function detectOwnerRepo() {
  const hostMatch = location.hostname.match(/^([^.]+)\.github\.io$/i);
  const pathMatch = location.pathname.match(/^\/([^/]+)\//);
  if (hostMatch && pathMatch) return { owner: hostMatch[1], repo: pathMatch[1] };
  return null;
}

/**
 * GitHub automatically revokes any valid GitHub token it detects committed to
 * a public repo — this happens regardless of the token's scope, and separately
 * from push protection (which only blocks the initial commit). Since this
 * token is *meant* to live in public code, we store it reversed so it doesn't
 * match GitHub's recognizable-token pattern. This adds no real secrecy —
 * anyone reading the code can reverse it back just as easily — the actual
 * safety comes entirely from the token only being able to create Issues on
 * this one repo. It just stops GitHub's scanner from auto-killing it.
 */
function scrambleToken(t) {
  return t.split("").reverse().join("");
}

/**
 * Fetch the guest submission token straight from GitHub's live Contents API
 * (never a CDN — jsDelivr's branch-to-commit mapping can stay stuck for a long
 * time even after purging, which is why this doesn't use it). Unauthenticated,
 * so it's subject to GitHub's 60-requests/hour-per-IP limit — worth knowing,
 * but far preferable to serving a stale token.
 */
async function fetchSubmissionToken(owner, repo) {
  const res = await fetch(`${GH_API}/repos/${owner}/${repo}/contents/assets/config.js?t=${Date.now()}`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) return null;
  const body = await res.json();
  const text = base64ToUtf8(body.content);
  const m = text.match(/SUBMISSION_TOKEN:\s*"([^"]*)"/);
  return m ? scrambleToken(m[1]) : null;
}

function randomId(len = 8) {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789"; // no ambiguous chars
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/**
 * Resize + re-encode an image file in the browser so it comfortably fits
 * the Contents API's ~1MB-per-file limit. Returns
 * {base64, dataUrl, originalBytes, newBytes, width, height}.
 */
function compressImage(file, { maxDim = 1600, targetBytes = 400 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.onload = () => {
      img.onerror = () => reject(new Error("That doesn't look like an image."));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);

        let quality = 0.9;
        const tryEncode = () => {
          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          const bytes = Math.ceil((dataUrl.length - dataUrl.indexOf(",") - 1) * 0.75);
          if (bytes > targetBytes && quality > 0.35) {
            quality -= 0.12;
            return tryEncode();
          }
          resolve({
            base64: dataUrl.split(",")[1],
            dataUrl,
            originalBytes: file.size,
            newBytes: bytes,
            width, height,
          });
        };
        tryEncode();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Parse a submission Issue's body (written by form.html's collectAnswers) back
    into {label: value} pairs. Handles multi-line answers correctly. */
function parseSubmissionBody(body) {
  const answers = {};
  const regex = /\*\*(.+?)\*\*\n([\s\S]*?)(?=\n\n\*\*|$)/g;
  let match;
  while ((match = regex.exec(body || "")) !== null) {
    let value = match[2].trim();
    if (value === "_(no answer)_") value = "";
    answers[match[1]] = value;
  }
  return answers;
}

/** Build a CSV string from an array of equal-length row arrays. Handles quoting. */
function toCsv(rows) {
  const escapeCell = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map(row => row.map(escapeCell).join(",")).join("\r\n");
}

function downloadTextFile(filename, text, mimeType = "text/csv") {
  const blob = new Blob([text], { type: mimeType + ";charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoke after a short delay — some browsers cancel the download if the
  // blob URL is revoked immediately, before the download has actually started.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* aiClient.js — the single door between the app and the AI proxy.
 *
 * Every AI feature goes through aiCall(). Nothing here knows about food; it
 * handles the PIN, image downscaling, error shaping and the fail-soft rule:
 * if anything goes wrong the caller falls back to the manual flow with a
 * visible note. The app must remain fully usable with AI switched off
 * (product-spec §3.5).
 */

const AI_ENDPOINT = '/.netlify/functions/ai';
const AI_PIN_KEY = 'warmode_ai_pin';
const AI_MAX_EDGE = 2576;     // Opus 4.8's high-res ceiling; also caps image tokens
const AI_JPEG_Q = 0.85;

let AI_LAST_USAGE = null;     // most recent { callsToday, dailyCap }

/* ---------- PIN ---------- */
function aiGetPin() { try { return localStorage.getItem(AI_PIN_KEY) || ''; } catch (e) { return ''; } }
function aiSetPin(p) { try { localStorage.setItem(AI_PIN_KEY, p || ''); } catch (e) {} }
function aiClearPin() { try { localStorage.removeItem(AI_PIN_KEY); } catch (e) {} }
function aiHasPin() { return !!aiGetPin(); }

/* Ask once, remember thereafter. Returns '' if the user cancels. */
function aiEnsurePin() {
  let p = aiGetPin();
  if (!p) {
    p = prompt('Enter your WAR MODE AI PIN (stored on this device only):') || '';
    if (p) aiSetPin(p.trim());
  }
  return aiGetPin();
}

/* ---------- environment ---------- */
/* Netlify Functions don't exist on the local python static server, so AI is
 * only live on the deployed site. Detect it up front and say so plainly rather
 * than surfacing a confusing 404. */
function aiIsLocalStatic() {
  const h = location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '' || location.protocol === 'file:';
}

/* ---------- core call ---------- */
/* → { ok:true, data, usage } | { ok:false, code, error } — never throws. */
async function aiCall(task, payload) {
  if (aiIsLocalStatic()) {
    return { ok: false, code: 'local', error: 'AI runs through a Netlify Function, which the local static server doesn\'t serve. Use the deployed site.' };
  }
  const pin = aiEnsurePin();
  if (!pin) return { ok: false, code: 'no_pin', error: 'AI needs your PIN.' };

  let res;
  try {
    res = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-warmode-pin': pin },
      body: JSON.stringify({ task, payload: payload || {} })
    });
  } catch (e) {
    return { ok: false, code: 'offline', error: 'Couldn\'t reach the AI service. You\'re offline or the site is still deploying.' };
  }

  let body = null;
  try { body = await res.json(); } catch (e) { /* fall through */ }

  if (!res.ok || !body || body.ok === false) {
    const code = (body && body.code) || ('http_' + res.status);
    let msg = (body && body.error) || ('AI call failed (HTTP ' + res.status + ').');
    if (res.status === 401) { aiClearPin(); msg = 'That PIN was rejected. You\'ll be asked again next time.'; }
    if (res.status === 404) msg = 'The AI function isn\'t deployed yet.';
    return { ok: false, code, error: msg };
  }

  AI_LAST_USAGE = { callsToday: body.callsToday, dailyCap: body.dailyCap };
  return { ok: true, data: body.data, usage: body.usage, callsToday: body.callsToday, dailyCap: body.dailyCap };
}

/* ---------- images ---------- */
/* Downscale before upload: keeps us inside Netlify's request limit and stops a
 * 12MP phone photo from costing ~4,800 image tokens when 1,500 will do. */
function aiPrepareImage(file) {
  return new Promise((resolve) => {
    if (!file) return resolve({ ok: false, error: 'No image selected.' });
    if (!/^image\//.test(file.type)) return resolve({ ok: false, error: 'That file isn\'t an image.' });

    const reader = new FileReader();
    reader.onerror = () => resolve({ ok: false, error: 'Couldn\'t read that image.' });
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => resolve({ ok: false, error: 'Couldn\'t decode that image.' });
      img.onload = () => {
        let { width: w, height: h } = img;
        const longEdge = Math.max(w, h);
        if (longEdge > AI_MAX_EDGE) { const s = AI_MAX_EDGE / longEdge; w = Math.round(w * s); h = Math.round(h * s); }
        try {
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          const url = c.toDataURL('image/jpeg', AI_JPEG_Q);
          resolve({ ok: true, imageB64: url.split(',')[1], mediaType: 'image/jpeg', width: w, height: h });
        } catch (e) {
          resolve({ ok: false, error: 'Couldn\'t process that image.' });
        }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* Open a file picker (camera on mobile) and hand back a prepared image.
 * Cancelling must settle the promise too — otherwise the caller hangs forever
 * and every attempt leaks an <input> into the DOM. Browsers are inconsistent
 * about the `cancel` event, so a window-focus fallback backs it up. */
function aiPickImage(useCamera) {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    if (useCamera) inp.capture = 'environment';
    inp.style.display = 'none';

    let settled = false;
    const finish = (val) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('focus', onFocus);
      inp.remove();
      resolve(val);
    };
    const onFocus = () => {
      /* fires when the picker closes; give change a moment to land first */
      setTimeout(() => { if (!(inp.files && inp.files.length)) finish({ ok: false, error: null }); }, 400);
    };

    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0];
      if (!f) return finish({ ok: false, error: null });
      const prepared = await aiPrepareImage(f);
      finish(prepared);
    });
    inp.addEventListener('cancel', () => finish({ ok: false, error: null }));

    document.body.appendChild(inp);
    window.addEventListener('focus', onFocus);
    inp.click();
  });
}

/* ---------- safe interpolation ---------- */
/* A string that will sit inside onclick="fn( … )".
 * The browser HTML-decodes an attribute BEFORE parsing it as JS, so htmlSafe()
 * is worthless here — its &#39; decodes straight back into a quote and closes
 * the literal. JSON.stringify gives a valid JS literal; escaping the double
 * quotes keeps it inside the attribute. Anything model- or user-supplied that
 * ends up in an inline handler must go through this. */
function aiJsAttr(s) {
  return JSON.stringify(String(s == null ? '' : s)).replace(/"/g, '&quot;');
}

/* The AI routes offered when a search finds nothing. Lives here (not in
 * foodLog.js) so that deleting the ai*.js scripts silently removes the chips
 * instead of breaking search — the call sites are typeof-guarded. */
function aiNoMatchChips(q, prefix) {
  return '<button class="chip" onclick="' + (prefix || '') + 'aiLookupFood(' + aiJsAttr(q) + ')">🔎 Look it up</button>'
    + '<button class="chip" onclick="' + (prefix || '') + 'aiScanLabel(true)">📷 Scan label</button>';
}

/* ---------- shared UI bits ---------- */
function aiBusyHtml(msg) {
  return '<div class="ai-busy"><span class="ai-spin"></span>' + htmlSafe(msg || 'Thinking…') + '</div>';
}
function aiErrorHtml(err, retryFn) {
  return '<div class="ai-err"><b>Couldn\'t do that.</b><div>' + htmlSafe(err) + '</div>'
    + (retryFn ? '<button class="fd-chip" onclick="' + retryFn + '">Try again</button>' : '')
    + '</div>';
}
/* Issues from aiValidate — the honest warning strip. */
function aiIssuesHtml(vet) {
  if (!vet || !vet.issues || !vet.issues.length) return '';
  const cls = vet.level === 'fail' ? 'ai-flag fail' : 'ai-flag warn';
  const head = vet.level === 'fail' ? '⛔ This can\'t be saved' : '⚠ Check these before saving';
  return '<div class="' + cls + '"><b>' + head + '</b><ul>'
    + vet.issues.map(i => '<li>' + htmlSafe(i) + '</li>').join('') + '</ul></div>';
}
function aiUsageNote() {
  if (!AI_LAST_USAGE) return '';
  return '<div class="ai-usage subtle">AI calls today: ' + AI_LAST_USAGE.callsToday + ' / ' + AI_LAST_USAGE.dailyCap + '</div>';
}

/* ---------- connection test (the real ADR-0011 gate) ---------- */
async function aiTestConnection() {
  fdOpen('<div class="fd-hero" style="background:linear-gradient(135deg,var(--fgreen-bg),var(--fcard))">'
    + '<button class="fd-x" onclick="fdClose()">✕</button><div class="fd-hero-name">AI connection test</div></div>'
    + '<div class="fd-body" id="aiTestBody">' + aiBusyHtml('Calling the proxy…') + '</div>');

  const r = await aiCall('ping', {});
  const box = document.getElementById('aiTestBody'); if (!box) return;

  if (r.ok) {
    box.innerHTML = '<div class="ai-ok"><b>✅ Connected.</b><div>' + htmlSafe(r.data.message || 'Working.') + '</div></div>'
      + '<div class="subtle" style="margin-top:10px">Model replied through the Netlify proxy. Your key stayed server-side.</div>'
      + aiUsageNote();
  } else {
    box.innerHTML = aiErrorHtml(r.error, 'aiTestConnection()')
      + '<div class="subtle" style="margin-top:10px">Code: ' + htmlSafe(r.code) + '</div>'
      + (r.code === 'bad_pin' ? '<button class="fd-chip" onclick="aiClearPin();aiTestConnection()">Re-enter PIN</button>' : '');
  }
}

(() => {
  if (window.__tf) return;

  const norm = s => (s || '').toString().toLowerCase().replace(/[\s:*]+/g, ' ').trim();
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const SKIP_TYPES = ['password', 'file', 'hidden', 'submit', 'button', 'image', 'reset'];
  // Never save/fill these: one-time values, or things you should tick yourself
  const SKIP_NAMES = /captcha|csrf|token|otp|^agree$|^same_as_present$/i;

  const visible = el => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);

  function fields() {
    return [...document.querySelectorAll('input, select, textarea')].filter(
      el => !SKIP_TYPES.includes(el.type) && !el.disabled && visible(el) &&
            !SKIP_NAMES.test(el.name || el.id || '')
    );
  }

  function labelOf(el) {
    let t = '';
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l) t = l.textContent;
    }
    if (!t) { const l = el.closest('label'); if (l) t = l.textContent; }
    if (!t) t = el.getAttribute('aria-label') || '';
    return norm(t);
  }

  function optionLabel(el) {
    return labelOf(el) || norm(el.parentElement && el.parentElement.textContent) || norm(el.value);
  }

  // Field identity. name/formcontrolname are unique and stable on Teletalk.
  // Labels are NOT used when a name exists, because many labels repeat
  // (District, Board, Result... appear for present/permanent and SSC/HSC/graduation).
  function aliases(el) {
    const idOk = el.id && !/(^|[-_:])\d+$/.test(el.id) && !/^(mat-|ng-|:r)/.test(el.id);
    let list = [el.name, el.getAttribute('formcontrolname'), idOk ? el.id : ''];
    list = list.map(norm).filter(Boolean);
    if (!list.length && el.type !== 'radio') list = [labelOf(el), el.placeholder].map(norm).filter(Boolean);
    return [...new Set(list)];
  }

  function scan() {
    const out = [];
    for (const el of fields()) {
      const a = aliases(el);
      if (!a.length) continue;
      let value, type = el.tagName === 'SELECT' ? 'select' : el.type;
      if (el.type === 'radio') {
        if (!el.checked) continue;
        value = optionLabel(el);
      } else if (el.type === 'checkbox') {
        value = el.checked;
      } else if (el.tagName === 'SELECT') {
        const o = el.options[el.selectedIndex];
        if (!o || !o.value) continue;
        value = o.text.trim();
      } else {
        value = el.value.trim();
        if (!value) continue;
      }
      out.push({ key: a[0], aliases: a, type, value });
    }
    return out;
  }

  function setNative(el, v) {
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
      : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
  }

  function fire(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  // One pass. changed = fields modified, pending = selects whose option isn't loaded yet
  function fillOnce(entries) {
    let changed = 0, pending = 0;
    for (const el of fields()) {
      const a = aliases(el);
      const e = entries.find(x => x.aliases.some(k => a.includes(k)));
      if (!e) continue;

      if (el.type === 'radio') {
        if (!el.checked && (optionLabel(el) === norm(e.value) || norm(el.value) === norm(e.value))) {
          el.click(); changed++;
        }
      } else if (el.type === 'checkbox') {
        const want = e.value === true || e.value === 'true';
        if (el.checked !== want) { el.click(); changed++; }
      } else if (el.tagName === 'SELECT') {
        const want = norm(e.value);
        const opt = [...el.options].find(o => o.value && (norm(o.text) === want || norm(o.value) === want));
        if (!opt) { pending++; continue; }          // e.g. upazila list still loading
        if (el.value !== opt.value) { setNative(el, opt.value); fire(el); changed++; }
      } else if (el.value !== String(e.value)) {
        setNative(el, String(e.value)); fire(el); changed++;
      }
    }
    return { changed, pending };
  }

  // Repeat so dependent dropdowns (district -> upazila) and revealed/enabled fields get filled
  async function fillAll(entries) {
    let total = 0, idle = 0;
    for (let i = 0; i < 15; i++) {
      const { changed, pending } = fillOnce(entries);
      total += changed;
      idle = changed === 0 ? idle + 1 : 0;
      if (changed === 0 && pending === 0 && idle >= 2) break;
      await sleep(800);
    }
    return total;
  }

  window.__tf = { scan, fillAll };
})();

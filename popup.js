const $ = id => document.getElementById(id);
const norm = s => (s || '').toLowerCase().replace(/[\s:*]+/g, ' ').trim();
let entries = [];

const persist = () => chrome.storage.local.set({ entries });
const say = t => ($('status').textContent = t);

async function load() {
  entries = (await chrome.storage.local.get('entries')).entries || [];
  render();
}

async function inject() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true },
    files: ['content.js']
  });
  return tab;
}

function merge(found) {
  for (const n of found) {
    const old = entries.find(e => e.aliases.some(a => n.aliases.includes(a)));
    if (old) {
      old.value = n.value;
      old.aliases = [...new Set([...old.aliases, ...n.aliases])];
    } else {
      entries.push(n);
    }
  }
}

$('scan').onclick = async () => {
  try {
    const tab = await inject();
    const res = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: () => window.__tf.scan()
    });
    const found = res.flatMap(r => r.result || []);
    merge(found);
    await persist();
    render();
    say(`Saved ${found.length} fields from this page.`);
  } catch (e) {
    say('Cannot read this page: ' + e.message);
  }
};

$('fill').onclick = async () => {
  if (!entries.length) return say('Nothing saved yet.');
  say('Filling...');
  try {
    const tab = await inject();
    const res = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: e => window.__tf.fillAll(e),
      args: [entries]
    });
    const n = res.reduce((s, r) => s + (r.result || 0), 0);
    say(`Filled ${n} fields. Please review before submitting.`);
  } catch (e) {
    say('Cannot fill this page: ' + e.message);
  }
};

$('add').onclick = async () => {
  const aliases = $('mk').value.split(',').map(norm).filter(Boolean);
  if (!aliases.length || !$('mv').value) return say('Enter a label and a value.');
  merge([{ key: aliases[0], aliases, type: 'text', value: $('mv').value }]);
  await persist();
  $('mk').value = $('mv').value = '';
  render();
};

function render() {
  const list = $('list');
  list.innerHTML = '';
  entries.forEach((e, i) => {
    const d = document.createElement('div');
    d.className = 'item';
    d.innerHTML = '<div class="k"></div><div class="line"><input type="text"><button class="del">×</button></div>';
    d.querySelector('.k').textContent = e.key;
    const inp = d.querySelector('input');
    inp.value = e.value;
    inp.onchange = () => {
      e.value = e.type === 'checkbox' ? inp.value === 'true' : inp.value;
      persist();
    };
    d.querySelector('.del').onclick = () => { entries.splice(i, 1); persist(); render(); };
    list.appendChild(d);
  });
}

$('exp').onclick = () => ($('bk').value = JSON.stringify(entries, null, 1));
$('imp').onclick = async () => {
  try {
    entries = JSON.parse($('bk').value);
    await persist(); render(); say('Imported.');
  } catch { say('Invalid JSON.'); }
};
$('clr').onclick = async () => {
  if (confirm('Delete all saved data?')) { entries = []; await persist(); render(); }
};

load();

/* Générateur de devis et factures — 100 % navigateur, aucune donnée envoyée. */
(() => {
  'use strict';

  const KEYS = { issuer: 'df.issuer', draft: 'df.draft', docs: 'df.docs' };

  const DEFAULT_NOTES = {
    devis: 'Devis valable 30 jours à compter de sa date d\'émission.\nPour accepter ce devis, merci de le retourner signé avec la mention « Bon pour accord ».',
    facture: 'Paiement à réception, par virement bancaire.\nEn cas de retard de paiement, des pénalités pourront être appliquées.'
  };

  const LABELS = {
    devis: { title: 'Devis', due: 'Valable jusqu\'au', prefix: 'D' },
    facture: { title: 'Facture', due: 'Échéance', prefix: 'F' }
  };

  // ---------- Stockage (tolérant aux erreurs : navigation privée, etc.) ----------
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
    }
  };

  // ---------- Utilitaires ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

  const isoDate = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const addDays = (iso, days) => {
    const d = iso ? new Date(iso + 'T12:00:00') : new Date();
    d.setDate(d.getDate() + days);
    return isoDate(d);
  };
  const fmtDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso + 'T12:00:00');
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  };

  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const money = (amount, currency) => {
    try {
      return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: currency || 'EUR' }).format(amount);
    } catch {
      return `${amount.toFixed(2)} ${currency}`;
    }
  };

  const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  const setPath = (obj, path, value) => {
    const keys = path.split('.');
    const last = keys.pop();
    const target = keys.reduce((o, k) => (o[k] ??= {}), obj);
    target[last] = value;
  };

  let toastTimer;
  const toast = (msg) => {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  };

  // ---------- Numérotation ----------
  const NUMBER_RE = /^([DF])-(\d{4})-(\d{3,})$/;

  function nextNumber(type, dateIso) {
    const year = (dateIso || isoDate(new Date())).slice(0, 4);
    const prefix = LABELS[type].prefix;
    const docs = store.get(KEYS.docs, []);
    let max = 0;
    for (const d of docs) {
      const m = NUMBER_RE.exec(d.number || '');
      if (m && m[1] === prefix && m[2] === year) max = Math.max(max, parseInt(m[3], 10));
    }
    return `${prefix}-${year}-${String(max + 1).padStart(3, '0')}`;
  }

  // ---------- État ----------
  function blankLine() { return { desc: '', qty: 1, price: 0, vat: 20 }; }

  function newDoc(type = 'devis') {
    const today = isoDate(new Date());
    return {
      id: uid(),
      type,
      number: nextNumber(type, today),
      date: today,
      dueDate: addDays(today, 30),
      currency: store.get(KEYS.issuer, {}).currency || 'EUR',
      discount: '',
      deposit: '',
      notes: DEFAULT_NOTES[type],
      issuer: { ...store.get(KEYS.issuer, {}) },
      client: { name: '', email: '', address: '' },
      lines: [blankLine()]
    };
  }

  function normalize(doc) {
    const base = newDoc(doc && doc.type === 'facture' ? 'facture' : 'devis');
    const out = { ...base, ...doc };
    out.issuer = { ...base.issuer, ...(doc.issuer || {}) };
    out.client = { ...base.client, ...(doc.client || {}) };
    out.lines = Array.isArray(doc.lines) && doc.lines.length
      ? doc.lines.map((l) => ({ ...blankLine(), ...l }))
      : [blankLine()];
    return out;
  }

  let state = store.get(KEYS.draft, null) ? normalize(store.get(KEYS.draft)) : newDoc();
  let dirty = false;

  function persistIssuer() {
    const { logo, ...rest } = state.issuer;
    // Le logo est mémorisé aussi, sauf s'il ne tient pas dans le stockage.
    if (!store.set(KEYS.issuer, { ...state.issuer, currency: state.currency })) {
      store.set(KEYS.issuer, { ...rest, currency: state.currency });
    }
  }

  let draftTimer;
  function persistDraft() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => store.set(KEYS.draft, state), 300);
  }

  // ---------- Calculs ----------
  function computeTotals(doc) {
    const discountRate = Math.min(Math.max(num(doc.discount), 0), 100) / 100;
    let subtotal = 0;
    const vatByRate = new Map();
    for (const l of doc.lines) {
      const lineHt = num(l.qty) * num(l.price);
      subtotal += lineHt;
      const rate = num(l.vat);
      const base = lineHt * (1 - discountRate);
      vatByRate.set(rate, (vatByRate.get(rate) || 0) + base * rate / 100);
    }
    const discountAmount = subtotal * discountRate;
    const netHt = subtotal - discountAmount;
    const vatLines = [...vatByRate.entries()]
      .filter(([rate]) => rate > 0)
      .sort((a, b) => a[0] - b[0])
      .map(([rate, amount]) => ({ rate, amount: round2(amount) }));
    const vatTotal = vatLines.reduce((s, v) => s + v.amount, 0);
    const ttc = round2(netHt + vatTotal);
    const deposit = round2(Math.max(num(doc.deposit), 0));
    return {
      subtotal: round2(subtotal),
      discountRate,
      discountAmount: round2(discountAmount),
      netHt: round2(netHt),
      vatLines,
      vatTotal: round2(vatTotal),
      ttc,
      deposit,
      balance: round2(ttc - deposit)
    };
  }

  // ---------- Rendu de l'aperçu ----------
  function renderPreview() {
    const d = state;
    const t = computeTotals(d);
    const cur = d.currency;
    const L = LABELS[d.type];
    const nl = (s) => escapeHtml(s);

    const rows = d.lines.filter((l) => l.desc || num(l.price) || num(l.qty) !== 1);
    const bodyRows = rows.length
      ? rows.map((l) => `
        <tr>
          <td>${nl(l.desc) || '<span style="color:#999">—</span>'}</td>
          <td class="num">${num(l.qty).toLocaleString('fr-FR')}</td>
          <td class="num">${money(num(l.price), cur)}</td>
          <td class="num">${num(l.vat).toLocaleString('fr-FR')} %</td>
          <td class="num">${money(round2(num(l.qty) * num(l.price)), cur)}</td>
        </tr>`).join('')
      : '<tr><td colspan="5" class="empty">Ajoutez vos prestations dans le formulaire.</td></tr>';

    const issuer = d.issuer;
    const issuerLines = [issuer.address, issuer.email, issuer.phone, issuer.taxId && `N° ${issuer.taxId}`].filter(Boolean).join('\n');
    const clientLines = [d.client.address, d.client.email].filter(Boolean).join('\n');

    const totalsHtml = [
      `<div><span>Total HT</span><span>${money(t.subtotal, cur)}</span></div>`,
      t.discountAmount > 0 ? `<div><span>Remise (${(t.discountRate * 100).toLocaleString('fr-FR')} %)</span><span>− ${money(t.discountAmount, cur)}</span></div>` : '',
      t.discountAmount > 0 ? `<div><span>Total HT net</span><span>${money(t.netHt, cur)}</span></div>` : '',
      ...t.vatLines.map((v) => `<div><span>TVA ${v.rate.toLocaleString('fr-FR')} %</span><span>${money(v.amount, cur)}</span></div>`),
      t.vatLines.length === 0 ? '<div><span>TVA</span><span>Non applicable</span></div>' : '',
      `<div class="grand"><span>Total TTC</span><span>${money(t.ttc, cur)}</span></div>`,
      t.deposit > 0 ? `<div><span>Acompte versé</span><span>− ${money(t.deposit, cur)}</span></div>` : '',
      t.deposit > 0 ? `<div class="due"><span>Reste à payer</span><span>${money(t.balance, cur)}</span></div>` : ''
    ].join('');

    const foot = [issuer.name, issuer.taxId && `N° ${issuer.taxId}`, d.type === 'facture' && issuer.iban && `IBAN ${issuer.iban}`]
      .filter(Boolean).map(escapeHtml).join(' · ');

    $('#paper').innerHTML = `
      <div class="doc-head">
        <div class="party">
          ${issuer.logo ? `<img src="${escapeHtml(issuer.logo)}" alt="Logo">` : ''}
          <strong>${nl(issuer.name) || 'Votre entreprise'}</strong>
          <p>${nl(issuerLines)}</p>
        </div>
        <div class="doc-title">
          <h1>${L.title}</h1>
          <p><strong>N° ${nl(d.number)}</strong></p>
          <p>Date : ${fmtDate(d.date)}</p>
          <p>${L.due} : ${fmtDate(d.dueDate)}</p>
        </div>
      </div>

      <div class="parties">
        <div></div>
        <div class="party client">
          <h3>${d.type === 'devis' ? 'Destinataire' : 'Facturé à'}</h3>
          <strong>${nl(d.client.name) || 'Nom du client'}</strong>
          <p>${nl(clientLines)}</p>
        </div>
      </div>

      <table class="items">
        <thead>
          <tr>
            <th>Désignation</th>
            <th class="num">Qté</th>
            <th class="num">Prix unit. HT</th>
            <th class="num">TVA</th>
            <th class="num">Total HT</th>
          </tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>

      <div class="totals">${totalsHtml}</div>

      ${d.notes ? `<div class="doc-notes"><h3>Conditions</h3>${nl(d.notes)}</div>` : ''}
      ${d.type === 'facture' && issuer.iban ? `<div class="doc-notes"><h3>Coordonnées bancaires</h3>IBAN : ${nl(issuer.iban)}</div>` : ''}
      ${d.type === 'devis' ? '<div class="signature"><div>Bon pour accord<br>Date et signature du client</div></div>' : ''}
      ${foot ? `<div class="doc-foot">${foot}</div>` : ''}
    `;
  }

  // ---------- Formulaire ----------
  function renderForm() {
    $$('[data-bind]').forEach((el) => {
      const v = getPath(state, el.dataset.bind);
      el.value = v ?? '';
    });
    $$('.segmented button').forEach((b) => b.classList.toggle('active', b.dataset.type === state.type));
    $('#due-label').textContent = LABELS[state.type].due;
    renderLines();
  }

  function renderLines() {
    const wrap = $('#lines');
    wrap.innerHTML = state.lines.map((l, i) => `
      <div class="line" data-index="${i}">
        <label class="desc">Désignation
          <textarea rows="1" data-line="desc" placeholder="Ex : Création du site vitrine">${escapeHtml(l.desc)}</textarea>
        </label>
        <label>Qté<input data-line="qty" type="number" step="any" min="0" value="${escapeHtml(l.qty)}"></label>
        <label>Prix HT<input data-line="price" type="number" step="0.01" value="${escapeHtml(l.price)}"></label>
        <label>TVA %<input data-line="vat" type="number" step="0.1" min="0" value="${escapeHtml(l.vat)}"></label>
        <button type="button" class="remove" title="Supprimer la ligne" aria-label="Supprimer la ligne ${i + 1}">✕</button>
      </div>`).join('');
  }

  function changed() {
    dirty = true;
    persistDraft();
    renderPreview();
  }

  // Champs liés
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.bind) {
      setPath(state, el.dataset.bind, el.value);
      if (el.dataset.bind.startsWith('issuer.') || el.dataset.bind === 'currency') persistIssuer();
      changed();
    } else if (el.dataset.line) {
      const i = Number(el.closest('.line').dataset.index);
      state.lines[i][el.dataset.line] = el.value;
      changed();
    }
  });

  $('#lines').addEventListener('click', (e) => {
    if (!e.target.classList.contains('remove')) return;
    const i = Number(e.target.closest('.line').dataset.index);
    state.lines.splice(i, 1);
    if (!state.lines.length) state.lines.push(blankLine());
    renderLines();
    changed();
  });

  $('#btn-add-line').addEventListener('click', () => {
    const last = state.lines[state.lines.length - 1];
    state.lines.push({ ...blankLine(), vat: last ? last.vat : 20 });
    renderLines();
    changed();
    $$('#lines textarea').at(-1)?.focus();
  });

  // Devis / Facture
  $$('.segmented button').forEach((btn) => btn.addEventListener('click', () => {
    const type = btn.dataset.type;
    if (type === state.type) return;
    switchType(type);
  }));

  function switchType(type) {
    const saved = store.get(KEYS.docs, []).some((d) => d.id === state.id);
    const from = state.type;
    state.type = type;
    // Convertir un document déjà enregistré en crée un nouveau (le devis d'origine reste intact).
    if (saved) state.id = uid();
    if (saved || NUMBER_RE.test(state.number)) state.number = nextNumber(type, state.date);
    if (!state.notes || state.notes === DEFAULT_NOTES[from]) state.notes = DEFAULT_NOTES[type];
    if (type === 'facture' && saved) {
      state.date = isoDate(new Date());
      state.dueDate = addDays(state.date, 30);
    }
    renderForm();
    changed();
  }

  // Logo
  $('#logo-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) { toast('Logo trop lourd (1,5 Mo max).'); e.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = () => {
      state.issuer.logo = reader.result;
      persistIssuer();
      changed();
    };
    reader.readAsDataURL(file);
  });
  $('#logo-clear').addEventListener('click', () => {
    delete state.issuer.logo;
    $('#logo-input').value = '';
    persistIssuer();
    changed();
  });

  // ---------- Actions ----------
  function save() {
    const docs = store.get(KEYS.docs, []);
    const now = new Date().toISOString();
    const existing = docs.findIndex((d) => d.id === state.id);
    const record = { ...state, updatedAt: now };
    if (existing >= 0) docs[existing] = record; else docs.push({ ...record, createdAt: now });
    if (store.set(KEYS.docs, docs)) {
      dirty = false;
      store.set(KEYS.draft, state);
      toast(`${LABELS[state.type].title} ${state.number} enregistré.`);
    } else {
      toast('Stockage plein : exportez puis supprimez d\'anciens documents.');
    }
  }

  function load(doc) {
    state = normalize(structuredClone(doc));
    dirty = false;
    store.set(KEYS.draft, state);
    renderForm();
    renderPreview();
  }

  $('#btn-save').addEventListener('click', save);

  $('#btn-new').addEventListener('click', () => {
    if (dirty && !confirm('Le document actuel n\'est pas enregistré. Créer un nouveau document quand même ?')) return;
    load(newDoc(state.type));
  });

  $('#btn-print').addEventListener('click', () => {
    const prev = document.title;
    const client = state.client.name ? ` - ${state.client.name}` : '';
    document.title = `${LABELS[state.type].title} ${state.number}${client}`;
    window.print();
    setTimeout(() => { document.title = prev; }, 500);
  });

  $('#btn-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${state.number || 'document'}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  $('#import-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (typeof data !== 'object' || !Array.isArray(data.lines)) throw new Error('format');
      load({ ...data, id: uid() });
      dirty = true;
      toast('Document importé. Pensez à l\'enregistrer.');
    } catch {
      toast('Fichier invalide.');
    }
  });

  // ---------- Historique ----------
  const dialog = $('#history');

  function renderHistory() {
    const docs = store.get(KEYS.docs, []).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    const list = $('#history-list');
    if (!docs.length) {
      list.innerHTML = '<p class="hint">Aucun document enregistré pour l\'instant.</p>';
      return;
    }
    list.innerHTML = docs.map((d) => {
      const t = computeTotals(normalize(d));
      return `
        <div class="history-item" data-id="${escapeHtml(d.id)}">
          <div>
            <div><span class="tag">${LABELS[d.type]?.title || d.type}</span><strong>${escapeHtml(d.number)}</strong> — ${escapeHtml(d.client?.name || 'Sans client')}</div>
            <div class="meta">${fmtDate(d.date)} · ${money(t.ttc, d.currency)} TTC</div>
          </div>
          <div class="actions">
            <button type="button" class="btn small" data-act="open">Ouvrir</button>
            <button type="button" class="btn ghost small" data-act="dup">Dupliquer</button>
            ${d.type === 'devis' ? '<button type="button" class="btn ghost small" data-act="invoice">→ Facture</button>' : ''}
            <button type="button" class="btn ghost small danger" data-act="del">Supprimer</button>
          </div>
        </div>`;
    }).join('');
  }

  $('#btn-history').addEventListener('click', () => { renderHistory(); dialog.showModal(); });
  $('#history-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

  $('#history-list').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = btn.closest('.history-item').dataset.id;
    const docs = store.get(KEYS.docs, []);
    const doc = docs.find((d) => d.id === id);
    if (!doc) return;
    const act = btn.dataset.act;

    if (act !== 'del' && dirty && !confirm('Le document actuel n\'est pas enregistré. Continuer ?')) return;

    if (act === 'open') {
      load(doc);
      dialog.close();
    } else if (act === 'dup') {
      const today = isoDate(new Date());
      load({ ...doc, id: uid(), number: nextNumber(doc.type, today), date: today, dueDate: addDays(today, 30) });
      dirty = true;
      dialog.close();
      toast('Copie créée. Pensez à l\'enregistrer.');
    } else if (act === 'invoice') {
      load(doc);
      switchType('facture');
      dialog.close();
      toast('Facture créée à partir du devis. Pensez à l\'enregistrer.');
    } else if (act === 'del') {
      if (!confirm(`Supprimer définitivement ${doc.number} ?`)) return;
      store.set(KEYS.docs, docs.filter((d) => d.id !== id));
      renderHistory();
    }
  });

  window.addEventListener('beforeunload', () => store.set(KEYS.draft, state));

  // ---------- Démarrage ----------
  renderForm();
  renderPreview();
})();

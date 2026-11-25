/* Devis & Factures — 100 % navigateur : aucune donnée n'est envoyée sur Internet. */
(() => {
  'use strict';

  // ======================================================================
  // Constantes
  // ======================================================================
  const KEYS = {
    issuer: 'df.issuer',
    draft: 'df.draft',
    docs: 'df.docs',
    clients: 'df.clients',
    catalog: 'df.catalog',
    view: 'df.view'
  };

  const COLORS = ['#2f5bea', '#0f766e', '#7c3aed', '#be123c', '#c2410c', '#0369a1', '#15803d', '#1f2937'];

  const LABELS = {
    devis: { title: 'Devis', due: 'Valable jusqu\'au', prefix: 'D', recipient: 'Destinataire' },
    facture: { title: 'Facture', due: 'Échéance', prefix: 'F', recipient: 'Facturé à' }
  };

  const DEFAULT_NOTES = {
    devis: 'Pour accepter ce devis, merci de le retourner signé avec la mention « Bon pour accord ».',
    facture: 'Merci pour votre confiance.'
  };

  const LEGAL_TEXT = 'En cas de retard de paiement, une pénalité égale à trois fois le taux d\'intérêt légal sera exigible '
    + '(art. L441-10 du Code de commerce), ainsi qu\'une indemnité forfaitaire pour frais de recouvrement de 40 €. '
    + 'Aucun escompte pour paiement anticipé.';

  const STATUS = {
    devis: {
      brouillon: { label: 'Brouillon', tone: 'gray' },
      envoye: { label: 'Envoyé', tone: 'blue' },
      accepte: { label: 'Accepté', tone: 'green' },
      refuse: { label: 'Refusé', tone: 'red' }
    },
    facture: {
      brouillon: { label: 'Brouillon', tone: 'gray' },
      envoyee: { label: 'Envoyée', tone: 'blue' },
      payee: { label: 'Payée', tone: 'green' },
      annulee: { label: 'Annulée', tone: 'gray' }
    }
  };
  // Statuts calculés automatiquement à partir de la date d'échéance.
  const DERIVED = {
    retard: { label: 'En retard', tone: 'red' },
    expire: { label: 'Expiré', tone: 'amber' }
  };

  const ICONS = {
    bookmark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>'
  };

  // ======================================================================
  // Stockage local (tolérant aux erreurs : navigation privée, quota…)
  // ======================================================================
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

  // ======================================================================
  // Utilitaires
  // ======================================================================
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const clone = (o) => JSON.parse(JSON.stringify(o));

  const pad = (n) => String(n).padStart(2, '0');
  const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => isoDate(new Date());
  const parseIso = (iso) => new Date(iso + 'T12:00:00');
  const addDays = (iso, days) => { const d = iso ? parseIso(iso) : new Date(); d.setDate(d.getDate() + days); return isoDate(d); };
  const diffDays = (a, b) => Math.round((parseIso(b) - parseIso(a)) / 86400000);
  const validIso = (iso) => /^\d{4}-\d{2}-\d{2}$/.test(iso || '') && !Number.isNaN(parseIso(iso).getTime());
  const fmtDate = (iso, style = 'long') => {
    if (!validIso(iso)) return '—';
    return parseIso(iso).toLocaleDateString('fr-FR', style === 'long'
      ? { day: 'numeric', month: 'long', year: 'numeric' }
      : { day: '2-digit', month: '2-digit', year: 'numeric' });
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

  const safeColor = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : COLORS[0]);
  const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  // ======================================================================
  // Données
  // ======================================================================
  const getDocs = () => store.get(KEYS.docs, []);
  const setDocs = (docs) => store.set(KEYS.docs, docs);
  const getClients = () => store.get(KEYS.clients, []);
  const setClients = (list) => store.set(KEYS.clients, list);
  const getCatalog = () => store.get(KEYS.catalog, []);
  const setCatalog = (list) => store.set(KEYS.catalog, list);

  function issuerDefaults() {
    return {
      name: '', email: '', phone: '', address: '', website: '',
      taxId: '', vatNumber: '', iban: '', bic: '', legal: '',
      logo: '', color: COLORS[0], template: 'clean'
    };
  }
  const getIssuer = () => ({ ...issuerDefaults(), ...store.get(KEYS.issuer, {}) });

  const NUMBER_RE = /^([DF])-(\d{4})-(\d{3,})$/;
  function nextNumber(type, dateIso) {
    const year = (validIso(dateIso) ? dateIso : today()).slice(0, 4);
    const prefix = LABELS[type].prefix;
    let max = 0;
    for (const d of getDocs()) {
      const m = NUMBER_RE.exec(d.number || '');
      if (m && m[1] === prefix && m[2] === year) max = Math.max(max, parseInt(m[3], 10));
    }
    return `${prefix}-${year}-${String(max + 1).padStart(3, '0')}`;
  }

  const blankLine = (vat = 20) => ({ desc: '', qty: 1, unit: '', price: 0, vat });
  const blankClient = () => ({ id: '', name: '', email: '', phone: '', address: '', taxId: '', vatNumber: '' });
  const isBlankLine = (l) => !l.desc && !num(l.price);

  function newDoc(type = 'devis') {
    const issuer = getIssuer();
    const date = today();
    const currency = issuer.currency || 'EUR';
    const terms = String(issuer.terms ?? '30');
    return {
      id: uid(),
      type,
      status: 'brouillon',
      number: nextNumber(type, date),
      date,
      dueDate: type === 'facture' ? addDays(date, num(terms)) : addDays(date, 30),
      terms,
      paymentMethod: issuer.paymentMethod || 'Virement bancaire',
      currency,
      subject: '',
      discount: '',
      deposit: '',
      vatExempt: !!issuer.vatExempt,
      legalMentions: type === 'facture' && currency === 'EUR',
      notes: DEFAULT_NOTES[type],
      issuer: {
        ...issuerDefaults(),
        ...Object.fromEntries(Object.entries(issuer).filter(([k]) => k in issuerDefaults()))
      },
      client: blankClient(),
      lines: [blankLine()]
    };
  }

  // Complète un document (ancien format, import…) avec les champs manquants.
  function normalize(doc) {
    const base = newDoc(doc && doc.type === 'facture' ? 'facture' : 'devis');
    const out = { ...base, ...doc };
    out.issuer = { ...base.issuer, ...(doc.issuer || {}) };
    if (!out.issuer.logo) out.issuer.logo = base.issuer.logo; // le logo n'est pas copié dans chaque document
    out.client = { ...base.client, ...(doc.client || {}) };
    out.lines = Array.isArray(doc.lines) && doc.lines.length
      ? doc.lines.map((l) => ({ ...blankLine(), ...l }))
      : [blankLine()];
    if (!STATUS[out.type][out.status]) out.status = 'brouillon';
    out.terms = String(out.terms ?? '30');
    return out;
  }

  // Copie allégée pour le stockage (sans le logo, qui reste global).
  function forStorage(doc) {
    const copy = clone(doc);
    delete copy.issuer.logo;
    return copy;
  }

  function computeTotals(doc) {
    const discountRate = Math.min(Math.max(num(doc.discount), 0), 100) / 100;
    let subtotal = 0;
    const vatByRate = new Map();
    for (const l of doc.lines || []) {
      const lineHt = num(l.qty) * num(l.price);
      subtotal += lineHt;
      const rate = doc.vatExempt ? 0 : num(l.vat);
      const base = lineHt * (1 - discountRate);
      vatByRate.set(rate, (vatByRate.get(rate) || 0) + base * rate / 100);
    }
    const discountAmount = subtotal * discountRate;
    const netHt = subtotal - discountAmount;
    const vatLines = [...vatByRate.entries()]
      .filter(([rate, amount]) => rate > 0 && amount > 0)
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
      ttc,
      deposit,
      balance: round2(Math.max(ttc - deposit, 0))
    };
  }

  function effectiveStatus(doc) {
    const s = doc.status || 'brouillon';
    if (validIso(doc.dueDate) && doc.dueDate < today()) {
      if (doc.type === 'facture' && s === 'envoyee') return 'retard';
      if (doc.type === 'devis' && s === 'envoye') return 'expire';
    }
    return s;
  }
  const statusInfo = (doc, key = effectiveStatus(doc)) => STATUS[doc.type]?.[key] || DERIVED[key] || { label: key, tone: 'gray' };

  // <select> de statut : l'option « Envoyée » affiche « En retard » quand c'est le cas.
  function statusOptions(doc) {
    const eff = effectiveStatus(doc);
    return Object.entries(STATUS[doc.type]).map(([key, info]) => {
      const label = key === doc.status && DERIVED[eff] ? DERIVED[eff].label : info.label;
      return `<option value="${key}"${key === doc.status ? ' selected' : ''}>${label}</option>`;
    }).join('');
  }

  // ======================================================================
  // État de l'éditeur
  // ======================================================================
  let state = store.get(KEYS.draft, null) ? normalize(store.get(KEYS.draft)) : newDoc();
  let dirty = false;

  const isSaved = () => getDocs().some((d) => d.id === state.id);

  function persistIssuer() {
    const { logo, ...rest } = state.issuer;
    const prev = getIssuer();
    const data = {
      ...prev,
      ...rest,
      logo: logo || '',
      currency: state.currency,
      vatExempt: !!state.vatExempt,
      paymentMethod: state.paymentMethod,
      terms: state.terms
    };
    if (!store.set(KEYS.issuer, data)) toast('Stockage plein : le logo est peut-être trop lourd.');
  }

  let draftTimer;
  function persistDraft() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => store.set(KEYS.draft, forStorage(state)), 250);
  }

  function updateSaveState() {
    const el = $('#save-state');
    if (dirty) {
      el.className = 'save-state dirty';
      el.textContent = 'Non enregistré';
    } else if (isSaved()) {
      el.className = 'save-state saved';
      el.textContent = 'Enregistré';
    } else {
      el.className = 'save-state';
      el.textContent = '';
    }
  }

  function changed() {
    dirty = true;
    persistDraft();
    renderPreview();
    updateSaveState();
  }

  // ======================================================================
  // Aperçu du document
  // ======================================================================
  function renderPreview() {
    const d = state;
    const t = computeTotals(d);
    const cur = d.currency;
    const L = LABELS[d.type];
    const h = escapeHtml;
    const issuer = d.issuer;

    const accent = safeColor(issuer.color);
    const lum = luminance(accent);
    const paper = $('#paper');
    paper.className = `paper tpl-${issuer.template === 'band' ? 'band' : 'clean'}`;
    paper.style.setProperty('--paper-accent', accent);
    paper.style.setProperty('--paper-on-accent', lum > 0.5 ? '#17191e' : '#ffffff');
    paper.style.setProperty('--paper-accent-text', lum > 0.55 ? '#17191e' : accent);

    const rows = d.lines.filter((l) => !isBlankLine(l));
    const showUnit = rows.some((l) => l.unit);
    const showVat = !d.vatExempt;
    const cols = 4 + (showUnit ? 1 : 0) + (showVat ? 1 : 0);
    const bodyRows = rows.length
      ? rows.map((l) => `
        <tr>
          <td class="d">${h(l.desc) || '<span class="placeholder">—</span>'}</td>
          <td class="num">${num(l.qty).toLocaleString('fr-FR')}</td>
          ${showUnit ? `<td>${h(l.unit)}</td>` : ''}
          <td class="num">${money(num(l.price), cur)}</td>
          ${showVat ? `<td class="num">${num(l.vat).toLocaleString('fr-FR')} %</td>` : ''}
          <td class="num">${money(round2(num(l.qty) * num(l.price)), cur)}</td>
        </tr>`).join('')
      : `<tr><td colspan="${cols}" class="empty">Ajoutez vos prestations dans le formulaire.</td></tr>`;

    const issuerLines = [issuer.address, issuer.phone, issuer.email, issuer.website].filter(Boolean).join('\n');
    const c = d.client;
    const clientLines = [
      c.address, c.email, c.phone,
      c.taxId && `SIRET / ICE : ${c.taxId}`,
      c.vatNumber && `N° TVA : ${c.vatNumber}`
    ].filter(Boolean).join('\n');

    const meta = [
      ['N°', d.number],
      ['Date', fmtDate(d.date)],
      [L.due, fmtDate(d.dueDate)],
      d.type === 'facture' && d.status === 'payee' && validIso(d.paidAt) ? ['Payée le', fmtDate(d.paidAt)] : null
    ].filter(Boolean).map(([k, v]) => `<dt>${k}</dt><dd>${h(v)}</dd>`).join('');

    const totals = [
      `<div><span>Total HT</span><span>${money(t.subtotal, cur)}</span></div>`,
      t.discountAmount > 0 ? `<div><span>Remise ${(t.discountRate * 100).toLocaleString('fr-FR')} %</span><span>− ${money(t.discountAmount, cur)}</span></div>` : '',
      t.discountAmount > 0 ? `<div><span>Total HT net</span><span>${money(t.netHt, cur)}</span></div>` : '',
      ...t.vatLines.map((v) => `<div><span>TVA ${v.rate.toLocaleString('fr-FR')} %</span><span>${money(v.amount, cur)}</span></div>`),
      d.vatExempt ? '<div><span>TVA</span><span>Non applicable</span></div>' : '',
      `<div class="grand"><span>Total ${d.vatExempt ? '' : 'TTC'}</span><span>${money(t.ttc, cur)}</span></div>`,
      t.deposit > 0 ? `<div><span>Acompte versé</span><span>− ${money(t.deposit, cur)}</span></div>` : '',
      t.deposit > 0 ? `<div class="due"><span>Reste à payer</span><span>${money(t.balance, cur)}</span></div>` : ''
    ].join('');

    const termsLabel = $(`#terms-select option[value="${CSS.escape(d.terms)}"]`)?.textContent || `${d.terms} jours`;
    const pay = [
      ['Délai', termsLabel],
      ['Mode', d.paymentMethod],
      issuer.iban && ['IBAN', issuer.iban],
      issuer.bic && ['BIC', issuer.bic]
    ].filter(Boolean).map(([k, v]) => `<dt>${k}</dt><dd>${h(v)}</dd>`).join('');

    const legal = [
      d.vatExempt && 'TVA non applicable, art. 293 B du CGI.',
      d.type === 'facture' && d.legalMentions && LEGAL_TEXT
    ].filter(Boolean).join('\n');

    const foot = [
      issuer.name, issuer.legal,
      issuer.taxId && `SIRET / ICE ${issuer.taxId}`,
      issuer.vatNumber && `TVA ${issuer.vatNumber}`
    ].filter(Boolean).map(h).join(' · ');

    let stamp = '';
    if (d.type === 'facture' && d.status === 'payee') stamp = '<div class="stamp paid">Payée</div>';
    if (d.type === 'facture' && d.status === 'annulee') stamp = '<div class="stamp cancelled">Annulée</div>';

    paper.innerHTML = `
      ${stamp}
      <header class="doc-head">
        <div class="doc-issuer">
          ${issuer.logo ? `<img src="${h(issuer.logo)}" alt="">` : ''}
          <strong>${h(issuer.name) || '<span class="placeholder">Votre entreprise</span>'}</strong>
          <p>${h(issuerLines)}</p>
        </div>
        <div class="doc-title">
          <h1>${L.title}</h1>
          <dl class="doc-meta">${meta}</dl>
        </div>
      </header>

      <div class="parties">
        ${d.subject ? `<div class="subject"><h3>Objet</h3><p>${h(d.subject)}</p></div>` : '<div></div>'}
        <div class="client-box">
          <h3>${L.recipient}</h3>
          <strong>${h(c.name) || '<span class="placeholder">Nom du client</span>'}</strong>
          <p>${h(clientLines)}</p>
        </div>
      </div>

      <table class="items">
        <thead>
          <tr>
            <th>Désignation</th>
            <th class="num">Qté</th>
            ${showUnit ? '<th>Unité</th>' : ''}
            <th class="num">Prix unit. HT</th>
            ${showVat ? '<th class="num">TVA</th>' : ''}
            <th class="num">Total HT</th>
          </tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>

      <div class="summary">
        <div class="pay-box">
          <h3 class="pay-title">Conditions de paiement</h3>
          <dl>${pay}</dl>
        </div>
        <div class="totals">${totals}</div>
      </div>

      ${d.notes ? `<div class="doc-block"><h3>Notes</h3>${h(d.notes)}</div>` : ''}
      ${legal ? `<div class="doc-legal">${h(legal)}</div>` : ''}
      ${d.type === 'devis' ? '<div class="signature"><div>Bon pour accord — date et signature du client</div></div>' : ''}
      ${foot ? `<footer class="doc-foot">${foot}</footer>` : ''}
    `;
  }

  // ======================================================================
  // Formulaire de l'éditeur
  // ======================================================================
  function renderForm() {
    $$('#view-editor [data-bind]').forEach((el) => {
      const v = getPath(state, el.dataset.bind);
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = v ?? '';
    });
    $('#status-select').innerHTML = statusOptions(state);
    $('#status-select').className = `s-${statusInfo(state).tone}`;
    $$('[data-type]').forEach((b) => b.classList.toggle('active', b.dataset.type === state.type));
    $$('[data-template]').forEach((b) => b.classList.toggle('active', b.dataset.template === (state.issuer.template || 'clean')));
    $('#due-label').textContent = LABELS[state.type].due;
    $('#legal-check').hidden = state.type !== 'facture';
    $('#issuer-details').open = !state.issuer.name;
    renderLogo();
    renderSwatches();
    renderClientPick();
    renderCatalogPick();
    renderLines();
    updateSaveState();
  }

  function renderLines() {
    $('#lines').innerHTML = state.lines.map((l, i) => `
      <div class="line" data-index="${i}">
        <label class="desc">Désignation
          <textarea rows="2" data-line="desc" placeholder="Ex : Création du site vitrine (5 pages)">${escapeHtml(l.desc)}</textarea>
        </label>
        <label>Qté<input data-line="qty" type="number" step="any" min="0" value="${escapeHtml(l.qty)}"></label>
        <label>Unité<input data-line="unit" list="units" value="${escapeHtml(l.unit)}" placeholder="forfait"></label>
        <label>Prix HT<input data-line="price" type="number" step="0.01" value="${escapeHtml(l.price)}"></label>
        <label>TVA %<input data-line="vat" type="number" step="0.1" min="0" value="${escapeHtml(l.vat)}"${state.vatExempt ? ' disabled' : ''}></label>
        <div class="tools">
          <button type="button" class="icon-btn to-catalog" title="Ajouter au catalogue" aria-label="Ajouter la ligne ${i + 1} au catalogue">${ICONS.bookmark}</button>
          <button type="button" class="icon-btn remove" title="Supprimer la ligne" aria-label="Supprimer la ligne ${i + 1}">${ICONS.x}</button>
        </div>
      </div>`).join('');
  }

  function renderLogo() {
    const thumb = $('#logo-thumb');
    const logo = state.issuer.logo;
    thumb.classList.toggle('has-logo', !!logo);
    thumb.style.backgroundImage = logo ? `url("${logo.replace(/"/g, '%22')}")` : '';
    $('#logo-clear').hidden = !logo;
  }

  function renderSwatches() {
    const current = safeColor(state.issuer.color);
    const custom = !COLORS.includes(current);
    $('#swatches').innerHTML = COLORS.map((c) => `
      <button type="button" class="swatch${c === current ? ' active' : ''}" data-color="${c}" style="background:${c}" aria-label="Couleur ${c}"></button>`).join('')
      + `<span class="swatch swatch-custom${custom ? ' active' : ''}" title="Couleur personnalisée"${custom ? ` style="background:${current}"` : ''}>
           <input type="color" id="color-custom" value="${current}" aria-label="Couleur personnalisée">
         </span>`;
  }

  function renderClientPick() {
    const clients = getClients().sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    $('#client-pick').innerHTML = '<option value="">— Nouveau client —</option>'
      + clients.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('');
    $('#client-pick').value = clients.some((c) => c.id === state.client.id) ? state.client.id : '';
  }

  function renderCatalogPick() {
    const items = getCatalog().sort((a, b) => a.desc.localeCompare(b.desc, 'fr'));
    const sel = $('#catalog-pick');
    sel.innerHTML = `<option value="">${items.length ? '+ Depuis le catalogue…' : 'Catalogue vide'}</option>`
      + items.map((it) => `<option value="${escapeHtml(it.id)}">${escapeHtml(it.desc.split('\n')[0])} — ${money(num(it.price), state.currency)}</option>`).join('');
    sel.disabled = !items.length;
  }

  // ---------- Saisie ----------
  $('#view-editor').addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.bind) {
      const path = el.dataset.bind;
      const value = el.type === 'checkbox' ? el.checked : el.value;

      if (path === 'date' && validIso(value) && validIso(state.date) && validIso(state.dueDate)) {
        // Décale l'échéance avec la date du document.
        const gap = state.type === 'facture' ? num(state.terms) : diffDays(state.date, state.dueDate);
        state.dueDate = addDays(value, gap);
        $('[data-bind="dueDate"]').value = state.dueDate;
      }

      setPath(state, path, value);

      if (path === 'terms' && state.type === 'facture' && validIso(state.date)) {
        state.dueDate = addDays(state.date, num(value));
        $('[data-bind="dueDate"]').value = state.dueDate;
      }
      if (path === 'status') {
        state.paidAt = value === 'payee' ? (state.paidAt || today()) : '';
        $('#status-select').className = `s-${statusInfo(state).tone}`;
      }
      if (path === 'vatExempt') renderLines();
      if (path === 'dueDate') { $('#status-select').innerHTML = statusOptions(state); $('#status-select').className = `s-${statusInfo(state).tone}`; }
      if (path.startsWith('issuer.') || ['currency', 'vatExempt', 'paymentMethod', 'terms'].includes(path)) persistIssuer();
      if (path === 'currency') renderCatalogPick();
      changed();
    } else if (el.dataset.line) {
      const i = Number(el.closest('.line').dataset.index);
      state.lines[i][el.dataset.line] = el.value;
      changed();
    }
  });

  $('#lines').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const i = Number(btn.closest('.line').dataset.index);
    if (btn.classList.contains('remove')) {
      state.lines.splice(i, 1);
      if (!state.lines.length) state.lines.push(blankLine());
      renderLines();
      changed();
    } else if (btn.classList.contains('to-catalog')) {
      const l = state.lines[i];
      if (!l.desc.trim()) { toast('Écrivez d\'abord une désignation.'); return; }
      const items = getCatalog();
      const existing = items.find((it) => it.desc.trim().toLowerCase() === l.desc.trim().toLowerCase());
      const item = { id: existing?.id || uid(), desc: l.desc.trim(), unit: l.unit, price: num(l.price), vat: num(l.vat) };
      if (existing) Object.assign(existing, item); else items.push(item);
      setCatalog(items);
      renderCatalogPick();
      toast(existing ? 'Prestation mise à jour dans le catalogue.' : 'Prestation ajoutée au catalogue.');
    }
  });

  $('#btn-add-line').addEventListener('click', () => {
    const last = state.lines[state.lines.length - 1];
    state.lines.push(blankLine(last ? last.vat : 20));
    renderLines();
    changed();
    $$('#lines textarea').at(-1)?.focus();
  });

  $('#catalog-pick').addEventListener('change', (e) => {
    const item = getCatalog().find((it) => it.id === e.target.value);
    e.target.value = '';
    if (!item) return;
    const line = { desc: item.desc, qty: 1, unit: item.unit || '', price: num(item.price), vat: num(item.vat) };
    if (state.lines.length === 1 && isBlankLine(state.lines[0])) state.lines[0] = line;
    else state.lines.push(line);
    renderLines();
    changed();
  });

  // ---------- Client ----------
  $('#client-pick').addEventListener('change', (e) => {
    const c = getClients().find((x) => x.id === e.target.value);
    state.client = c ? { ...blankClient(), ...c } : blankClient();
    $$('[data-bind^="client."]').forEach((el) => { el.value = getPath(state, el.dataset.bind) ?? ''; });
    changed();
  });

  $('#btn-save-client').addEventListener('click', () => {
    const c = state.client;
    if (!c.name.trim()) { toast('Indiquez au moins le nom du client.'); return; }
    const clients = getClients();
    const existing = clients.find((x) => x.id === c.id) || clients.find((x) => x.name.trim().toLowerCase() === c.name.trim().toLowerCase());
    const record = { ...blankClient(), ...c, id: existing?.id || uid() };
    if (existing) Object.assign(existing, record); else clients.push(record);
    setClients(clients);
    state.client.id = record.id;
    renderClientPick();
    persistDraft();
    toast(existing ? 'Client mis à jour dans le carnet.' : 'Client ajouté au carnet.');
  });

  // ---------- Apparence ----------
  $('#swatches').addEventListener('click', (e) => {
    const b = e.target.closest('[data-color]');
    if (!b) return;
    setColor(b.dataset.color);
  });
  $('#swatches').addEventListener('input', (e) => {
    if (e.target.id === 'color-custom') {
      state.issuer.color = safeColor(e.target.value);
      persistIssuer();
      changed();
    }
  });
  $('#swatches').addEventListener('change', (e) => { if (e.target.id === 'color-custom') renderSwatches(); });

  function setColor(color) {
    state.issuer.color = safeColor(color);
    persistIssuer();
    renderSwatches();
    changed();
  }

  $$('[data-template]').forEach((btn) => btn.addEventListener('click', () => {
    state.issuer.template = btn.dataset.template;
    $$('[data-template]').forEach((b) => b.classList.toggle('active', b === btn));
    persistIssuer();
    changed();
  }));

  // Le logo est redimensionné pour rester léger dans le stockage du navigateur.
  $('#logo-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast('Choisissez une image (PNG, JPG, SVG…).'); return; }
    if (file.size > 5 * 1024 * 1024) { toast('Image trop lourde (5 Mo max).'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 600 / img.width, 240 / img.height);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        state.issuer.logo = canvas.toDataURL('image/png');
        persistIssuer();
        renderLogo();
        changed();
      };
      img.onerror = () => toast('Impossible de lire cette image.');
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  $('#logo-clear').addEventListener('click', () => {
    state.issuer.logo = '';
    persistIssuer();
    renderLogo();
    changed();
  });

  // ---------- Type de document ----------
  $$('[data-type]').forEach((btn) => btn.addEventListener('click', () => {
    if (btn.dataset.type === state.type) return;
    if (isSaved()) {
      if (dirty && !confirm('Le document actuel n\'est pas enregistré. Continuer ?')) return;
      convert(state, btn.dataset.type);
    } else {
      switchType(btn.dataset.type);
    }
  }));

  function switchType(type) {
    const from = state.type;
    state.type = type;
    state.status = 'brouillon';
    state.paidAt = '';
    if (NUMBER_RE.test(state.number)) state.number = nextNumber(type, state.date);
    if (!state.notes || state.notes === DEFAULT_NOTES[from]) state.notes = DEFAULT_NOTES[type];
    state.dueDate = type === 'facture' ? addDays(state.date, num(state.terms)) : addDays(state.date, 30);
    if (type === 'facture') state.legalMentions = state.currency === 'EUR';
    renderForm();
    changed();
  }

  // Crée un nouveau document à partir d'un autre (ex. : devis → facture).
  function convert(source, type) {
    const date = today();
    const doc = normalize({
      ...clone(source),
      id: uid(),
      type,
      status: 'brouillon',
      paidAt: '',
      number: nextNumber(type, date),
      date,
      dueDate: type === 'facture' ? addDays(date, num(source.terms)) : addDays(date, 30),
      notes: !source.notes || source.notes === DEFAULT_NOTES[source.type] ? DEFAULT_NOTES[type] : source.notes,
      legalMentions: type === 'facture' ? source.currency === 'EUR' : source.legalMentions,
      sourceId: source.id
    });
    if (source.type === 'devis' && type === 'facture') {
      const docs = getDocs();
      const devis = docs.find((d) => d.id === source.id);
      if (devis && ['brouillon', 'envoye'].includes(devis.status || 'brouillon')) {
        devis.status = 'accepte';
        setDocs(docs);
      }
    }
    loadDoc(doc, true);
    toast(`${LABELS[type].title} créée à partir de ${source.number}. Pensez à l'enregistrer.`);
  }

  // ======================================================================
  // Actions principales
  // ======================================================================
  function saveDoc() {
    if (!state.number.trim()) { toast('Le document doit avoir un numéro.'); return; }
    const docs = getDocs();
    const clash = docs.find((d) => d.number === state.number && d.type === state.type && d.id !== state.id);
    if (clash && !confirm(`Le numéro ${state.number} est déjà utilisé. Enregistrer quand même ?`)) return;
    const now = new Date().toISOString();
    const record = { ...forStorage(state), updatedAt: now };
    const i = docs.findIndex((d) => d.id === state.id);
    if (i >= 0) docs[i] = { ...docs[i], ...record }; else docs.push({ ...record, createdAt: now });
    if (setDocs(docs)) {
      dirty = false;
      store.set(KEYS.draft, forStorage(state));
      updateSaveState();
      toast(`${LABELS[state.type].title} ${state.number} enregistré${state.type === 'facture' ? 'e' : ''}.`);
    } else {
      toast('Stockage plein : exportez une sauvegarde puis supprimez d\'anciens documents.');
    }
  }

  function loadDoc(doc, markDirty = false) {
    state = normalize(clone(doc));
    dirty = markDirty;
    store.set(KEYS.draft, forStorage(state));
    renderForm();
    renderPreview();
    updateSaveState();
  }

  function confirmLeave() {
    return !dirty || confirm('Le document actuel n\'est pas enregistré. Continuer quand même ?');
  }

  function startNew(type, client) {
    if (!confirmLeave()) return;
    const doc = newDoc(type);
    if (client) doc.client = { ...blankClient(), ...client };
    loadDoc(doc);
    showView('editor');
  }

  $('#btn-save').addEventListener('click', saveDoc);
  $('#btn-new').addEventListener('click', () => startNew(state.type));

  $('#btn-print').addEventListener('click', () => {
    const prev = document.title;
    const client = state.client.name ? ` - ${state.client.name}` : '';
    document.title = `${LABELS[state.type].title} ${state.number}${client}`;
    window.print();
    setTimeout(() => { document.title = prev; }, 500);
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && currentView === 'editor') {
      e.preventDefault();
      saveDoc();
    }
  });

  // ======================================================================
  // Navigation entre les vues
  // ======================================================================
  let currentView = 'editor';
  function showView(view) {
    if (!document.getElementById(`view-${view}`)) view = 'editor';
    currentView = view;
    $$('.view').forEach((v) => { v.hidden = v.id !== `view-${view}`; });
    $$('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    $$('[data-for]').forEach((el) => { el.hidden = el.dataset.for !== view; });
    store.set(KEYS.view, view);
    if (view === 'dashboard') renderDashboard();
    if (view === 'clients') renderClients();
    if (view === 'catalog') renderCatalog();
    if (view === 'editor') { renderClientPick(); renderCatalogPick(); updateSaveState(); }
    window.scrollTo(0, 0);
  }
  $$('.tabs button').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));
  $$('[data-new]').forEach((b) => b.addEventListener('click', () => startNew(b.dataset.new)));

  // ======================================================================
  // Tableau de bord
  // ======================================================================
  const STATUS_FILTERS = [
    ['brouillon', 'Brouillon'], ['envoye|envoyee', 'Envoyé'], ['accepte', 'Accepté'], ['refuse', 'Refusé'],
    ['expire', 'Expiré'], ['payee', 'Payée'], ['retard', 'En retard'], ['annulee', 'Annulée']
  ];
  $('#f-status').innerHTML += STATUS_FILTERS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');

  function inPeriod(doc, period) {
    if (period === 'all' || !validIso(doc.date)) return period === 'all' || !validIso(doc.date);
    if (period === 'year') return doc.date.slice(0, 4) === today().slice(0, 4);
    const from = parseIso(today());
    from.setMonth(from.getMonth() - 12);
    return doc.date >= isoDate(from);
  }

  function renderDashboard() {
    const docs = getDocs().map(normalize);
    const period = $('#f-period').value;
    const issuerCurrency = getIssuer().currency || 'EUR';

    // Devises présentes
    const currencies = [...new Set([issuerCurrency, ...docs.map((d) => d.currency)])];
    const curSel = $('#f-currency');
    const prevCur = curSel.value || issuerCurrency;
    curSel.innerHTML = currencies.map((c) => `<option value="${c}">${c}</option>`).join('');
    curSel.value = currencies.includes(prevCur) ? prevCur : issuerCurrency;
    $('#f-currency-wrap').hidden = currencies.length < 2;
    const cur = curSel.value;

    // Indicateurs
    const scoped = docs.filter((d) => inPeriod(d, period) && d.currency === cur);
    const invoices = scoped.filter((d) => d.type === 'facture' && !['brouillon', 'annulee'].includes(d.status));
    let billed = 0, paid = 0, pending = 0, late = 0, lateCount = 0, pendingCount = 0;
    for (const d of invoices) {
      const t = computeTotals(d);
      const s = effectiveStatus(d);
      billed += t.ttc;
      if (s === 'payee') paid += t.ttc;
      else {
        paid += Math.min(t.deposit, t.ttc);
        if (s === 'retard') { late += t.balance; lateCount++; } else { pending += t.balance; pendingCount++; }
      }
    }
    const quotes = scoped.filter((d) => d.type === 'devis');
    const openQuotes = quotes.filter((d) => effectiveStatus(d) === 'envoye');
    const openAmount = openQuotes.reduce((s, d) => s + computeTotals(d).ttc, 0);
    const accepted = quotes.filter((d) => d.status === 'accepte').length;
    const decided = accepted + quotes.filter((d) => ['refuse', 'expire'].includes(effectiveStatus(d))).length;
    const rate = decided ? Math.round(accepted / decided * 100) : null;
    const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

    const kpis = [
      { label: 'Chiffre d\'affaires facturé', value: money(round2(billed), cur), sub: plural(invoices.length, 'facture'), dot: 'var(--accent)' },
      { label: 'Encaissé', value: money(round2(paid), cur), sub: billed ? `${Math.round(paid / billed * 100)} % du facturé` : '—', dot: 'var(--st-green)' },
      { label: 'En attente', value: money(round2(pending), cur), sub: plural(pendingCount, 'facture'), dot: 'var(--st-blue)' },
      { label: 'En retard', value: money(round2(late), cur), sub: lateCount ? `${plural(lateCount, 'facture')} à relancer` : 'Aucune', dot: 'var(--st-red)' },
      { label: 'Devis en cours', value: money(round2(openAmount), cur), sub: rate === null ? plural(openQuotes.length, 'devis').replace('deviss', 'devis') : `Taux d'acceptation : ${rate} %`, dot: 'var(--st-amber)' }
    ];
    $('#kpis').innerHTML = kpis.map((k) => `
      <div class="kpi">
        <div class="k-label"><i style="background:${k.dot}"></i>${k.label}</div>
        <div class="k-value">${k.value}</div>
        <div class="k-sub">${k.sub}</div>
      </div>`).join('');

    renderDocsTable(docs, period);
  }

  function renderDocsTable(docs, period) {
    const q = $('#f-search').value.trim().toLowerCase();
    const type = $('#f-type').value;
    const status = $('#f-status').value;
    const rows = docs
      .filter((d) => inPeriod(d, period))
      .filter((d) => !type || d.type === type)
      .filter((d) => !status || status.split('|').includes(effectiveStatus(d)))
      .filter((d) => !q || [d.number, d.client.name, d.subject].some((v) => (v || '').toLowerCase().includes(q)))
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.number || '').localeCompare(a.number || ''));

    const tbody = $('#docs-table tbody');
    const total = getDocs().length;
    $('#docs-empty').hidden = rows.length > 0;
    $('#docs-empty').textContent = total ? 'Aucun document ne correspond à ces filtres.' : 'Aucun document pour l\'instant. Créez votre premier devis !';
    $('#docs-table').hidden = !rows.length;

    tbody.innerHTML = rows.map((d) => {
      const t = computeTotals(d);
      const eff = effectiveStatus(d);
      return `
        <tr data-id="${escapeHtml(d.id)}">
          <td><span class="doc-no">${escapeHtml(d.number)}</span><span class="doc-type">${LABELS[d.type].title}</span></td>
          <td>${escapeHtml(d.client.name) || '<span class="doc-type">Sans client</span>'}${d.subject ? `<span class="doc-type">${escapeHtml(d.subject)}</span>` : ''}</td>
          <td>${fmtDate(d.date, 'short')}</td>
          <td class="${eff === 'retard' ? 'late' : ''}">${fmtDate(d.dueDate, 'short')}</td>
          <td class="num">${money(t.ttc, d.currency)}</td>
          <td><select class="status s-${statusInfo(d).tone}" data-act="status" aria-label="Statut de ${escapeHtml(d.number)}">${statusOptions(d)}</select></td>
          <td>
            <div class="row-actions">
              <button type="button" class="btn small" data-act="open">Ouvrir</button>
              ${d.type === 'devis' ? '<button type="button" class="btn ghost small" data-act="invoice" title="Créer la facture à partir de ce devis">Facturer</button>' : ''}
              <button type="button" class="btn ghost small" data-act="dup">Dupliquer</button>
              <button type="button" class="icon-btn remove" data-act="del" title="Supprimer" aria-label="Supprimer ${escapeHtml(d.number)}">${ICONS.trash}</button>
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  ['#f-period', '#f-currency', '#f-type', '#f-status'].forEach((s) => $(s).addEventListener('change', renderDashboard));
  $('#f-search').addEventListener('input', renderDashboard);

  $('#docs-table').addEventListener('change', (e) => {
    if (e.target.dataset.act !== 'status') return;
    const id = e.target.closest('tr').dataset.id;
    const docs = getDocs();
    const doc = docs.find((d) => d.id === id);
    if (!doc) return;
    doc.status = e.target.value;
    doc.paidAt = doc.status === 'payee' ? (doc.paidAt || today()) : '';
    doc.updatedAt = new Date().toISOString();
    setDocs(docs);
    if (state.id === id) {
      state.status = doc.status;
      state.paidAt = doc.paidAt;
      store.set(KEYS.draft, forStorage(state));
      renderForm();
      renderPreview();
    }
    renderDashboard();
    toast(`${doc.number} : ${statusInfo(doc).label.toLowerCase()}.`);
  });

  $('#docs-table').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = btn.closest('tr').dataset.id;
    const docs = getDocs();
    const doc = docs.find((d) => d.id === id);
    if (!doc) return;
    const act = btn.dataset.act;

    if (act === 'del') {
      if (!confirm(`Supprimer définitivement ${doc.number} ?`)) return;
      setDocs(docs.filter((d) => d.id !== id));
      if (state.id === id) dirty = true;
      renderDashboard();
      toast(`${doc.number} supprimé.`);
      return;
    }
    if (!confirmLeave()) return;
    if (act === 'open') {
      loadDoc(doc);
    } else if (act === 'dup') {
      const date = today();
      loadDoc({ ...doc, id: uid(), status: 'brouillon', paidAt: '', number: nextNumber(doc.type, date), date,
        dueDate: doc.type === 'facture' ? addDays(date, num(doc.terms ?? 30)) : addDays(date, 30) }, true);
      toast('Copie créée. Pensez à l\'enregistrer.');
    } else if (act === 'invoice') {
      convert(normalize(doc), 'facture');
    }
    showView('editor');
  });

  // ---------- Sauvegarde complète ----------
  $('#btn-backup').addEventListener('click', () => {
    const data = {
      app: 'devis-factures',
      version: 2,
      exportedAt: new Date().toISOString(),
      issuer: getIssuer(),
      docs: getDocs(),
      clients: getClients(),
      catalog: getCatalog()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sauvegarde-devis-factures-${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Sauvegarde téléchargée.');
  });

  $('#restore-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let data;
    try { data = JSON.parse(await file.text()); } catch { toast('Fichier invalide.'); return; }
    if (!data || typeof data !== 'object') { toast('Fichier invalide.'); return; }

    // Ancien format : un seul document.
    if (Array.isArray(data.lines)) {
      if (!confirmLeave()) return;
      loadDoc({ ...data, id: uid() }, true);
      showView('editor');
      toast('Document importé. Pensez à l\'enregistrer.');
      return;
    }
    if (!Array.isArray(data.docs) && !Array.isArray(data.clients) && !Array.isArray(data.catalog)) { toast('Fichier invalide.'); return; }

    const merge = (current, incoming) => {
      const map = new Map(current.map((x) => [x.id, x]));
      let added = 0;
      for (const x of incoming || []) {
        if (!x || typeof x !== 'object' || !x.id) continue;
        if (!map.has(x.id)) added++;
        map.set(x.id, x);
      }
      return [[...map.values()], added];
    };
    const [docs, nd] = merge(getDocs(), data.docs);
    const [clients, nc] = merge(getClients(), data.clients);
    const [catalog, ni] = merge(getCatalog(), data.catalog);
    const ok = setDocs(docs) && setClients(clients) && setCatalog(catalog);
    if (data.issuer && !getIssuer().name) store.set(KEYS.issuer, { ...getIssuer(), ...data.issuer });
    if (!ok) { toast('Stockage plein : import incomplet.'); return; }
    renderDashboard();
    toast(`Import terminé : ${nd} document(s), ${nc} client(s), ${ni} prestation(s) ajoutés.`);
  });

  // ======================================================================
  // Carnet clients
  // ======================================================================
  const clientForm = $('#client-form');

  function clientStats() {
    const stats = new Map();
    for (const d of getDocs().map(normalize)) {
      const key = d.client.id || d.client.name.trim().toLowerCase();
      if (!key) continue;
      const s = stats.get(key) || { count: 0, billed: {} };
      s.count++;
      if (d.type === 'facture' && !['brouillon', 'annulee'].includes(d.status)) {
        s.billed[d.currency] = (s.billed[d.currency] || 0) + computeTotals(d).ttc;
      }
      stats.set(key, s);
    }
    return stats;
  }

  function renderClients() {
    const q = $('#client-search').value.trim().toLowerCase();
    const stats = clientStats();
    const list = getClients()
      .filter((c) => !q || [c.name, c.email, c.phone].some((v) => (v || '').toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    if (!list.length) {
      $('#client-list').innerHTML = `<p class="empty-state">${getClients().length ? 'Aucun résultat.' : 'Aucun client enregistré. Ajoutez-en un avec le formulaire, ou depuis l\'éditeur.'}</p>`;
      return;
    }
    $('#client-list').innerHTML = list.map((c) => {
      const s = stats.get(c.id) || stats.get(c.name.trim().toLowerCase()) || { count: 0, billed: {} };
      const billed = Object.entries(s.billed).map(([cur, v]) => money(round2(v), cur)).join(' + ');
      const meta = [c.email, c.phone, `${s.count} document${s.count > 1 ? 's' : ''}`, billed && `${billed} facturé`].filter(Boolean).map(escapeHtml).join(' · ');
      return `
        <div class="list-item" data-id="${escapeHtml(c.id)}">
          <div class="li-main">
            <div class="li-title">${escapeHtml(c.name)}</div>
            <div class="li-meta">${meta}</div>
          </div>
          <div class="li-actions">
            <button type="button" class="btn small" data-act="quote">Nouveau devis</button>
            <button type="button" class="btn ghost small" data-act="edit">Modifier</button>
            <button type="button" class="icon-btn remove" data-act="del" title="Supprimer" aria-label="Supprimer ${escapeHtml(c.name)}">${ICONS.trash}</button>
          </div>
        </div>`;
    }).join('');
  }

  clientForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(clientForm));
    if (!f.name.trim()) return;
    const clients = getClients();
    const record = { ...blankClient(), ...f, name: f.name.trim(), id: f.id || uid() };
    const i = clients.findIndex((c) => c.id === record.id);
    if (i >= 0) clients[i] = record; else clients.push(record);
    setClients(clients);
    if (state.client.id === record.id) { state.client = { ...record }; persistDraft(); renderForm(); renderPreview(); }
    clientForm.reset();
    toast(i >= 0 ? 'Client modifié.' : 'Client ajouté.');
    renderClients();
  });
  clientForm.addEventListener('reset', () => {
    setTimeout(() => { clientForm.elements.id.value = ''; $('#client-form-title').textContent = 'Nouveau client'; });
  });
  $('#client-search').addEventListener('input', renderClients);

  $('#client-list').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = btn.closest('.list-item').dataset.id;
    const clients = getClients();
    const c = clients.find((x) => x.id === id);
    if (!c) return;
    if (btn.dataset.act === 'edit') {
      for (const [k, v] of Object.entries({ ...blankClient(), ...c })) if (clientForm.elements[k]) clientForm.elements[k].value = v;
      $('#client-form-title').textContent = 'Modifier le client';
      clientForm.elements.name.focus();
      clientForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (btn.dataset.act === 'del') {
      if (!confirm(`Supprimer ${c.name} du carnet ? (Ses documents sont conservés.)`)) return;
      setClients(clients.filter((x) => x.id !== id));
      renderClients();
    } else if (btn.dataset.act === 'quote') {
      startNew('devis', c);
    }
  });

  // ======================================================================
  // Catalogue de prestations
  // ======================================================================
  const itemForm = $('#item-form');

  function renderCatalog() {
    const q = $('#item-search').value.trim().toLowerCase();
    const cur = getIssuer().currency || 'EUR';
    const list = getCatalog()
      .filter((it) => !q || it.desc.toLowerCase().includes(q))
      .sort((a, b) => a.desc.localeCompare(b.desc, 'fr'));
    if (!list.length) {
      $('#item-list').innerHTML = `<p class="empty-state">${getCatalog().length ? 'Aucun résultat.' : 'Aucune prestation. Ajoutez vos services habituels pour les retrouver en un clic.'}</p>`;
      return;
    }
    $('#item-list').innerHTML = list.map((it) => `
      <div class="list-item" data-id="${escapeHtml(it.id)}">
        <div class="li-main">
          <div class="li-title">${escapeHtml(it.desc)}</div>
          <div class="li-meta">${money(num(it.price), cur)} HT${it.unit ? ` / ${escapeHtml(it.unit)}` : ''} · TVA ${num(it.vat).toLocaleString('fr-FR')} %</div>
        </div>
        <div class="li-actions">
          <button type="button" class="btn ghost small" data-act="edit">Modifier</button>
          <button type="button" class="icon-btn remove" data-act="del" title="Supprimer" aria-label="Supprimer">${ICONS.trash}</button>
        </div>
      </div>`).join('');
  }

  itemForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(itemForm));
    if (!f.desc.trim()) return;
    const items = getCatalog();
    const record = { id: f.id || uid(), desc: f.desc.trim(), unit: f.unit.trim(), price: num(f.price), vat: num(f.vat) };
    const i = items.findIndex((it) => it.id === record.id);
    if (i >= 0) items[i] = record; else items.push(record);
    setCatalog(items);
    itemForm.reset();
    toast(i >= 0 ? 'Prestation modifiée.' : 'Prestation ajoutée.');
    renderCatalog();
  });
  itemForm.addEventListener('reset', () => {
    setTimeout(() => { itemForm.elements.id.value = ''; $('#item-form-title').textContent = 'Nouvelle prestation'; });
  });
  $('#item-search').addEventListener('input', renderCatalog);

  $('#item-list').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = btn.closest('.list-item').dataset.id;
    const items = getCatalog();
    const it = items.find((x) => x.id === id);
    if (!it) return;
    if (btn.dataset.act === 'edit') {
      for (const k of ['id', 'desc', 'unit', 'price', 'vat']) itemForm.elements[k].value = it[k] ?? '';
      $('#item-form-title').textContent = 'Modifier la prestation';
      itemForm.elements.desc.focus();
      itemForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (btn.dataset.act === 'del') {
      if (!confirm('Supprimer cette prestation du catalogue ?')) return;
      setCatalog(items.filter((x) => x.id !== id));
      renderCatalog();
    }
  });

  // ======================================================================
  // Démarrage
  // ======================================================================
  // Le brouillon est conservé : on le sauvegarde simplement en quittant la page.
  window.addEventListener('beforeunload', () => store.set(KEYS.draft, forStorage(state)));

  // Au rechargement, le brouillon diffère-t-il de la version enregistrée ?
  const stable = (v) => (Array.isArray(v) ? `[${v.map(stable).join(',')}]`
    : v && typeof v === 'object' ? `{${Object.keys(v).filter((k) => v[k] !== undefined && v[k] !== null && v[k] !== '').sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`
      : JSON.stringify(v ?? ''));
  const saved = getDocs().find((d) => d.id === state.id);
  if (saved) {
    const { updatedAt, createdAt, ...rest } = saved;
    dirty = stable(forStorage(normalize(rest))) !== stable(forStorage(state));
  } else {
    dirty = !!state.client.name || state.lines.some((l) => !isBlankLine(l));
  }

  renderForm();
  renderPreview();
  if (!state.issuer.name) $('#style-details').open = true;
  showView(store.get(KEYS.view, 'editor'));
})();

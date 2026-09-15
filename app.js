/* Simulateur retraites 2027 : tout tourne dans le navigateur. */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const fmt = (n, d = 1) => n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const eur = (n, d = 0) => (n < 0 ? '−' : n > 0 ? '+' : '') + fmt(Math.abs(n), d) + ' €';
  const pct = (n) => fmt(n, 1).replace(/,0$/, '') + ' %';

  const state = { revalo: P.inflation, seuil: 0, abatt: P.abatt.plafond, csg: P.csg.tauxPlein };

  /* ---------- Macro : économies pour l'État ---------- */
  function macro(s) {
    const revalo = (P.inflation - s.revalo) * P.mdParPoint * P.partMasseAuDessus[s.seuil];
    const abatt = P.abatt.gains[s.abatt] ?? 0;
    const csg = (s.csg - P.csg.tauxPlein) * P.csg.mdParPoint;
    return { revalo, abatt, csg, total: revalo + abatt + csg };
  }

  /* ---------- Micro : revenu net d'un foyer ---------- */
  function impot(revenu, parts) {
    const q = Math.max(0, revenu) / parts;
    let ir = 0, prev = 0;
    for (const [lim, t] of P.ir.tranches) { if (q > prev) ir += (Math.min(q, lim) - prev) * t; prev = lim; }
    ir *= parts;
    const d = parts >= 2 ? P.ir.decote.couple : P.ir.decote.seul;
    if (ir < d[1]) ir = Math.max(0, ir - Math.max(0, d[0] - P.ir.decote.taux * ir));
    return Math.max(0, ir);
  }

  function tauxCsgPourRfr(rfr, parts) {
    const s = P.csg.seuils[parts];
    return rfr <= s[0] ? 0 : rfr <= s[1] ? 3.8 : rfr <= s[2] ? 6.6 : 8.3;
  }

  // Revenu net annuel du foyer (après prélèvements sociaux et impôt) selon un scénario.
  // Référence : pensions revalorisées de l'inflation, abattement maintenu, CSG 8,3 %.
  function netFoyer(persona, s, tauxCsg) {
    const c = P.csg;
    const tauxCsgEff = tauxCsg === c.tauxPlein ? s.csg : tauxCsg;
    const deductible = tauxCsg === c.tauxPlein ? c.deductible[c.tauxPlein] + (s.csg - c.tauxPlein) : c.deductible[tauxCsg];
    let brutTotal = 0, netSocial = 0, imposable = 0, abattement = 0;
    for (const m of persona.membres) {
      const protege = s.seuil > 0 && m.brut < s.seuil;
      const r = protege ? P.inflation : s.revalo;
      // m.base et m.compl sont les montants 2027 si les pensions suivent l'inflation
      const base = m.base * 12 * (1 + r / 100) / (1 + P.inflation / 100);
      const compl = m.compl * 12;
      const brut = base + compl;
      // exonéré de CSG = exonéré de CRDS et de CASA ; taux réduit 3,8 % = exonéré de CASA
      const crds = tauxCsg === 0 ? 0 : c.crds;
      const casa = tauxCsg === 0 || tauxCsg === 3.8 ? 0 : c.casa;
      const maladie = tauxCsg >= 6.6 ? c.maladieComplementaire : 0; // 1 % sur les complémentaires, taux médian et plein seulement
      const prel = brut * (tauxCsgEff + crds + casa) / 100 + compl * maladie / 100;
      brutTotal += brut; netSocial += brut - prel;
      const imp = brut * (1 - deductible / 100);
      imposable += imp;
      abattement += Math.max(P.abatt.minimum, imp * P.abatt.taux);
    }
    abattement = Math.min(abattement, s.abatt, imposable);  // s.abatt = plafond par foyer retenu (0 = suppression)
    const revenuNetGlobal = imposable - abattement;
    // Abattement « personnes âgées » (art. 157 bis CGI) : tous les personnages ont plus de 65 ans
    const a65 = P.ir.abattement65;
    const nb = persona.membres.length;
    const abatt65 = revenuNetGlobal <= a65.seuil1 ? a65.montant1 * nb : revenuNetGlobal <= a65.seuil2 ? a65.montant2 * nb : 0;
    const revenuNetImposable = Math.max(0, revenuNetGlobal - abatt65);
    let ir = impot(revenuNetImposable, persona.parts);
    const irAvantReduction = ir;
    if (persona.ehpad) ir = Math.max(0, ir - P.ehpad.reductionTaux * Math.min(persona.ehpad * 12, P.ehpad.reductionPlafond));
    return { net: netSocial - ir, ir, irAvantReduction, rfr: revenuNetImposable, brut: brutTotal, netSocial };
  }

  const BASE = { revalo: P.inflation, seuil: 0, abatt: P.abatt.plafond, csg: P.csg.tauxPlein };

  function tauxCsgPersona(persona) {
    // Le taux de CSG dépend du RFR (d'il y a deux ans) : on itère jusqu'à cohérence.
    let t = P.csg.tauxPlein;
    for (let i = 0; i < 3; i++) t = tauxCsgPourRfr(netFoyer(persona, BASE, t).rfr, persona.parts);
    return t;
  }

  function micro(persona, s) {
    const t = tauxCsgPersona(persona);
    const ref = netFoyer(persona, BASE, t);
    const delta = (sc) => (netFoyer(persona, sc, t).net - ref.net) / 12;
    return {
      tauxCsg: t, ref,
      revalo: delta({ ...BASE, revalo: s.revalo, seuil: s.seuil }),
      abatt: delta({ ...BASE, abatt: s.abatt }),
      csg: delta({ ...BASE, csg: s.csg }),
      total: delta(s),
    };
  }

  /* ---------- Le ministre ---------- */
  const MOODS = [
    { max: 2, cls: 'm0', text: "Le ministre fait grise mine : on est très loin des 6 milliards." },
    { max: 4, cls: 'm1', text: "Le ministre s'inquiète : il manque encore beaucoup." },
    { max: 6, cls: 'm2', text: "Le ministre attend la suite : plus de la moitié du chemin est fait." },
    { max: 8, cls: 'm3', text: "Le ministre est satisfait : l'objectif de 6 milliards est atteint." },
    { max: 12, cls: 'm4', text: "Le ministre est ravi : vous faites mieux que demandé." },
    { max: Infinity, cls: 'm5', text: "Le ministre est aux anges : la hausse des dépenses est entièrement absorbée." },
  ];
  const mood = (total) => MOODS.find((m) => total < m.max);
  const GAUGE_MAX = 15; // borne haute de la jauge : un peu au-dessus du maximum atteignable

  const MOUTHS = {
    m0: 'M42 63 Q50 56 58 63', m1: 'M43 62 Q50 59 57 62', m2: 'M43 61.5 L57 61.5',
    m3: 'M43 60 Q50 65 57 60', m4: 'M41.5 59 Q50 68 58.5 59', m5: 'M41 58.5 Q50 70 59 58.5 Z',
  };
  // sourcils : [x1, y1, x2, y2] gauche puis droit
  const BROWS = {
    m0: [[36, 37.5, 44, 35], [56, 35, 64, 37.5]], m1: [[36, 36.5, 44, 35.5], [56, 35.5, 64, 36.5]], m2: [[36, 36, 44, 36], [56, 36, 64, 36]],
    m3: [[36, 35.5, 44, 35], [56, 35, 64, 35.5]], m4: [[36, 34.5, 44, 34], [56, 34, 64, 34.5]], m5: [[36, 33.5, 44, 32.5], [56, 32.5, 64, 33.5]],
  };

  function ministerSvg(cls) {
    const [b1, b2] = BROWS[cls];
    const hair = '#7d4a2e', hairHi = '#8f5a39', beard = '#c1602c', beardHi = '#d07a45', skin = '#f4d3b5', frame = '#4a3120', lips = '#9a4d3a';
    const extra = cls === 'm0' ? '<path d="M35 51 q-3.5 6 0 7 q3.5 -1 0 -7" fill="#7cb3ff"/><path d="M65 51 q3.5 6 0 7 q-3.5 -1 0 -7" fill="#7cb3ff"/>'
      : cls === 'm1' ? '<path d="M72 28 q-3.5 6 0 7.5 q3.5 -1.5 0 -7.5" fill="#7cb3ff"/>'
      : cls === 'm4' || cls === 'm5' ? '<ellipse cx="36" cy="53" rx="3.5" ry="2.2" fill="#f2a1a1" opacity=".55"/><ellipse cx="64" cy="53" rx="3.5" ry="2.2" fill="#f2a1a1" opacity=".55"/>' : '';
    const stars = cls === 'm5' ? '<path d="M13 20 l1.8 4.5 4.5 1.8 -4.5 1.8 -1.8 4.5 -1.8 -4.5 -4.5 -1.8 4.5 -1.8z M86 12 l1.8 4.5 4.5 1.8 -4.5 1.8 -1.8 4.5 -1.8 -4.5 -4.5 -1.8 4.5 -1.8z" fill="#f5c542"/>' : '';
    return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <!-- costume : veste, chemise en V, revers, cravate -->
      <path d="M6 100 V88 q0 -13 14 -18 l16 -6 h28 l16 6 q14 5 14 18 V100 Z" fill="#22304f"/>
      <path d="M37 64 L50 90 L63 64 Z" fill="#f8f8f8"/>
      <path d="M37 64 L50 88 L46 100 L27 100 L33 78 Z" fill="#2b3c62"/>
      <path d="M63 64 L50 88 L54 100 L73 100 L67 78 Z" fill="#2b3c62"/>
      <path d="M37 64 L50 88 L46 100 M63 64 L50 88 L54 100" fill="none" stroke="#1b2741" stroke-width=".8"/>
      <path d="M43.5 62 L50 71 L47.5 63 Z M56.5 62 L50 71 L52.5 63 Z" fill="#fff"/>
      <path d="M47 66.5 h6 l1 4.5 h-8 z" fill="#8a2f3f"/>
      <path d="M46.6 71 h6.8 l2 15 -5.4 5 -5.4 -5 z" fill="#8a2f3f"/>
      <path d="M48 72 l3.6 16" stroke="#a54455" stroke-width=".9" opacity=".7"/>
      <!-- cou, oreilles, visage -->
      <rect x="43" y="58" width="14" height="12" fill="#e8bf9d"/>
      <ellipse cx="29.5" cy="45" rx="3.2" ry="4.5" fill="#edc49f"/><ellipse cx="70.5" cy="45" rx="3.2" ry="4.5" fill="#edc49f"/>
      <ellipse cx="50" cy="43" rx="20" ry="23" fill="${skin}"/>
      <!-- barbe courte, plus rousse que les cheveux -->
      <path d="M30.5 46 q1 20 19.5 21 q18.5 -1 19.5 -21 q-3 10 -9 12 q-4 2 -10.5 2 q-6.5 0 -10.5 -2 q-6 -2 -9 -12z" fill="${beard}"/>
      <path d="M37 55 q6 6 13 6 q7 0 13 -6 q-4 9 -13 9.5 q-9 -0.5 -13 -9.5z" fill="${beardHi}" opacity=".55"/>
      <!-- cheveux courts châtain-roux, raie sur le côté -->
      <path d="M30 40 q-1 -22 20 -22 q21 0 20 22 q-2 -9 -9 -11 q-7 -2 -14 0 q-8 1 -11 -1 q-4 2 -6 12z" fill="${hair}"/>
      <path d="M41 21 q10 -4 22 1 q-9 -2 -18 1z" fill="${hairHi}"/>
      <path d="M30 38 q-1.5 6 1 11 q-0.5 -6 1 -11z M70 38 q1.5 6 -1 11 q0.5 -6 -1 -11z" fill="${hair}"/>
      <!-- sourcils, yeux, nez -->
      <path d="M${b1[0]} ${b1[1]} Q${(b1[0] + b1[2]) / 2} ${Math.min(b1[1], b1[3]) - 1} ${b1[2]} ${b1[3]}" fill="none" stroke="${hair}" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M${b2[0]} ${b2[1]} Q${(b2[0] + b2[2]) / 2} ${Math.min(b2[1], b2[3]) - 1} ${b2[2]} ${b2[3]}" fill="none" stroke="${hair}" stroke-width="2.2" stroke-linecap="round"/>
      <ellipse cx="41" cy="44.5" rx="1.9" ry="2.1" fill="#2b2b2b"/><ellipse cx="59" cy="44.5" rx="1.9" ry="2.1" fill="#2b2b2b"/>
      <circle cx="41.7" cy="43.8" r=".6" fill="#fff"/><circle cx="59.7" cy="43.8" r=".6" fill="#fff"/>
      <path d="M49 46 q-2 5 1 6.5" fill="none" stroke="#d9a883" stroke-width="1.3" stroke-linecap="round"/>
      <!-- lunettes rondes, monture fine -->
      <circle cx="41" cy="44.5" r="6.3" fill="none" stroke="${frame}" stroke-width="1.3"/>
      <circle cx="59" cy="44.5" r="6.3" fill="none" stroke="${frame}" stroke-width="1.3"/>
      <path d="M47.3 44 q2.7 -1.6 5.4 0" fill="none" stroke="${frame}" stroke-width="1.3"/>
      <path d="M34.7 44 L31 43.3 M65.3 44 L69 43.3" stroke="${frame}" stroke-width="1.2" stroke-linecap="round"/>
      <!-- bouche -->
      <path d="${MOUTHS[cls]}" fill="${cls === 'm5' ? '#6e2a2a' : 'none'}" stroke="${lips}" stroke-width="2" stroke-linecap="round"/>
      ${extra}${stars}
    </svg>`;
  }

  /* ---------- Rendu ---------- */
  function render() {
    const m = macro(state);
    $('#total').textContent = fmt(m.total);
    const fill = $('#gauge-fill');
    fill.style.width = Math.min(100, (m.total / GAUGE_MAX) * 100) + '%';
    fill.className = 'gauge-fill' + (m.total >= 12 ? ' over' : m.total >= P.objectif ? ' ok' : '');
    $('#gauge').setAttribute('aria-valuenow', m.total.toFixed(1));
    const md = mood(m.total);
    $('#minister').innerHTML = ministerSvg(md.cls);
    $('#mood-text').textContent = md.text;

    $('#revalo-out').textContent = pct(state.revalo) + (state.revalo === 0 ? ' (gel)' : state.revalo === P.inflation ? ' (inflation)' : '');
    $('#csg-out').textContent = pct(state.csg);
    for (const k of ['revalo', 'abatt', 'csg']) {
      const el = $('#gain-' + k);
      el.textContent = (m[k] > 0 ? '+' : '') + fmt(m[k]) + ' Md€';
      el.classList.toggle('active', m[k] > 0.05);
    }
    $('#who-revalo').textContent = state.revalo >= P.inflation ? 'Personne n\'est touché : les pensions suivent les prix.'
      : `Touche ${state.seuil ? 'les retraités dont la pension dépasse ' + fmt(state.seuil, 0) + ' € par mois' : 'tous les retraités des régimes de base'}, proportionnellement à leur pension de base (les complémentaires comme l'Agirc-Arrco ne dépendent pas de l'État). Ce n'est pas une baisse en euros, mais une perte de pouvoir d'achat de ${pct(P.inflation - state.revalo)}, qui se répète ensuite chaque année.`;
    $('#abatt-out').textContent = state.abatt === 0 ? 'Supprimé' : state.abatt >= P.abatt.plafond ? `${fmt(P.abatt.plafond, 0)} € (actuel)` : `Plafond ${fmt(state.abatt, 0)} €`;
    $('#who-abatt').textContent = state.abatt >= P.abatt.plafond ? 'Personne n\'est touché.'
      : state.abatt === 0 ? 'Touche uniquement les retraités imposables, d\'autant plus que leur pension et leur taux d\'imposition sont élevés. Les non-imposables ne paient rien de plus.'
      : `Touche les retraités imposables dont le foyer perçoit plus de ${fmt(state.abatt / P.abatt.taux / 12, 0)} € de pension par mois, d'autant plus qu'ils sont au-dessus. Les autres ne changent rien.`;
    $('#who-csg').textContent = state.csg <= P.csg.tauxPlein ? 'Personne n\'est touché.'
      : `Touche seulement les retraités au taux plein de CSG, soit ${P.csg.repartition[8.3]} % d'entre eux, ceux dont les revenus sont les plus élevés. La hausse est supposée déductible de l'impôt sur le revenu, comme en 2018, ce qui en atténue un peu le coût pour les imposables.`;

    renderReste(m);
    renderPersonas();
    renderShare();
  }

  function renderReste(m) {
    const manque = P.objectif - m.total;
    const el = $('#reste');
    el.classList.toggle('ok', manque <= 0);
    const perHab = Math.abs(manque) * 1e9 / P.population;
    if (manque > 0.05) {
      el.innerHTML = `<h3>Il manque <span class="big">${fmt(manque)} Md€</span></h3>
        <p>Sans autre mesure, cette somme s'ajoute au déficit de la Sécurité sociale, déjà d'environ ${P.deficitSecu2026} Md€ en 2026. C'est de la dette, soit environ <strong>${fmt(perHab, 0)} € par habitant</strong>, que tout le monde rembourse plus tard, actifs comme retraités.</p>
        <p class="note">Rappel : même avec 6 Md€ d'économies, les dépenses de retraite augmentent encore de 6 Md€ en 2027, parce qu'il y a plus de retraités.</p>`;
    } else {
      el.innerHTML = `<h3>Objectif atteint${-manque > 0.05 ? `, avec <span class="big">${fmt(-manque)} Md€</span> d'avance` : ''}</h3>
        <p>${-manque > 0.05 ? `Ces ${fmt(-manque)} Md€ supplémentaires réduisent d'autant le déficit de la Sécurité sociale, soit environ ${fmt(perHab, 0)} € par habitant.` : 'Les 6 Md€ demandés sont trouvés. Les dépenses de retraite augmentent tout de même de 6 Md€ en 2027, parce qu\'il y a plus de retraités.'}</p>`;
    }
  }

  function renderPersonas() {
    const wrap = $('#persona-cards');
    wrap.innerHTML = P.personas.map((p) => {
      const r = micro(p, state);
      const brut = p.membres.reduce((a, m) => a + m.brut, 0);
      const netMois = r.ref.net / 12;
      const facts = `Pension brute : ${fmt(brut, 0)} €/mois${p.membres.length > 1 ? ' à deux' : ''} · net après impôt : ${fmt(netMois, 0)} €/mois · CSG à ${pct(r.tauxCsg)} · ${r.ref.ir > 0 ? 'imposable' : r.ref.irAvantReduction > 0 ? 'impôt effacé par la réduction EHPAD' : 'non imposable'}${p.ehpad ? ` · EHPAD : ${fmt(p.ehpad, 0)} €/mois, soit ${fmt(p.ehpad - netMois, 0)} € de plus que sa pension nette` : ''}`;
      const amt = (v) => `<span class="amt ${v < -0.5 ? 'neg' : 'zero'}">${Math.abs(v) < 0.5 ? '0 €' : eur(v)}</span>`;
      const whyRevalo = state.revalo >= P.inflation ? '' : Math.abs(r.revalo) < 0.5 ? 'protégé par le seuil' : `${pct(P.inflation - state.revalo)} de pouvoir d'achat en moins sur la pension de base`;
      const whyAbatt = state.abatt >= P.abatt.plafond ? '' : Math.abs(r.abatt) < 0.5 ? (r.ref.ir > 0 ? 'impôt inchangé' : r.ref.irAvantReduction > 0 ? 'la réduction d\'impôt EHPAD absorbe la hausse' : 'non imposable, donc aucun effet') : 'impôt sur le revenu plus élevé';
      const whyCsg = state.csg <= P.csg.tauxPlein ? '' : Math.abs(r.csg) < 0.5 ? `au taux de ${pct(r.tauxCsg)}, pas au taux plein` : 'CSG plus élevée, en partie déductible';
      const why = (t) => (t ? `<span class="why">${t}</span>` : '');
      return `<div class="card persona">
        <div class="avatar">${p.emoji}</div>
        <div>
          <h3>${p.nom}, ${p.age}</h3>
          <p class="story">${p.story}</p>
          <p class="facts">${facts}</p>
          <ul class="impacts">
            <li><span>Revalorisation${why(whyRevalo)}</span>${amt(r.revalo)}</li>
            <li><span>Abattement de 10 %${why(whyAbatt)}</span>${amt(r.abatt)}</li>
            <li><span>CSG${why(whyCsg)}</span>${amt(r.csg)}</li>
            <li class="total"><span>Par mois, au total</span>${amt(r.total)}</li>
          </ul>
        </div>
      </div>`;
    }).join('');
  }

  function renderShare() {
    const h = `#r=${state.revalo}&s=${state.seuil}&a=${state.abatt}&c=${state.csg}`;
    const url = location.origin + location.pathname + h;
    $('#share-url').value = url;
    if (location.hash !== h) history.replaceState(null, '', h);
  }

  function readHash() {
    const q = new URLSearchParams(location.hash.slice(1));
    const r = parseFloat(q.get('r')); if (!isNaN(r)) state.revalo = Math.min(P.inflation, Math.max(0, r));
    const s = parseInt(q.get('s'), 10); if ([0, 1400, 2000].includes(s)) state.seuil = s;
    const a = q.get('a'); const legacy = { keep: P.abatt.plafond, remove: 0, forfait: 2000 };
    if (a in legacy) state.abatt = legacy[a]; else if (P.abatt.plafonds.includes(parseInt(a, 10))) state.abatt = parseInt(a, 10);
    const c = parseFloat(q.get('c')); if (!isNaN(c)) state.csg = Math.min(P.csg.tauxSalaries, Math.max(P.csg.tauxPlein, c));
  }

  function syncControls() {
    $('#revalo').value = state.revalo;
    $('#csg').value = state.csg;
    for (const b of document.querySelectorAll('#seuil button')) b.classList.toggle('on', +b.dataset.v === state.seuil);
    $('#abatt').value = P.abatt.plafonds.indexOf(state.abatt);
  }

  /* ---------- Méthode ---------- */
  function renderMethod() {
    const src = (id) => { const s = P.sources.find((x) => x.id === id); return s ? `<a href="${s.url}" target="_blank" rel="noopener">${s.titre}</a>` : ''; };
    const f = (x) => `fourchette ${fmt(x[0])} à ${fmt(x[1])}`;
    const rows = [
      ['Objectif d\'économies 2027', `${P.objectif} Md€`, src('amiel')],
      ['Hausse spontanée des dépenses des régimes de base', `${P.hausseSpontanee} Md€ (fourchette 10,5 à 12)`, src('martinot') + ' ; ' + src('ccss')],
      ['Revalorisation légale prévue au 1er janvier 2027', `${pct(P.inflation)} (${f(P.inflationFourchette).replace('fourchette', 'fourchette').replace(/(\d),(\d)/g, '$1,$2')} %)`, src('amiel') + ' ; ' + src('ccss')],
      ['Économie par point de revalorisation en moins', `${fmt(P.mdParPoint)} Md€ (${f(P.mdParPointFourchette)})`, src('amiel') + ' ; ' + src('rexecode') + ' ; ' + src('plfss2026')],
      ['Part de l\'économie conservée si l\'on protège les pensions sous 1 400 € / 2 000 €', `${Math.round(P.partMasseAuDessus[1400] * 100)} % / ${Math.round(P.partMasseAuDessus[2000] * 100)} % [estimation]`, src('rexecode') + ' ; ' + src('plfss2026')],
      ['Coût actuel de l\'abattement de 10 %', `${fmt(P.abatt.cout)} Md€ en 2025, ${fmt(P.abatt.beneficiaires)} millions de ménages`, src('voies')],
      ['Suppression de l\'abattement de 10 %', `${fmt(P.abatt.gains[0])} Md€ (${f(P.abatt.gainSuppressionFourchette)})`, src('ofce') + ' ; ' + src('afp')],
      ['Abaissement du plafond à 3 000 / 2 000 / 1 000 € par foyer', `${[3000, 2000, 1000].map((v) => fmt(P.abatt.gains[v])).join(' / ')} Md€ [estimation]`, src('drees2025') + ' ; ' + src('plf2026')],
      ['Rendement d\'un point de CSG au taux plein', `${fmt(P.csg.mdParPoint)} Md€ (${f(P.csg.mdParPointFourchette)}) [estimation]`, src('senat2017') + ' ; ' + src('afp')],
      ['Répartition des retraités par taux de CSG (0 / 3,8 / 6,6 / 8,3 %)', Object.values(P.csg.repartition).map((v) => v + ' %').join(' / '), src('cfdt')],
      ['Plafond / minimum de l\'abattement (revenus 2026, estimés)', `${fmt(P.abatt.plafond, 0)} € par foyer / ${P.abatt.minimum} € par personne`, src('abatt')],
      ['Seuils de RFR pour la CSG, 1 part (2027, estimés)', P.csg.seuils[1].map((v) => fmt(v, 0) + ' €').join(' / '), src('dss')],
      ['Seuils de RFR pour la CSG, 2 parts (2027, estimés)', P.csg.seuils[2].map((v) => fmt(v, 0) + ' €').join(' / '), src('dss')],
      ['CSG déductible selon le taux', '5,9 points au taux plein, 4,2 au taux 6,6 %, 3,8 au taux réduit', src('cfdt')],
      ['Barème de l\'impôt sur les revenus 2026 (estimé, indexé de 2 %)', P.ir.tranches.slice(0, -1).map(([l, t]) => `${Math.round(t * 100)} % jusqu'à ${fmt(l, 0)} €`).join(', ') + ', 45 % au-delà', src('cgi197') + ' ; ' + src('bareme2027')],
      ['Décote', `${fmt(P.ir.decote.seul[0], 0)} € (personne seule) ou ${fmt(P.ir.decote.couple[0], 0)} € (couple), moins 45,25 % de l'impôt brut`, src('cgi197')],
      ['Abattement des plus de 65 ans (art. 157 bis)', `${fmt(P.ir.abattement65.montant1, 0)} € si le revenu net est inférieur à ${fmt(P.ir.abattement65.seuil1, 0)} €, ${fmt(P.ir.abattement65.montant2, 0)} € jusqu'à ${fmt(P.ir.abattement65.seuil2, 0)} €, doublé pour un couple`, src('boi157')],
      ['Réduction d\'impôt EHPAD', `${Math.round(P.ehpad.reductionTaux * 100)} % des dépenses, plafonnées à ${fmt(P.ehpad.reductionPlafond, 0)} €`, ''],
      ['Prix moyen d\'un EHPAD en 2024', `${fmt(P.ehpad.prixMoyenASH, 0)} € par mois (place habilitée à l'aide sociale) à ${fmt(P.ehpad.prixMoyenNonASH, 0)} € (autres)`, src('ehpad')],
      ['Déficit de la Sécurité sociale prévu pour 2026', `${fmt(P.deficitSecu2026)} Md€, dont ${fmt(P.deficitVieillesse2026)} Md€ pour la branche vieillesse`, src('ccss')],
      ['Population française', `${fmt(P.population / 1e6)} millions`, src('insee')],
    ];
    $('#method-content').innerHTML = `
      <details><summary>Les paramètres</summary><ul class="params">
      ${rows.map((r) => `<li><span class="pn">${r[0]}</span><span class="pv">${r[1]}</span>${r[2] ? `<span class="ps">Source : ${r[2]}</span>` : ''}</li>`).join('')}</ul></details>
      <details><summary>Comment sont calculées les économies</summary>
        <ul>
          <li><strong>Revalorisation :</strong> (inflation − revalorisation retenue) × économie par point × part de l'économie conservée avec le seuil choisi. Le coefficient est calé sur le chiffre du gouvernement (6 Md€ pour 2,1 %), qui est aussi à peu près la masse des pensions de base 2027 divisée par 100. Seuls les régimes de base sont concernés : l'Agirc-Arrco est gérée par les partenaires sociaux et suit ses propres règles.</li>
          <li><strong>Abattement :</strong> pour la suppression totale, valeur issue des estimations publiées (dépense fiscale du PLF 2026, OFCE et Cour des comptes, Bercy) ; les sources divergent, la fourchette est indiquée. Pour les plafonds intermédiaires, aucun chiffrage officiel n'existe : le rendement est estimé par une microsimulation simplifiée (distribution des pensions calée sur la DREES, barème 2027, quotient familial, décote, abattement des plus de 65 ans), normalisée pour que la suppression totale rapporte 5,5 Md€. Un plafond à 2 000 € par foyer touche les foyers percevant plus de 20 000 € de pensions par an.</li>
          <li><strong>CSG :</strong> (taux retenu − 8,3) × rendement d'un point, estimé à partir du précédent de 2018 (4,5 Md€ pour 1,7 point) et de l'assiette actuelle. Aucun chiffrage officiel n'existe pour cette piste.</li>
          <li>Les montants sont bruts pour les finances publiques. Un gel réduit aussi l'impôt et la CSG collectés sur les pensions : l'Institut des politiques publiques évalue cet effet retour à environ 20 %. De même, la hausse de CSG étant déductible, elle réduit un peu l'impôt sur le revenu. Ces effets ne sont pas déduits, ce qui est cohérent avec la façon dont le gouvernement présente ses 6 Md€.</li>
        </ul>
      </details>
      <details><summary>Comment sont calculés les effets sur les retraités</summary>
        <ul>
          <li>Pour chaque foyer, on calcule le revenu net annuel après CSG, CRDS, CASA, cotisation maladie de 1 % sur la complémentaire et impôt sur le revenu (abattement de 10 %, abattement des plus de 65 ans, barème, quotient familial, décote, réduction d'impôt EHPAD). L'effet d'un levier est la différence avec la situation de référence : pensions revalorisées de l'inflation, abattement maintenu, CSG à 8,3 %.</li>
          <li>Les pensions affichées sont celles de 2027 si elles suivent l'inflation. Le barème, les seuils et les plafonds sont ceux de 2026 indexés comme annoncé, puisque les textes pour 2027 ne sont pas encore déposés.</li>
          <li>La revalorisation ne s'applique qu'à la pension de base de chacun. Le seuil de protection s'apprécie sur la pension brute totale de la personne.</li>
          <li>Le taux de CSG de chaque personnage découle de son revenu fiscal de référence, comme en réalité. La hausse de CSG est supposée déductible du revenu imposable, comme en 2018. Le mécanisme de lissage sur deux ans n'est pas modélisé.</li>
          <li>Supprimer l'abattement de 10 % augmente aussi le revenu fiscal de référence, dont dépendent le taux de CSG, l'exonération de taxe foncière des plus de 75 ans et diverses aides. Ces effets de seuil, décalés de deux ans, ne sont pas comptés ici : ils peuvent aggraver la perte pour certains foyers.</li>
          <li>Les montants sont en euros de 2027, par mois, arrondis à l'euro. Le total applique les trois leviers ensemble ; il peut différer d'un euro de la somme des lignes à cause des arrondis et des effets de seuil.</li>
        </ul>
      </details>
      <details><summary>Ce que le simulateur ne dit pas</summary>
        <ul>
          <li>Une sous-indexation n'est pas une baisse en euros. C'est une perte de pouvoir d'achat, mais elle est permanente : elle se retrouve chaque année suivante, et se cumule si la mesure est reconduite.</li>
          <li>Les tarifs des EHPAD, les loyers et les prix, eux, continuent d'augmenter. C'est ce qui rend la sous-indexation plus lourde pour ceux dont le budget est déjà tendu.</li>
          <li>Le simulateur ne prend pas parti sur ce qu'il faudrait faire. Il ne modélise pas non plus d'autres options (hausse de cotisations, autres recettes, économies ailleurs) que le débat pourrait retenir.</li>
        </ul>
      </details>
      <details><summary>Sources</summary><ul>${P.sources.map((s) => `<li><a href="${s.url}" target="_blank" rel="noopener">${s.titre}</a></li>`).join('')}</ul></details>`;
  }

  /* ---------- Init ---------- */
  function init() {
    $('#p-inflation').textContent = fmt(P.inflation);
    $('#p-plafond').textContent = fmt(P.abatt.plafond, 0);
    $('#revalo').max = P.inflation;
    $('#gauge').setAttribute('aria-valuemax', GAUGE_MAX);
    $('#gauge .gauge-target').style.left = (P.objectif / GAUGE_MAX * 100) + '%';
    $('#repo-link').href = P.repo;
    readHash(); syncControls(); renderMethod(); render();

    $('#revalo').addEventListener('input', (e) => { state.revalo = parseFloat(e.target.value); render(); });
    $('#csg').addEventListener('input', (e) => { state.csg = parseFloat(e.target.value); render(); });
    $('#seuil').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; state.seuil = +b.dataset.v; syncControls(); render(); });
    $('#abatt').addEventListener('input', (e) => { state.abatt = P.abatt.plafonds[+e.target.value]; render(); });
    $('#copy').addEventListener('click', async () => {
      const btn = $('#copy');
      try { await navigator.clipboard.writeText($('#share-url').value); btn.textContent = 'Copié !'; }
      catch { $('#share-url').select(); btn.textContent = 'Sélectionné'; }
      setTimeout(() => (btn.textContent = 'Copier'), 1500);
    });
    window.addEventListener('hashchange', () => { readHash(); syncControls(); render(); });
  }
  document.addEventListener('DOMContentLoaded', init);
})();

/* Simulateur retraites 2027 : tout tourne dans le navigateur. */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const fmt = (n, d = 1) => n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const eur = (n, d = 0) => (n < 0 ? '−' : n > 0 ? '+' : '') + fmt(Math.abs(n), d) + ' €';
  const pct = (n) => fmt(n, 1).replace(/,0$/, '') + ' %';

  const state = { revalo: P.inflation, seuil: 0, abatt: 'keep', csg: P.csg.tauxPlein };

  /* ---------- Macro : économies pour l'État ---------- */
  function macro(s) {
    const revalo = (P.inflation - s.revalo) * P.mdParPoint * P.partMasseAuDessus[s.seuil];
    const abatt = s.abatt === 'remove' ? P.abatt.gainSuppression : s.abatt === 'forfait' ? P.abatt.gainForfait : 0;
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
      if (s.abatt === 'keep') abattement += Math.max(P.abatt.minimum, imp * P.abatt.taux);
      else if (s.abatt === 'forfait') abattement += P.abatt.forfaitParPersonne ? P.abatt.forfait : 0;
    }
    if (s.abatt === 'keep') abattement = Math.min(abattement, P.abatt.plafond);
    if (s.abatt === 'forfait' && !P.abatt.forfaitParPersonne) abattement = P.abatt.forfait;
    abattement = Math.min(abattement, imposable);
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

  const BASE = { revalo: P.inflation, seuil: 0, abatt: 'keep', csg: P.csg.tauxPlein };

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

  const MOUTHS = {
    m0: 'M38 66 Q50 54 62 66', m1: 'M40 64 Q50 58 60 64', m2: 'M40 63 L60 63',
    m3: 'M40 61 Q50 69 60 61', m4: 'M37 60 Q50 74 63 60', m5: 'M36 59 Q50 78 64 59 Z',
  };
  const BROWS = { m0: [[34, 38, 44, 34], [56, 34, 66, 38]], m1: [[34, 37, 44, 35], [56, 35, 66, 37]], m2: [[34, 36, 44, 36], [56, 36, 66, 36]],
    m3: [[34, 35, 44, 34], [56, 34, 66, 35]], m4: [[34, 33, 44, 33], [56, 33, 66, 33]], m5: [[34, 32, 44, 31], [56, 31, 66, 32]] };

  function ministerSvg(cls) {
    const [b1, b2] = BROWS[cls];
    const extra = cls === 'm0' ? '<path d="M32 50 q-4 7 0 8 q4 -1 0 -8" fill="#7cb3ff"/><path d="M68 50 q4 7 0 8 q-4 -1 0 -8" fill="#7cb3ff"/>'
      : cls === 'm1' ? '<path d="M72 30 q-4 6 0 8 q4 -2 0 -8" fill="#7cb3ff"/>'
      : cls === 'm4' ? '<circle cx="34" cy="56" r="4" fill="#f4a3a3" opacity=".7"/><circle cx="66" cy="56" r="4" fill="#f4a3a3" opacity=".7"/>'
      : cls === 'm5' ? '<circle cx="34" cy="56" r="4" fill="#f4a3a3" opacity=".7"/><circle cx="66" cy="56" r="4" fill="#f4a3a3" opacity=".7"/><path d="M14 22 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z M84 14 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" fill="#f5c542"/>'
      : '';
    return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M12 100 V86 q0 -14 14 -18 l10 -3 h28 l10 3 q14 4 14 18 V100 Z" fill="#26375c"/>
      <path d="M42 66 h16 l-8 20 z" fill="#fff"/>
      <path d="M48 70 h4 l2 8 -4 14 -4 -14 z" fill="#b83a3a"/>
      <circle cx="50" cy="44" r="23" fill="#f2c9a6"/>
      <path d="M27 40 q0 -22 23 -22 q23 0 23 22 q-6 -10 -23 -9 q-17 -1 -23 9z" fill="#4a3526"/>
      <circle cx="41" cy="46" r="2.4" fill="#222"/><circle cx="59" cy="46" r="2.4" fill="#222"/>
      <line x1="${b1[0]}" y1="${b1[1]}" x2="${b1[2]}" y2="${b1[3]}" stroke="#4a3526" stroke-width="2.4" stroke-linecap="round"/>
      <line x1="${b2[0]}" y1="${b2[1]}" x2="${b2[2]}" y2="${b2[3]}" stroke="#4a3526" stroke-width="2.4" stroke-linecap="round"/>
      <path d="${MOUTHS[cls]}" fill="${cls === 'm5' ? '#7a2a2a' : 'none'}" stroke="#7a2a2a" stroke-width="2.4" stroke-linecap="round"/>
      ${extra}
    </svg>`;
  }

  /* ---------- Rendu ---------- */
  function render() {
    const m = macro(state);
    $('#total').textContent = fmt(m.total);
    const fill = $('#gauge-fill');
    fill.style.width = Math.min(100, (m.total / 12) * 100) + '%';
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
      : `Touche ${state.seuil ? 'les retraités dont la pension dépasse ' + fmt(state.seuil, 0) + ' € par mois' : 'tous les retraités des régimes de base'}, proportionnellement à leur pension de base. Ce n'est pas une baisse en euros, mais une perte de pouvoir d'achat de ${pct(P.inflation - state.revalo)}, qui se répète ensuite chaque année.`;
    $('#who-abatt').textContent = state.abatt === 'keep' ? 'Personne n\'est touché.'
      : state.abatt === 'forfait' ? `Touche les retraités imposables dont la pension dépasse ${fmt(P.abatt.forfait / P.abatt.taux, 0)} € par an, d'autant plus qu'elle est élevée. Les non-imposables ne changent rien.`
      : 'Touche uniquement les retraités imposables, d\'autant plus que leur pension et leur taux d\'imposition sont élevés. Les non-imposables ne paient rien de plus.';
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
      const whyAbatt = state.abatt === 'keep' ? '' : Math.abs(r.abatt) < 0.5 ? (r.ref.ir > 0 ? 'impôt inchangé' : r.ref.irAvantReduction > 0 ? 'la réduction d\'impôt EHPAD absorbe la hausse' : 'non imposable, donc aucun effet') : 'impôt sur le revenu plus élevé';
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
    const a = q.get('a'); if (['keep', 'forfait', 'remove'].includes(a)) state.abatt = a;
    const c = parseFloat(q.get('c')); if (!isNaN(c)) state.csg = Math.min(P.csg.tauxSalaries, Math.max(P.csg.tauxPlein, c));
  }

  function syncControls() {
    $('#revalo').value = state.revalo;
    $('#csg').value = state.csg;
    for (const b of document.querySelectorAll('#seuil button')) b.classList.toggle('on', +b.dataset.v === state.seuil);
    for (const b of document.querySelectorAll('#abatt button')) b.classList.toggle('on', b.dataset.v === state.abatt);
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
      ['Suppression de l\'abattement de 10 %', `${fmt(P.abatt.gainSuppression)} Md€ (${f(P.abatt.gainSuppressionFourchette)})`, src('ofce') + ' ; ' + src('afp')],
      ['Remplacement par un forfait de ' + fmt(P.abatt.forfait, 0) + ' € par pensionné', `${fmt(P.abatt.gainForfait)} Md€ (${f(P.abatt.gainForfaitFourchette)})`, src('plf2026')],
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
      <details open><summary>Les paramètres</summary><div class="tbl"><table><thead><tr><th>Paramètre</th><th>Valeur</th><th>Source</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${r[0]}</td><td class="v">${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</tbody></table></div></details>
      <details><summary>Comment sont calculées les économies</summary>
        <ul>
          <li><strong>Revalorisation :</strong> (inflation − revalorisation retenue) × économie par point × part de l'économie conservée avec le seuil choisi. Le coefficient est calé sur le chiffre du gouvernement (6 Md€ pour 2,1 %), qui est aussi à peu près la masse des pensions de base 2027 divisée par 100. Seuls les régimes de base sont concernés : l'Agirc-Arrco est gérée par les partenaires sociaux et suit ses propres règles.</li>
          <li><strong>Abattement :</strong> valeurs directement issues des estimations publiées (dépense fiscale du PLF 2026, OFCE et Cour des comptes, Bercy, article 6 du PLF 2026). Les sources divergent, la fourchette est indiquée.</li>
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
          <li>Le forfait de 2 000 € est appliqué ${P.abatt.forfaitParPersonne ? 'par personne' : 'par foyer'}, comme dans le projet de loi de finances pour 2026.</li>
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
    $('#p-forfait').textContent = fmt(P.abatt.forfait, 0);
    $('#revalo').max = P.inflation;
    $('#repo-link').href = P.repo;
    readHash(); syncControls(); renderMethod(); render();

    $('#revalo').addEventListener('input', (e) => { state.revalo = parseFloat(e.target.value); render(); });
    $('#csg').addEventListener('input', (e) => { state.csg = parseFloat(e.target.value); render(); });
    $('#seuil').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; state.seuil = +b.dataset.v; syncControls(); render(); });
    $('#abatt').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; state.abatt = b.dataset.v; syncControls(); render(); });
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

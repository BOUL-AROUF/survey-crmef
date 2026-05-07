'use strict';
const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Database ──────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'survey.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS responses (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at         TEXT    DEFAULT (datetime('now','localtime')),
    q1_sexe            TEXT,
    q2_experience      TEXT,
    q3_etablissement   TEXT,
    q4_utilisation     TEXT,
    q5_outils          TEXT,
    q6_frequence       TEXT,
    q7_mode            TEXT,
    q8_comprehension   TEXT,
    q9_motivation      TEXT,
    q10_autonomie      TEXT,
    q11_engagement     TEXT,
    q12_numerique      TEXT,
    q13_avantages      TEXT,
    q14_role           TEXT,
    q15_difficultes    TEXT,
    q16_formation      TEXT,
    q17_type_formation TEXT,
    q18_ameliorations  TEXT,
    q19_integration    TEXT,
    q20_recommandation TEXT
  )
`);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── POST /api/submit ──────────────────────────────────────
app.post('/api/submit', (req, res) => {
  try {
    const d = req.body;
    const join = v => Array.isArray(v) ? v.join('|') : (v || null);

    db.prepare(`
      INSERT INTO responses
        (q1_sexe, q2_experience, q3_etablissement, q4_utilisation,
         q5_outils, q6_frequence, q7_mode, q8_comprehension,
         q9_motivation, q10_autonomie, q11_engagement, q12_numerique,
         q13_avantages, q14_role, q15_difficultes, q16_formation,
         q17_type_formation, q18_ameliorations, q19_integration, q20_recommandation)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      d.q1 || null, d.q2 || null, d.q3 || null, d.q4 || null,
      join(d.q5), d.q6 || null, join(d.q7),
      d.q8 || null, d.q9 || null, d.q10 || null, d.q11 || null,
      d.q12 || null, join(d.q13), d.q14 || null, join(d.q15),
      d.q16 || null, join(d.q17), join(d.q18),
      d.q19 || null, d.q20 || null
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/analytics ────────────────────────────────────
app.get('/api/analytics', (_req, res) => {
  try {
    const total = db.prepare('SELECT COUNT(*) AS c FROM responses').get().c;
    const today = db.prepare(
      `SELECT COUNT(*) AS c FROM responses WHERE date(created_at)=date('now','localtime')`
    ).get().c;
    const week = db.prepare(
      `SELECT COUNT(*) AS c FROM responses WHERE created_at >= date('now','-7 days','localtime')`
    ).get().c;

    const dist = col => db.prepare(
      `SELECT ${col} AS v, COUNT(*) AS c FROM responses
       WHERE ${col} IS NOT NULL AND ${col}!=''
       GROUP BY ${col} ORDER BY c DESC`
    ).all().map(r => ({ label: r.v, count: r.c }));

    const multiDist = col => {
      const rows = db.prepare(
        `SELECT ${col} AS v FROM responses WHERE ${col} IS NOT NULL AND ${col}!=''`
      ).all();
      const map = {};
      rows.forEach(r => r.v.split('|').forEach(x => {
        x = x.trim(); if (x) map[x] = (map[x] || 0) + 1;
      }));
      return Object.entries(map)
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count);
    };

    const timeline = db.prepare(`
      SELECT date(created_at) AS date, COUNT(*) AS count
      FROM responses
      WHERE created_at >= date('now','-30 days','localtime')
      GROUP BY date(created_at) ORDER BY date
    `).all();

    res.json({
      total, today, week, timeline,
      q1:  dist('q1_sexe'),
      q2:  dist('q2_experience'),
      q3:  dist('q3_etablissement'),
      q4:  dist('q4_utilisation'),
      q5:  multiDist('q5_outils'),
      q6:  dist('q6_frequence'),
      q7:  multiDist('q7_mode'),
      q8:  dist('q8_comprehension'),
      q9:  dist('q9_motivation'),
      q10: dist('q10_autonomie'),
      q11: dist('q11_engagement'),
      q12: dist('q12_numerique'),
      q13: multiDist('q13_avantages'),
      q14: dist('q14_role'),
      q15: multiDist('q15_difficultes'),
      q16: dist('q16_formation'),
      q17: multiDist('q17_type_formation'),
      q18: multiDist('q18_ameliorations'),
      q19: dist('q19_integration'),
      q20: dist('q20_recommandation'),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/responses ────────────────────────────────────
app.get('/api/responses', (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const limit  = 10;
    const offset = (page - 1) * limit;
    const data   = db.prepare(
      'SELECT * FROM responses ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(limit, offset);
    const total  = db.prepare('SELECT COUNT(*) AS c FROM responses').get().c;
    res.json({ data, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/responses/:id ─────────────────────────────
app.delete('/api/responses/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM responses WHERE id=?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Seed demo data (dev only) ─────────────────────────────
app.post('/api/seed', (_req, res) => {
  const sexes = ['Homme','Femme'];
  const exps  = ['Moins de 5 ans','5–10 ans','Plus de 10 ans'];
  const etabs = ['Public','Privé'];
  const utils = ['Oui','Non','Parfois'];
  const outils = ['Ordinateur','Vidéoprojecteur','Simulations','Vidéos éducatives','Plateformes numériques'];
  const freqs = ['Toujours','Souvent','Parfois','Rarement','Jamais'];
  const modes = ['Présentation du cours','Illustration (vidéos/simulations)','Exercices interactifs','Évaluation','Recherche d\'informations'];
  const impacts = ['Pas du tout','Peu','Moyen','Beaucoup'];
  const engagements = ['Oui','Non','Parfois'];
  const effs = ['Plus efficace','Moins efficace','Équivalent'];
  const avantages = ['Meilleure concentration','Discipline','Moins de distraction'];
  const roles = ['Remplace le traditionnel','Complète le traditionnel','N\'a pas d\'impact'];
  const diffs = ['Manque de matériel','Manque de formation','Problèmes techniques','Manque de temps','Classes surchargées'];
  const formations = ['Oui','Non'];
  const typeFormations = ['Utilisation des outils numériques','Création de contenus numériques','Gestion de classe avec numérique','Évaluation numérique'];
  const ameliorations = ['Plus d\'équipements','Formation des enseignants','Réduction du nombre d\'élèves','Meilleure connexion internet','Support technique'];
  const integrations = ['Très importante','Importante','Moyennement importante','Peu importante','Pas importante'];
  const recommandations = ['Oui fortement','Oui','Neutre','Non','Pas du tout'];

  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const pickMulti = arr => arr.filter(() => Math.random() > 0.5).join('|') || arr[0];

  const stmt = db.prepare(`
    INSERT INTO responses (q1_sexe,q2_experience,q3_etablissement,q4_utilisation,
    q5_outils,q6_frequence,q7_mode,q8_comprehension,q9_motivation,q10_autonomie,
    q11_engagement,q12_numerique,q13_avantages,q14_role,q15_difficultes,q16_formation,
    q17_type_formation,q18_ameliorations,q19_integration,q20_recommandation,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,
    datetime('now','-'||(abs(random()) % 30)||' days','localtime'))
  `);

  const insert = db.transaction(() => {
    for (let i = 0; i < 40; i++) {
      stmt.run(
        pick(sexes), pick(exps), pick(etabs), pick(utils),
        pickMulti(outils), pick(freqs), pickMulti(modes),
        pick(impacts), pick(impacts), pick(impacts), pick(engagements),
        pick(effs), pickMulti(avantages), pick(roles), pickMulti(diffs),
        pick(formations), pickMulti(typeFormations), pickMulti(ameliorations),
        pick(integrations), pick(recommandations)
      );
    }
  });
  insert();
  res.json({ success: true, message: '40 réponses de démonstration ajoutées.' });
});

// ── Start ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  Serveur : http://localhost:${PORT}`);
  console.log(`  Dashboard: http://localhost:${PORT}/dashboard.html\n`);
});

'use strict';
const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3002;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS responses (
      id                 SERIAL PRIMARY KEY,
      created_at         TIMESTAMPTZ DEFAULT NOW(),
      q1_sexe TEXT, q2_experience TEXT, q3_etablissement TEXT,
      q4_utilisation TEXT, q5_outils TEXT, q6_frequence TEXT,
      q7_mode TEXT, q8_comprehension TEXT, q9_motivation TEXT,
      q10_autonomie TEXT, q11_engagement TEXT, q12_numerique TEXT,
      q13_avantages TEXT, q14_role TEXT, q15_difficultes TEXT,
      q16_formation TEXT, q17_type_formation TEXT, q18_ameliorations TEXT,
      q19_integration TEXT, q20_recommandation TEXT
    )
  `);
}

initDb().catch(console.error);

// CORS — allow Vercel frontend
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://survey-crmef.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json());

app.post('/api/submit', async (req, res) => {
  try {
    const d = req.body;
    const join = v => Array.isArray(v) ? v.join('|') : (v || null);
    await pool.query(`
      INSERT INTO responses
        (q1_sexe,q2_experience,q3_etablissement,q4_utilisation,
         q5_outils,q6_frequence,q7_mode,q8_comprehension,q9_motivation,q10_autonomie,
         q11_engagement,q12_numerique,q13_avantages,q14_role,q15_difficultes,q16_formation,
         q17_type_formation,q18_ameliorations,q19_integration,q20_recommandation)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
    `, [
      d.q1||null,d.q2||null,d.q3||null,d.q4||null,
      join(d.q5),d.q6||null,join(d.q7),
      d.q8||null,d.q9||null,d.q10||null,d.q11||null,
      d.q12||null,join(d.q13),d.q14||null,join(d.q15),
      d.q16||null,join(d.q17),join(d.q18),d.q19||null,d.q20||null
    ]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/analytics', async (_req, res) => {
  try {
    const { rows:[{c:total}] } = await pool.query('SELECT COUNT(*) AS c FROM responses');
    const { rows:[{c:today}] } = await pool.query(`SELECT COUNT(*) AS c FROM responses WHERE created_at::date=CURRENT_DATE`);
    const { rows:[{c:week}]  } = await pool.query(`SELECT COUNT(*) AS c FROM responses WHERE created_at>=NOW()-INTERVAL '7 days'`);
    const dist = async col => {
      const {rows} = await pool.query(`SELECT ${col} AS v,COUNT(*) AS c FROM responses WHERE ${col} IS NOT NULL AND ${col}!='' GROUP BY ${col} ORDER BY c DESC`);
      return rows.map(r=>({label:r.v,count:parseInt(r.c)}));
    };
    const multiDist = async col => {
      const {rows} = await pool.query(`SELECT ${col} AS v FROM responses WHERE ${col} IS NOT NULL AND ${col}!=''`);
      const map={};
      rows.forEach(r=>r.v.split('|').forEach(x=>{x=x.trim();if(x)map[x]=(map[x]||0)+1;}));
      return Object.entries(map).map(([label,count])=>({label,count})).sort((a,b)=>b.count-a.count);
    };
    const {rows:timeline} = await pool.query(`SELECT created_at::date AS date,COUNT(*) AS count FROM responses WHERE created_at>=NOW()-INTERVAL '30 days' GROUP BY created_at::date ORDER BY date`);
    res.json({
      total:parseInt(total),today:parseInt(today),week:parseInt(week),
      timeline:timeline.map(r=>({date:r.date,count:parseInt(r.count)})),
      q1:await dist('q1_sexe'),q2:await dist('q2_experience'),q3:await dist('q3_etablissement'),
      q4:await dist('q4_utilisation'),q5:await multiDist('q5_outils'),q6:await dist('q6_frequence'),
      q7:await multiDist('q7_mode'),q8:await dist('q8_comprehension'),q9:await dist('q9_motivation'),
      q10:await dist('q10_autonomie'),q11:await dist('q11_engagement'),q12:await dist('q12_numerique'),
      q13:await multiDist('q13_avantages'),q14:await dist('q14_role'),q15:await multiDist('q15_difficultes'),
      q16:await dist('q16_formation'),q17:await multiDist('q17_type_formation'),q18:await multiDist('q18_ameliorations'),
      q19:await dist('q19_integration'),q20:await dist('q20_recommandation'),
    });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

app.get('/api/responses', async (req, res) => {
  try {
    const page=Math.max(1,parseInt(req.query.page)||1),limit=10,offset=(page-1)*limit;
    const {rows:data} = await pool.query('SELECT * FROM responses ORDER BY created_at DESC LIMIT $1 OFFSET $2',[limit,offset]);
    const {rows:[{c:total}]} = await pool.query('SELECT COUNT(*) AS c FROM responses');
    res.json({data,total:parseInt(total),page,pages:Math.ceil(parseInt(total)/limit)});
  } catch (err) { res.status(500).json({error:err.message}); }
});

app.delete('/api/responses/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM responses WHERE id=$1',[req.params.id]);
    res.json({success:true});
  } catch (err) { res.status(500).json({error:err.message}); }
});

app.post('/api/seed', async (_req, res) => {
  const pick=arr=>arr[Math.floor(Math.random()*arr.length)];
  const pm=arr=>arr.filter(()=>Math.random()>0.5).join('|')||arr[0];
  const S=['Homme','Femme'],E=['Moins de 5 ans','5–10 ans','Plus de 10 ans'],T=['Public','Privé'];
  const U=['Oui','Non','Parfois'],O=['Ordinateur','Vidéoprojecteur','Simulations','Vidéos éducatives','Plateformes numériques'];
  const F=['Toujours','Souvent','Parfois','Rarement','Jamais'];
  const M=['Présentation du cours','Illustration (vidéos/simulations)','Exercices interactifs','Évaluation','Recherche d\'informations'];
  const I=['Pas du tout','Peu','Moyen','Beaucoup'],G=['Oui','Non','Parfois'];
  const EF=['Plus efficace','Moins efficace','Équivalent'],AV=['Meilleure concentration','Discipline','Moins de distraction'];
  const R=['Remplace le traditionnel','Complète le traditionnel','N\'a pas d\'impact'];
  const D=['Manque de matériel','Manque de formation','Problèmes techniques','Manque de temps','Classes surchargées'];
  const FO=['Oui','Non'],TF=['Utilisation des outils numériques','Création de contenus numériques','Gestion de classe avec numérique','Évaluation numérique'];
  const AM=['Plus d\'équipements','Formation des enseignants','Réduction du nombre d\'élèves','Meilleure connexion internet','Support technique'];
  const IN=['Très importante','Importante','Moyennement importante','Peu importante','Pas importante'];
  const RC=['Oui fortement','Oui','Neutre','Non','Pas du tout'];
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    for(let i=0;i<40;i++){
      await client.query(`INSERT INTO responses(q1_sexe,q2_experience,q3_etablissement,q4_utilisation,q5_outils,q6_frequence,q7_mode,q8_comprehension,q9_motivation,q10_autonomie,q11_engagement,q12_numerique,q13_avantages,q14_role,q15_difficultes,q16_formation,q17_type_formation,q18_ameliorations,q19_integration,q20_recommandation,created_at)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,NOW()-(floor(random()*30)::int*INTERVAL '1 day'))`,
        [pick(S),pick(E),pick(T),pick(U),pm(O),pick(F),pm(M),pick(I),pick(I),pick(I),pick(G),pick(EF),pm(AV),pick(R),pm(D),pick(FO),pm(TF),pm(AM),pick(IN),pick(RC)]);
    }
    await client.query('COMMIT');
    res.json({success:true,message:'40 réponses de démonstration ajoutées.'});
  } catch(err){await client.query('ROLLBACK');res.status(500).json({error:err.message});}
  finally{client.release();}
});

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});

module.exports = app;

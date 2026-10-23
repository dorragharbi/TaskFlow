require('dotenv').config();
const express = require('express'), mysql = require('mysql2/promise'), path = require('path');
const bcrypt = require('bcryptjs'), jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DB = process.env.DB_NAME || 'taskflow';
const SECRET = process.env.JWT_SECRET || 'secret-de-dev-a-changer';
const conn = {
  host: process.env.DB_HOST || 'localhost', port: +(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '',
  ...(process.env.DB_SSL === 'true' ? { ssl: { rejectUnauthorized: false } } : {}),
};
let pool;

async function initDb() {
  const c = await mysql.createConnection(conn);
  try { await c.query(`CREATE DATABASE IF NOT EXISTS \`${DB}\` CHARACTER SET utf8mb4`); } catch (e) { console.log('Base existante utilisée.'); }
  await c.end();
  pool = mysql.createPool({ ...conn, database: DB, dateStrings: true });
  // Migration : l'ancienne table (sans utilisateurs) est recréée
  const [old] = await pool.query("SHOW TABLES LIKE 'tasks'");
  if (old.length && !(await pool.query("SHOW COLUMNS FROM tasks LIKE 'user_id'"))[0].length) await pool.query('DROP TABLE tasks');
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(80) NOT NULL, email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS categories (
    id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, name VARCHAR(40) NOT NULL, color VARCHAR(7) NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS tasks (
    id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, category_id INT NULL,
    title VARCHAR(150) NOT NULL, description TEXT,
    priority ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
    status ENUM('todo','doing','done') NOT NULL DEFAULT 'todo',
    due_date DATE NULL, completed_at DATETIME NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL)`);
}

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); });
const token = (u) => jwt.sign({ id: u.id }, SECRET, { expiresIn: '7d' });
function auth(req, res, next) {
  try { req.uid = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), SECRET).id; next(); }
  catch { res.status(401).json({ error: 'Session expirée, reconnectez-vous.' }); }
}

// ---------- Comptes ----------
app.post('/api/auth/register', wrap(async (req, res) => {
  const name = String(req.body.name || '').trim(), email = String(req.body.email || '').trim().toLowerCase(), pw = String(req.body.password || '');
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || pw.length < 6) return res.status(400).json({ error: 'Nom, e-mail valide et mot de passe de 6 caractères minimum requis.' });
  try {
    const [r] = await pool.query('INSERT INTO users SET ?', [{ name, email, password_hash: await bcrypt.hash(pw, 10) }]);
    await pool.query('INSERT INTO categories (user_id, name, color) VALUES ?', [[[r.insertId, 'Études', '#3f7a63'], [r.insertId, 'Travail', '#a9803f'], [r.insertId, 'Perso', '#7a5f9b']]]);
    res.status(201).json({ token: token({ id: r.insertId }), user: { name } });
  } catch (e) { if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Cet e-mail est déjà utilisé.' }); throw e; }
}));

app.post('/api/auth/login', wrap(async (req, res) => {
  const [[u]] = await pool.query('SELECT * FROM users WHERE email = ?', [String(req.body.email || '').trim().toLowerCase()]);
  if (!u || !(await bcrypt.compare(String(req.body.password || ''), u.password_hash))) return res.status(401).json({ error: 'E-mail ou mot de passe incorrect.' });
  res.json({ token: token(u), user: { name: u.name } });
}));

// ---------- Catégories ----------
app.get('/api/categories', auth, wrap(async (req, res) => res.json((await pool.query('SELECT id, name, color FROM categories WHERE user_id = ? ORDER BY name', [req.uid]))[0])));
app.post('/api/categories', auth, wrap(async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 40), color = /^#[0-9a-f]{6}$/i.test(req.body.color) ? req.body.color : '#0f3d33';
  if (!name) return res.status(400).json({ error: 'Le nom est obligatoire.' });
  const [r] = await pool.query('INSERT INTO categories SET ?', [{ user_id: req.uid, name, color }]);
  res.status(201).json({ id: r.insertId, name, color });
}));
app.delete('/api/categories/:id', auth, wrap(async (req, res) => { await pool.query('DELETE FROM categories WHERE id = ? AND user_id = ?', [req.params.id, req.uid]); res.status(204).end(); }));

// ---------- Tâches (toujours filtrées par utilisateur) ----------
async function clean(body, uid) {
  const title = String(body.title || '').trim();
  if (!title || title.length > 150) return null;
  let category_id = null;
  if (body.category_id) { const [[c]] = await pool.query('SELECT id FROM categories WHERE id = ? AND user_id = ?', [body.category_id, uid]); category_id = c ? c.id : null; }
  const status = ['todo', 'doing', 'done'].includes(body.status) ? body.status : 'todo';
  return {
    title, description: String(body.description || '').trim(), category_id, status,
    priority: ['low', 'medium', 'high'].includes(body.priority) ? body.priority : 'medium',
    due_date: /^\d{4}-\d{2}-\d{2}$/.test(body.due_date || '') ? body.due_date : null,
    completed_at: status === 'done' ? new Date() : null,
  };
}

app.get('/api/tasks', auth, wrap(async (req, res) => res.json((await pool.query(
  `SELECT * FROM tasks WHERE user_id = ? ORDER BY status = 'done', FIELD(priority,'high','medium','low'), due_date IS NULL, due_date, id DESC`, [req.uid]))[0])));

app.post('/api/tasks', auth, wrap(async (req, res) => {
  const t = await clean(req.body, req.uid);
  if (!t) return res.status(400).json({ error: 'Le titre est obligatoire (150 caractères max).' });
  const [r] = await pool.query('INSERT INTO tasks SET ?', [{ ...t, user_id: req.uid }]);
  res.status(201).json({ id: r.insertId });
}));

app.put('/api/tasks/:id', auth, wrap(async (req, res) => {
  const t = await clean(req.body, req.uid);
  if (!t) return res.status(400).json({ error: 'Le titre est obligatoire (150 caractères max).' });
  const [r] = await pool.query('UPDATE tasks SET ? WHERE id = ? AND user_id = ?', [t, req.params.id, req.uid]);
  r.affectedRows ? res.json({ id: +req.params.id }) : res.status(404).json({ error: 'Tâche introuvable.' });
}));

app.delete('/api/tasks/:id', auth, wrap(async (req, res) => {
  const [r] = await pool.query('DELETE FROM tasks WHERE id = ? AND user_id = ?', [req.params.id, req.uid]);
  r.affectedRows ? res.status(204).end() : res.status(404).json({ error: 'Tâche introuvable.' });
}));

const PORT = process.env.PORT || 3000;
initDb().then(() => app.listen(PORT, () => console.log(`TaskFlow prêt : http://localhost:${PORT}`)))
  .catch((e) => { console.error('Connexion MySQL impossible :', e.message); process.exit(1); });

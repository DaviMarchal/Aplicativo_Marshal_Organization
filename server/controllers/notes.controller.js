const pool = require("../db");
const { todayStr } = require("../utils/dates");

async function attachTags(notes) {
  if (!notes.length) return notes;
  const ids = notes.map((n) => n.id);
  const [tagRows] = await pool.query(`SELECT note_id, tag FROM note_tags WHERE note_id IN (?)`, [ids]);
  const tagsByNote = {};
  tagRows.forEach((r) => (tagsByNote[r.note_id] ||= []).push(r.tag));
  return notes.map((n) => ({ ...n, tags: tagsByNote[n.id] || [] }));
}

async function list(req, res, next) {
  try {
    const { search, tag, pinned } = req.query;
    const clauses = ["user_id = ?"];
    const params = [req.userId];
    if (search) {
      clauses.push("(title LIKE ? OR content LIKE ?)");
      params.push(`%${search}%`, `%${search}%`);
    }
    if (pinned !== undefined) {
      clauses.push("pinned = ?");
      params.push(pinned === "1" || pinned === "true" ? 1 : 0);
    }
    if (tag) {
      clauses.push("id IN (SELECT note_id FROM note_tags WHERE tag = ?)");
      params.push(tag);
    }
    const [rows] = await pool.query(
      `SELECT * FROM notes WHERE ${clauses.join(" AND ")} ORDER BY pinned DESC, note_date DESC, created_at DESC`,
      params
    );
    res.json(await attachTags(rows));
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const [rows] = await pool.query(`SELECT * FROM notes WHERE id = ? AND user_id = ?`, [req.params.id, req.userId]);
    if (!rows.length) return res.status(404).json({ error: "Nota não encontrada." });
    const [full] = await attachTags(rows);
    res.json(full);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  const conn = await pool.getConnection();
  try {
    const { title = null, content = null, color = "#16161A", pinned = false, note_date, tags = [] } = req.body;
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO notes (user_id, title, content, color, pinned, note_date) VALUES (?, ?, ?, ?, ?, ?)`,
      [req.userId, title, content, color, pinned ? 1 : 0, note_date || todayStr()]
    );
    const noteId = result.insertId;
    if (Array.isArray(tags) && tags.length) {
      await conn.query(
        `INSERT INTO note_tags (note_id, tag) VALUES ${tags.map(() => "(?, ?)").join(",")}`,
        tags.flatMap((t) => [noteId, t])
      );
    }
    await conn.commit();
    const [rows] = await pool.query(`SELECT * FROM notes WHERE id = ?`, [noteId]);
    const [full] = await attachTags(rows);
    res.status(201).json(full);
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
}

async function update(req, res, next) {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    const [existing] = await pool.query(`SELECT id FROM notes WHERE id = ? AND user_id = ?`, [id, req.userId]);
    if (!existing.length) return res.status(404).json({ error: "Nota não encontrada." });

    const { title = null, content = null, color = "#16161A", pinned = false, note_date, tags = [] } = req.body;
    await conn.beginTransaction();
    await conn.query(
      `UPDATE notes SET title=?, content=?, color=?, pinned=?, note_date=? WHERE id=?`,
      [title, content, color, pinned ? 1 : 0, note_date || todayStr(), id]
    );
    await conn.query(`DELETE FROM note_tags WHERE note_id = ?`, [id]);
    if (Array.isArray(tags) && tags.length) {
      await conn.query(
        `INSERT INTO note_tags (note_id, tag) VALUES ${tags.map(() => "(?, ?)").join(",")}`,
        tags.flatMap((t) => [id, t])
      );
    }
    await conn.commit();
    const [rows] = await pool.query(`SELECT * FROM notes WHERE id = ?`, [id]);
    const [full] = await attachTags(rows);
    res.json(full);
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
}

async function remove(req, res, next) {
  try {
    const [result] = await pool.query(`DELETE FROM notes WHERE id = ? AND user_id = ?`, [req.params.id, req.userId]);
    if (!result.affectedRows) return res.status(404).json({ error: "Nota não encontrada." });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getOne, create, update, remove };

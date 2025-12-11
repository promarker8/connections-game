require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

// Connect to Neon
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.query('SELECT NOW()')
    .then(res => console.log("DB connected:", res.rows[0]))
    .catch(err => console.error("DB connection error:", err));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Simple test route
app.get('/', (req, res) => {
    res.send('Backend is running!');
});

app.post("/create-room", async (req, res) => {
    try {
        const { puzzle } = req.body;
        const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();

        await pool.query(
            `INSERT INTO rooms (code, puzzle) VALUES ($1, $2)`,
            [roomCode, JSON.stringify(puzzle)]
        );

        res.json({ roomCode });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to create room" });
    }
});

app.get("/rooms", async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT code, puzzle FROM rooms`
        );

        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to get rooms" });
    }
});

// Get puzzle for a specific room
app.get("/room/:code", async (req, res) => {
    try {
        const code = req.params.code;
        const { rows } = await pool.query(
            `SELECT puzzle FROM rooms WHERE code = $1`,
            [code]
        );

        if (!rows.length) return res.status(404).json({ error: "Room not found" });

        res.json(rows[0].puzzle);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to get room" });
    }
});

// Player joins a room
app.post("/join-room", async (req, res) => {
    try {
        const { roomCode, playerName } = req.body;

        // Check room exists
        const { rows } = await pool.query(
            `SELECT code FROM rooms WHERE code = $1`,
            [roomCode]
        );
        if (!rows.length) return res.status(404).json({ error: "Room not found" });

        // Add player to table
        const result = await pool.query(
            `INSERT INTO players (room_code, name) VALUES ($1, $2) RETURNING id, name`,
            [roomCode, playerName]
        );

        res.json({ playerId: result.rows[0].id, name: result.rows[0].name });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to join room" });
    }
});

app.get("/players", async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, room_code, name, mistakes, finished, time_seconds, created_at FROM players`
        );

        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to get players" });
    }
});

// Player submits their results
app.post("/submit-result", async (req, res) => {
    try {
        const { playerId, mistakes, timeSeconds } = req.body;

        await pool.query(
            `UPDATE players 
             SET mistakes = $1, time_seconds = $2, finished = TRUE 
             WHERE id = $3`,
            [mistakes, timeSeconds, playerId]
        );

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to submit result" });
    }
});

// Get winner for a room
app.get("/room/:code/winner", async (req, res) => {
    try {
        const roomCode = req.params.code;

        // Fetch all finished players in this room
        const { rows } = await pool.query(
            `SELECT name, mistakes, time_seconds 
             FROM players 
             WHERE room_code = $1 AND finished = TRUE
             ORDER BY mistakes ASC, time_seconds ASC
             LIMIT 1`,
            [roomCode]
        );

        if (!rows.length) return res.status(404).json({ error: "No finished players yet" });

        res.json({ winner: rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to get winner" });
    }
});

app.get("/results", async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, room_code, player_name, mistakes, finish_time, mistakes FROM results`
        );

        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to get results" });
    }
});

server.listen(process.env.PORT || 3000, () => {
    console.log(`Server running on port ${process.env.PORT || 3000}`);
});

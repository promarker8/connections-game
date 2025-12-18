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
const liveRooms = {};

io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    socket.on("joinRoom", ({ roomCode, playerId, playerName }) => {
        socket.join(roomCode);

        if (!liveRooms[roomCode]) {
            liveRooms[roomCode] = [];
        }

        // Prevent duplicates
        const exists = liveRooms[roomCode].find(p => p.playerId === playerId);
        if (!exists) {
            liveRooms[roomCode].push({
                playerId,
                name: playerName,
                score: 0
            });
        }

        // Push leaderboard to everyone in room
        io.to(roomCode).emit("leaderboardUpdate", liveRooms[roomCode]);
    });

    // When a player updates score
    socket.on("updateScore", ({ roomCode, playerId, score }) => {
        if (!liveRooms[roomCode]) return;

        const player = liveRooms[roomCode].find(p => p.playerId === playerId);
        if (player) player.score = score;

        liveRooms[roomCode].sort((a, b) => b.score - a.score);

        io.to(roomCode).emit("leaderboardUpdate", liveRooms[roomCode]);
    });
});

// Simple test route
app.get('/', (req, res) => {
    res.send('Backend is running!');
});

// create a room (and puzzles if you have them)
app.post("/create-room", async (req, res) => {
    try {
        const { name, puzzle } = req.body || {};
        const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();

        // Create room
        const roomResult = await pool.query(
            `INSERT INTO rooms (code, name) VALUES ($1, $2) RETURNING *`,
            [roomCode, name || null]
        );

        const roomId = roomResult.rows[0].id;

        let firstRound = null;

        // Create first round if puzzle provided
        if (puzzle) {
            const roundResult = await pool.query(
                `INSERT INTO rounds (room_code, round_number, puzzle) 
                VALUES ($1, $2, $3) RETURNING *`,
                [roomCode, 1, JSON.stringify(puzzle)]
            );
            firstRound = roundResult.rows[0];
        }

        res.json({
            room: roomResult.rows[0],
            firstRound
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to create room" });
    }
});

// get all rooms
app.get("/rooms", async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, code, name, created_at FROM rooms`
        );

        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to get rooms" });
    }
});

// Get next unplayed round for a player in a room
app.get("/room/:code/round/next/:playerId", async (req, res) => {
  try {
    const { code, playerId } = req.params;

    const { rows } = await pool.query(
      `
      SELECT r.*
      FROM rounds r
      LEFT JOIN scores s
        ON s.round_id = r.id
        AND s.player_id = $2
      WHERE r.room_code = $1
        AND s.id IS NULL
      ORDER BY r.round_number ASC
      LIMIT 1
      `,
      [code, playerId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "No more rounds available" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("Failed to get next round:", err);
    res.status(500).json({ error: "Failed to get next round" });
  }
});

// create a round in a specific room
app.post("/room/:code/create-round", async (req, res) => {
  try {
    const roomCode = req.params.code;
    const { puzzle } = req.body;

    const { rows: roundCount } = await pool.query(
      `SELECT COUNT(*) FROM rounds WHERE room_code = $1`,
      [roomCode]
    );

    const roundNumber = parseInt(roundCount[0].count) + 1;

    const result = await pool.query(
      `INSERT INTO rounds (room_code, round_number, puzzle) 
      VALUES ($1, $2, $3) RETURNING *`,
      [roomCode, roundNumber, JSON.stringify(puzzle)]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create round" });
  }
});

// create several rounds for a room in one go
app.post("/room/:code/create-rounds", async (req, res) => {
  try {
    const roomCode = req.params.code;
    const { rounds } = req.body;

    if (!rounds || !Array.isArray(rounds) || !rounds.length) {
      return res.status(400).json({ error: "An array of rounds is required" });
    }

    // room exists?
    const { rows: roomRows } = await pool.query(
      `SELECT id FROM rooms WHERE code = $1`,
      [roomCode]
    );
    if (!roomRows.length) return res.status(404).json({ error: "Room not found" });

    // get current number of rounds
    const { rows: roundCount } = await pool.query(
      `SELECT COUNT(*) FROM rounds WHERE room_code = $1`,
      [roomCode]
    );
    let nextRoundNumber = parseInt(roundCount[0].count) + 1;

    const insertedRounds = [];

    for (const round of rounds) {
      if (!round.puzzle) continue;

      const result = await pool.query(
        `INSERT INTO rounds (room_code, round_number, puzzle) VALUES ($1, $2, $3) RETURNING *`,
        [roomCode, nextRoundNumber, JSON.stringify(round.puzzle) || null]
      );

      insertedRounds.push(result.rows[0]);
      nextRoundNumber++;
    }

    res.json({ rounds: insertedRounds });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create rounds", details: err.message });
  }
});

// get specific round in a specific room
app.get("/room/:code/round/:number", async (req, res) => {
  try {
    const { code, number } = req.params;
    const { rows } = await pool.query(
      `SELECT * FROM rounds WHERE room_code = $1 AND round_number = $2`,
      [code, number]
    );

    if (!rows.length) return res.status(404).json({ error: "Round not found" });

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get round" });
  }
});

// Get latest round for a room
app.get("/room/:code/latest-round", async (req, res) => {
  try {
    const roomCode = req.params.code;

    const { rows } = await pool.query(
      `SELECT * FROM rounds 
       WHERE room_code = $1 
       ORDER BY round_number DESC 
       LIMIT 1`,
      [roomCode]
    );

    if (!rows.length) return res.status(404).json({ error: "No rounds found for this room" });

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get latest round" });
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
        // If the playerName is "DevTesterAdmin", skip uniqueness check
        // if (playerName === "DevTesterAdmin") {
        //     const result = await pool.query(
        //         `INSERT INTO players (room_code, name) VALUES ($1, $2) RETURNING id, name`,
        //         [roomCode, playerName]
        //     );
        //     return res.json({ playerId: result.rows[0].id, name: result.rows[0].name });
        // }

        // Otherwise, enforce unique names
        const result = await pool.query(
            `INSERT INTO players (room_code, name) VALUES ($1, $2) RETURNING id, name`,
            [roomCode, playerName]
        );

        res.json({ playerId: result.rows[0].id, name: result.rows[0].name });
    } catch (err) {
          // if (err.code === '23505') {
          //   return res.status(409).json({ error: "Someone is already called that :(" });
          // }
        console.error(err);
        res.status(500).json({ error: "Failed to join room" });
    }
});

app.get("/players", async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, room_code, name, created_at FROM players`
        );

        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to get players" });
    }
});

// get individual player details
app.get("/players/:playerId", async (req, res) => {
  try {
    const { playerId } = req.params;

    // Get player info
    const { rows: playerRows } = await pool.query(
      `SELECT id, name, room_code FROM players WHERE id = $1`,
      [playerId]
    );
    if (!playerRows.length) return res.status(404).json({ error: "Player not found" });

    const player = playerRows[0];

    // Get room info
    const { rows: roomRows } = await pool.query(
      `SELECT code, name FROM rooms WHERE code = $1`,
      [player.room_code]
    );

    const room = roomRows[0] || null;

    // Get rounds that this player has submitted scores for
    const { rows: rounds } = await pool.query(
      `SELECT r.id AS round_id, r.round_number, r.puzzle,
              s.points, s.mistakes, s.time_seconds
       FROM rounds r
       JOIN scores s ON r.id = s.round_id
       WHERE s.player_id = $1
       ORDER BY r.round_number ASC`,
      [playerId]
    );

    res.json({
      player: {
        id: player.id,
        name: player.name,
        room,
        rounds
      }
    });

  } catch (err) {
    console.error("Failed to get player details:", err);
    res.status(500).json({ error: "Failed to get player details" });
  }
});

// Player submits a guess
app.post("/round/:roundId/submit-guess", async (req, res) => {
    try {
        const { roundId } = req.params;
        const { words } = req.body;

        const { rows } = await pool.query(`SELECT puzzle FROM rounds WHERE id = $1`, [roundId]);
        if (!rows.length) return res.status(404).json({ result: "round_not_found" });

        const puzzle = rows[0].puzzle;
        const groups = puzzle.groups;

        const guessSet = new Set(words.map(w => w.toLowerCase()));

        for (const group of groups) {
            const groupWords = new Set(group.words.map(w => w.toLowerCase()));

            const isMatch =
                guessSet.size === groupWords.size &&
                [...guessSet].every(w => groupWords.has(w));

            if (isMatch) {
                return res.json({
                    result: "correct",
                    groupName: group.name,
                    connection: group.connection
                });
            }
        }

        return res.json({ result: "incorrect" });

    } catch (err) {
        console.error(err);
        res.status(500).json({ result: "error", error: "Server error" });
    }
});

// end of round submit
app.post("/room/:code/round/:roundNumber/submit-result", async (req, res) => {
    try {
        const { code, roundNumber } = req.params;
        const { playerId, mistakes, timeSeconds, points } = req.body;

        // Make sure the round exists, and get its ID
        const { rows: roundRows } = await pool.query(
            `SELECT id FROM rounds 
            WHERE room_code=$1 
            AND round_number=$2`,
            [code, roundNumber]
        );

        if (!roundRows.length)
            return res.status(404).json({ error: "Round not found" });

        const roundId = roundRows[0].id;

        // Insert or update score using round_id
        const result = await pool.query(
            `INSERT INTO scores (player_id, room_code, round_id, mistakes, time_seconds, points)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [playerId, code, roundId, mistakes, timeSeconds, points]
        );

        console.log("through the first insert:", roundId);

        // Build leaderboard
        const { rows: leaderboard } = await pool.query(
            `SELECT p.name, SUM(s.points) AS total_points
             FROM scores s
             JOIN players p ON p.id = s.player_id
             WHERE p.room_code = $1
             GROUP BY p.name
             ORDER BY total_points DESC`,
            [code]
        );

        io.to(code).emit("leaderboardUpdate", leaderboard);

        res.json(result.rows[0]);

    } catch (err) {
        console.error("Error submitting result:", err);
        res.status(500).json({
            error: "Failed to submit result",
            details: err.message
        });
    }
});

app.get("/room/:code/scores", async (req, res) => {
  try {
    const roomCode = req.params.code;

    const { rows } = await pool.query(
      `
      SELECT s.id AS score_id,
            s.player_id,
            p.name AS player_name,
            r.round_number,
            s.points,
            s.mistakes,
            s.time_seconds
      FROM scores s
      JOIN players p ON s.player_id = p.id
      JOIN rounds r ON s.round_id = r.id
      WHERE s.room_code = $1
      ORDER BY r.round_number ASC, s.points DESC
      `,
      [roomCode]
    );

    res.json(rows);
  } catch (err) {
    console.error("Failed to get room scores:", err);
    res.status(500).json({ error: "Failed to get room scores" });
  }
});

// Get all scores for a specific player, including room and round info
app.get("/player/:playerId/scores", async (req, res) => {
  try {
    const { playerId } = req.params;

    const { rows } = await pool.query(
      `
      SELECT s.id as score_id,
             s.points,
             s.mistakes,
             s.time_seconds,
             r.round_number,
             r.room_code,
             p.name as player_name
      FROM scores s
      JOIN rounds r ON s.round_id = r.id
      JOIN players p ON s.player_id = p.id
      WHERE s.player_id = $1
      ORDER BY r.room_code, r.round_number ASC
      `,
      [playerId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "No scores found for this player" });
    }

    res.json(rows);
  } catch (err) {
    console.error("Failed to get player scores:", err);
    res.status(500).json({ error: "Failed to get player scores" });
  }
});

app.get("/room/:code/leaderboard", async (req, res) => {
  try {
    const roomCode = req.params.code;

    const { rows } = await pool.query(
      `SELECT p.name, SUM(s.points) as total_points
       FROM scores s
       JOIN players p ON p.id = s.player_id
       WHERE p.room_code = $1
       GROUP BY p.name
       ORDER BY total_points DESC`,
      [roomCode]
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get leaderboard" });
  }
});

server.listen(process.env.PORT || 3000, () => {
    console.log(`Server running on port ${process.env.PORT || 3000}`);
});

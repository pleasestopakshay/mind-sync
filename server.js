const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);

if (process.env.NODE_ENV === 'production') {
  app.use(express.static('dist'));
  
  app.get('*', (req, res) => {
    if (!req.url.startsWith('/socket.io')) {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    }
  });
}

const corsOptions = {
  origin: process.env.NODE_ENV === 'production' ? 
    function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      
      // Allow any vercel.app subdomain
      if (origin.includes('vercel.app')) {
        return callback(null, true);
      }
      
      // Allow localhost for development
      if (origin.includes('localhost')) {
        return callback(null, true);
      }
      
      // Allow the origin if it matches the current host
      callback(null, true);
    } : 
    ["http://localhost:3000", "http://localhost:3001"],
  credentials: false
};

app.use(cors(corsOptions));

const io = socketIo(server, {
  cors: corsOptions,
  allowEIO3: true,
  transports: ['polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

const rooms = new Map();
const players = new Map();

const ROUND_TIME = 30000;
const WAITING_TIME = 8000;

class GameRoom {
  constructor(roomId, hostId) {
    this.id = roomId;
    this.hostId = hostId;
    this.players = new Map();
    this.gameState = 'waiting';
    this.currentRound = 0;
    this.roundTimer = null;
    this.roundTimeExpired = false;
    this.submissions = new Map();
    this.scores = new Map();
    this.roundResults = [];
  }

  addPlayer(playerId, nickname) {
    this.players.set(playerId, {
      id: playerId,
      nickname,
      isHost: playerId === this.hostId,
      connected: true
    });
    this.scores.set(playerId, 0);
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
    this.scores.delete(playerId);
    this.submissions.delete(playerId);
    
    if (playerId === this.hostId && this.players.size > 0) {
      this.hostId = this.players.keys().next().value;
      this.players.get(this.hostId).isHost = true;
    }
  }

  startGame() {
    if (this.players.size < 2) return false;
    
    this.gameState = 'playing';
    this.currentRound = 1;
    this.submissions.clear();
    this.roundTimeExpired = false;
    return true;
  }

  startRound() {
    this.submissions.clear();
    this.roundTimeExpired = false;
    
    // Start round timer
    this.roundTimer = setTimeout(() => {
      this.roundTimeExpired = true;
    }, ROUND_TIME);
  }

  submitWord(playerId, word) {
    if (this.gameState !== 'playing') return false;
    
    this.submissions.set(playerId, word.toLowerCase().trim());
    
    if (this.submissions.size === this.players.size) {
      clearTimeout(this.roundTimer);
      this.endRound();
    }
    
    return true;
  }

  endRound() {
    const roundResult = this.calculateRoundScore();
    this.roundResults.push(roundResult);
    
    roundResult.matches.forEach(match => {
      match.players.forEach(playerId => {
        this.scores.set(playerId, this.scores.get(playerId) + match.points);
      });
    });
    
    return roundResult;
  }

  processRoundEnd() {
    if (this.checkWinCondition()) {
      this.endGame();
      return 'game_won';
    } else {
      this.currentRound++;
      return 'continue';
    }
  }

  checkWinCondition() {
    const wordGroups = new Map();
    
    this.submissions.forEach((word, playerId) => {
      if (word.length > 0) {
        if (!wordGroups.has(word)) {
          wordGroups.set(word, []);
        }
        wordGroups.get(word).push(playerId);
      }
    });
    
    for (const [word, players] of wordGroups) {
      if (players.length === this.players.size) {
        return true;
      }
    }
    
    return false;
  }

  calculateRoundScore() {
    const wordGroups = new Map();
    
    this.submissions.forEach((word, playerId) => {
      if (!wordGroups.has(word)) {
        wordGroups.set(word, []);
      }
      wordGroups.get(word).push(playerId);
    });
    
    const matches = [];
    
    wordGroups.forEach((players, word) => {
      if (players.length > 1 && word.length > 0) {
        const points = players.length * 10;
        matches.push({
          word,
          players,
          points
        });
      }
    });
    
    return {
      round: this.currentRound,
      submissions: Object.fromEntries(this.submissions),
      matches,
      scores: Object.fromEntries(this.scores)
    };
  }

  endGame() {
    this.gameState = 'finished';
    
    const finalScores = Array.from(this.scores.entries())
      .map(([playerId, score]) => ({
        playerId,
        nickname: this.players.get(playerId).nickname,
        score
      }))
      .sort((a, b) => b.score - a.score);
    
    return {
      finalScores,
      roundResults: this.roundResults
    };
  }

  getGameState() {
    return {
      id: this.id,
      hostId: this.hostId,
      players: Array.from(this.players.values()),
      gameState: this.gameState,
      currentRound: this.currentRound,
      scores: Object.fromEntries(this.scores),
      timeLeft: this.roundTimer ? ROUND_TIME : 0
    };
  }
}

function handleRoundEnd(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  
  clearTimeout(room.roundTimer);
  const roundResult = room.endRound();
  const gameStatus = room.processRoundEnd();
  
  io.to(roomId).emit('round-ended', roundResult);
  
  if (gameStatus === 'game_won') {
    const gameResult = room.endGame();
    io.to(roomId).emit('game-ended', gameResult);
  } else {
    io.to(roomId).emit('game-state', room.getGameState());
    
    let countdown = 5;
    const countdownInterval = setInterval(() => {
      io.to(roomId).emit('next-round-countdown', { countdown });
      countdown--;
      
      if (countdown < 0) {
        clearInterval(countdownInterval);
        room.startRound();
        io.to(roomId).emit('round-started', { 
          round: room.currentRound, 
          timeLeft: ROUND_TIME 
        });
        room.roundTimer = setTimeout(() => {
          handleRoundEnd(roomId);
        }, ROUND_TIME);
      }
    }, 1000);
  }
}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);
  
  socket.on('create-room', (data) => {
    const roomId = uuidv4().substring(0, 8).toUpperCase();
    const room = new GameRoom(roomId, socket.id);
    
    room.addPlayer(socket.id, data.nickname);
    rooms.set(roomId, room);
    players.set(socket.id, { roomId, nickname: data.nickname });
    
    socket.join(roomId);
    socket.emit('room-created', { roomId });
    io.to(roomId).emit('game-state', room.getGameState());
  });
  
  socket.on('join-room', (data) => {
    const room = rooms.get(data.roomId);
    
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }
    
    if (room.players.size >= 6) {
      socket.emit('error', { message: 'Room is full' });
      return;
    }
    
    if (room.gameState !== 'waiting') {
      socket.emit('error', { message: 'Game already in progress' });
      return;
    }
    
    room.addPlayer(socket.id, data.nickname);
    players.set(socket.id, { roomId: data.roomId, nickname: data.nickname });
    
    socket.join(data.roomId);
    socket.emit('room-joined', { roomId: data.roomId });
    io.to(data.roomId).emit('game-state', room.getGameState());
  });
  
  socket.on('start-game', () => {
    const playerData = players.get(socket.id);
    if (!playerData) return;
    
    const room = rooms.get(playerData.roomId);
    if (!room || room.hostId !== socket.id) return;
    
    if (room.startGame()) {
      io.to(playerData.roomId).emit('game-started');
      io.to(playerData.roomId).emit('game-state', room.getGameState());
      io.to(playerData.roomId).emit('round-started', { 
        round: room.currentRound, 
        timeLeft: ROUND_TIME 
      });
      
      // Set up timer for the initial round
      room.roundTimer = setTimeout(() => {
        handleRoundEnd(playerData.roomId);
      }, ROUND_TIME);
    }
  });
  
  socket.on('submit-word', (data) => {
    const playerData = players.get(socket.id);
    if (!playerData) return;
    
    const room = rooms.get(playerData.roomId);
    if (!room) return;
    
    if (room.submitWord(socket.id, data.word)) {
      io.to(playerData.roomId).emit('word-submitted', { 
        playerId: socket.id,
        nickname: playerData.nickname 
      });
      
      // Check if round should end
      if (room.submissions.size === room.players.size) {
        handleRoundEnd(playerData.roomId);
      }
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    
    const playerData = players.get(socket.id);
    if (playerData) {
      const room = rooms.get(playerData.roomId);
      if (room) {
        room.removePlayer(socket.id);
        
        if (room.players.size === 0) {
          rooms.delete(playerData.roomId);
        } else {
          io.to(playerData.roomId).emit('game-state', room.getGameState());
        }
      }
      
      players.delete(socket.id);
    }
  });
});

const PORT = process.env.PORT || 3001;

if (process.env.NODE_ENV !== 'production') {
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;

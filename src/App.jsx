import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import io from 'socket.io-client';
import { 
  Users, 
  Crown, 
  Clock, 
  Send, 
  Trophy, 
  Star,
  Home,
  Copy,
  Check,
  Info,
  X,
  Target,
  Award,
  Timer,
  Brain
} from 'lucide-react';

const getSocketUrl = () => {
  // In production, use the current window location
  if (import.meta.env.PROD) {
    return window.location.origin;
  }
  // In development, use localhost
  return 'http://localhost:3001';
};

const socket = io(getSocketUrl(), {
  transports: ['polling'],
  upgrade: false,
  rememberUpgrade: false,
  timeout: 20000,
  forceNew: false,
  autoConnect: true,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5,
  pingTimeout: 60000,
  pingInterval: 25000
});

function App() {
  // Add connection debugging
  useEffect(() => {
    console.log('🔗 Socket.IO connecting to:', getSocketUrl());
    console.log('🔗 Environment:', import.meta.env.PROD ? 'production' : 'development');
    console.log('🔗 Window location:', window.location.origin);
  }, []);

  const [gameState, setGameState] = useState('home');
  const [nickname, setNickname] = useState('');
  const [roomId, setRoomId] = useState('');
  const [gameData, setGameData] = useState(null);
  const [currentWord, setCurrentWord] = useState('');
  const [timeLeft, setTimeLeft] = useState(0);
  const [roundResults, setRoundResults] = useState(null);
  const [finalResults, setFinalResults] = useState(null);
  const [error, setError] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [copied, setCopied] = useState(false);
  const [wordSubmitted, setWordSubmitted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [nextRoundCountdown, setNextRoundCountdown] = useState(0);
  const [isWaitingForNextRound, setIsWaitingForNextRound] = useState(false);

  useEffect(() => {
    socket.on('room-created', (data) => {
      setRoomId(data.roomId);
      setGameState('lobby');
      setIsHost(true);
      setError('');
      enterFullscreen();
    });

    socket.on('room-joined', (data) => {
      setRoomId(data.roomId);
      setGameState('lobby');
      setIsHost(false);
      setError('');
      enterFullscreen();
    });

    socket.on('game-state', (data) => {
      setGameData(data);
      setIsHost(data.hostId === socket.id);
    });

    socket.on('game-started', () => {
      setGameState('playing');
      setWordSubmitted(false);
    });

    socket.on('round-started', (data) => {
      setTimeLeft(30);
      setCurrentWord('');
      setWordSubmitted(false);
      setRoundResults(null);
      setIsWaitingForNextRound(false);
      setNextRoundCountdown(0);
    });

    socket.on('round-ended', (data) => {
      setRoundResults(data);
      setTimeLeft(0);
      if (data.allPlayersMatched) {
        setGameState('results');
      } else {
        setIsWaitingForNextRound(true);
        setNextRoundCountdown(5);
      }
    });

    socket.on('next-round-countdown', (data) => {
      setNextRoundCountdown(data.countdown);
    });

    socket.on('game-ended', (data) => {
      setFinalResults(data);
      setGameState('results');
    });

    socket.on('word-submitted', (data) => {
      
    });

    socket.on('error', (data) => {
      setError(data.message);
    });

    // Add debugging for connection
    socket.on('connect', () => {
      console.log('✅ Connected to server:', socket.id);
    });
    
    socket.on('disconnect', (reason) => {
      console.log('❌ Disconnected from server:', reason);
    });
    
    socket.on('connect_error', (error) => {
      console.error('❌ Connection error:', error);
      setError('Connection error: ' + error.message);
    });
    
    return () => {
      socket.off('room-created');
      socket.off('room-joined');
      socket.off('game-state');
      socket.off('game-started');
      socket.off('round-started');
      socket.off('round-ended');
      socket.off('game-ended');
      socket.off('word-submitted');
      socket.off('next-round-countdown');
      socket.off('error');
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
    };
  }, []);

  useEffect(() => {
    let timer;
    if (timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft(prev => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [timeLeft]);

  useEffect(() => {
    let timer;
    if (nextRoundCountdown > 0) {
      timer = setInterval(() => {
        setNextRoundCountdown(prev => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [nextRoundCountdown]);

  const enterFullscreen = () => {
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    }
  };

  const createRoom = () => {
    if (nickname.trim()) {
      socket.emit('create-room', { nickname: nickname.trim() });
    }
  };

  const joinRoom = () => {
    if (nickname.trim() && roomId.trim()) {
      socket.emit('join-room', { roomId: roomId.trim().toUpperCase(), nickname: nickname.trim() });
    }
  };

  const startGame = () => {
    socket.emit('start-game');
  };

  const submitWord = () => {
    if (currentWord.trim() && !wordSubmitted) {
      socket.emit('submit-word', { word: currentWord.trim() });
      setWordSubmitted(true);
    }
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const goHome = () => {
    setGameState('home');
    setNickname('');
    setRoomId('');
    setGameData(null);
    setCurrentWord('');
    setTimeLeft(0);
    setRoundResults(null);
    setFinalResults(null);
    setError('');
    setIsHost(false);
    setWordSubmitted(false);
    setShowRules(false);
    setNextRoundCountdown(0);
    setIsWaitingForNextRound(false);
    if (document.exitFullscreen) {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handleKeyPress = (e, action) => {
    if (e.key === 'Enter') {
      action();
    }
  };

  const formatTime = (seconds) => {
    return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
  };

  const RulesModal = () => (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="rules-overlay"
      onClick={() => setShowRules(false)}
    >
      <motion.div 
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        className="rules-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rules-header">
          <h2 className="rules-title">
            <Brain size={24} />
            Game Rules & Objective
          </h2>
          <button 
            onClick={() => setShowRules(false)}
            className="close-button"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="rules-content">
          <div className="rules-section">
            <h3><Target size={20} />OBJECTIVE</h3>
            <p>Think like others! The goal is to guess the SAME word as all other players in a round. The game continues until everyone synchronizes their minds!</p>
          </div>
          
          <div className="rules-section">
            <h3><Timer size={20} />HOW TO PLAY</h3>
            <ul>
              <li>Each round, you have 30 seconds to think of a word</li>
              <li>Try to guess what word others might be thinking</li>
              <li>Submit your word before time runs out</li>
              <li>The game ends when ALL players submit the same word</li>
            </ul>
          </div>
          
          <div className="rules-section">
            <h3><Award size={20} />SCORING SYSTEM</h3>
            <ul>
              <li>You get 10 points for each player who matches your word</li>
              <li>If 3 players pick "CAT", each gets 30 points (3 × 10)</li>
              <li>No points for unique words that nobody else picked</li>
              <li>Higher scores = better mind-reading skills!</li>
            </ul>
          </div>
          
          <div className="rules-section win-condition">
            <h3><Trophy size={20} />WIN CONDITION</h3>
            <p className="win-text">Game ends when ALL players submit the EXACT same word in any round. True mind synchronization!</p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );

  return (
    <div className="app">
      <AnimatePresence mode="wait">
        {showRules && <RulesModal />}
        
        {gameState === 'home' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="game-screen"
          >
            <div className="game-card">
              <div className="game-header">
                <h1 className="game-title">
                  <span className="neon-text">MIND</span>
                  <span className="neon-text-alt">SYNC</span>
                </h1>
                <p className="game-subtitle">Think alike, win together</p>
                <button 
                  onClick={() => setShowRules(true)}
                  className="rules-button"
                >
                  <Info size={18} />
                  How to Play
                </button>
              </div>

              <div className="form-section">
                <input
                  type="text"
                  placeholder="Enter your nickname"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className="game-input"
                  maxLength={20}
                />

                <div className="button-group">
                  <button 
                    onClick={createRoom}
                    disabled={!nickname.trim()}
                    className="game-button primary"
                  >
                    Create Room
                  </button>
                  
                  <div className="join-section">
                    <input
                      type="text"
                      placeholder="Room ID"
                      value={roomId}
                      onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                      className="game-input small"
                      maxLength={8}
                    />
                    <button 
                      onClick={joinRoom}
                      disabled={!nickname.trim() || !roomId.trim()}
                      className="game-button secondary"
                    >
                      Join Room
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="error-message">
                    {error}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
        
        {gameState === 'lobby' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="game-screen"
          >
            <div className="game-card">
              <div className="lobby-header">
                <h2 className="room-title">Room {roomId}</h2>
                <button 
                  onClick={copyRoomId}
                  className="copy-button"
                >
                  {copied ? <Check size={20} /> : <Copy size={20} />}
                </button>
              </div>

              <div className="players-section">
                <h3 className="section-title">
                  <Users size={20} />
                  Players ({gameData?.players?.length || 0}/6)
                </h3>
                
                <div className="players-list">
                  {gameData?.players?.map((player, index) => (
                    <div key={player.id} className="player-card">
                      <span className="player-name">{player.nickname}</span>
                      {player.isHost && <Crown size={16} className="crown-icon" />}
                    </div>
                  ))}
                </div>
              </div>

              <div className="lobby-actions">
                {isHost && (
                  <button 
                    onClick={startGame}
                    disabled={!gameData?.players || gameData.players.length < 2}
                    className="game-button primary large"
                  >
                    Start Game
                  </button>
                )}
                
                <button 
                  onClick={goHome}
                  className="game-button secondary"
                >
                  <Home size={20} />
                  Leave Room
                </button>
              </div>
            </div>
          </motion.div>
        )}
        
        {gameState === 'playing' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="game-screen"
          >
            <div className="game-card">
              <div className="game-info">
                <div className="round-info">
                  <h2 className="round-title">Round {gameData?.currentRound}</h2>
                  <p className="round-subtitle">Think of a word everyone might choose</p>
                </div>
                
                <div className="timer-section">
                  <div className="timer">
                    <Clock size={24} />
                    <span className="timer-text">{formatTime(timeLeft)}</span>
                  </div>
                </div>
              </div>

              <div className="word-input-section">
                <div className="input-group">
                  <input
                    type="text"
                    placeholder="Enter your word..."
                    value={currentWord}
                    onChange={(e) => setCurrentWord(e.target.value)}
                    onKeyPress={(e) => handleKeyPress(e, submitWord)}
                    disabled={wordSubmitted}
                    className="game-input large"
                    maxLength={50}
                    autoFocus
                  />
                  <button 
                    onClick={submitWord}
                    disabled={!currentWord.trim() || wordSubmitted}
                    className="game-button primary"
                  >
                    <Send size={20} />
                    {wordSubmitted ? 'Submitted' : 'Submit'}
                  </button>
                </div>
                
                {wordSubmitted && (
                  <div className="submission-status">
                    Word submitted! Waiting for other players...
                  </div>
                )}
              </div>

              {roundResults && (
                <div className="round-results">
                  <h3 className="results-title">Round {roundResults.round} Results</h3>
                  
                  <div className="submissions">
                    <h4>What Everyone Picked:</h4>
                    {Object.entries(roundResults.submissions).map(([playerId, word]) => {
                      const player = gameData?.players?.find(p => p.id === playerId);
                      return (
                        <div key={playerId} className="submission-item">
                          <span className="player-name">{player?.nickname}</span>
                          <span className="submitted-word">"{word}"</span>
                        </div>
                      );
                    })}
                  </div>

                  {roundResults.matches.length > 0 && (
                    <div className="matches">
                      <h4>Mind Matches Found:</h4>
                      {roundResults.matches.map((match, index) => (
                        <div key={index} className="match-item">
                          <span className="match-word">"{match.word}"</span>
                          <span className="match-players">
                            {match.players.map(pid => {
                              const player = gameData?.players?.find(p => p.id === pid);
                              return player?.nickname;
                            }).join(', ')}
                          </span>
                          <span className="match-points">+{match.points} pts</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {isWaitingForNextRound && (
                    <div className="next-round-waiting">
                      <div className="countdown-circle">
                        <div className="countdown-number">{nextRoundCountdown}</div>
                      </div>
                      <h4 className="next-round-title">Get Ready for Round {gameData?.currentRound + 1}</h4>
                      <p className="next-round-tip">
                        💭 Think of words others might be thinking...
                        <br />
                        🔮 Common words, popular things, obvious choices
                        <br />
                        🎯 What would YOU pick if you were them?
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
        
        {gameState === 'results' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="game-screen"
          >
            <div className="game-card">
              <div className="results-header">
                <Trophy size={48} className="trophy-icon" />
                <h2 className="results-title">Game Complete!</h2>
              </div>

              <div className="final-scores">
                <h3 className="section-title">Final Scores</h3>
                <div className="scores-list">
                  {finalResults?.finalScores?.map((player, index) => (
                    <div key={player.playerId} className={`score-item ${index === 0 ? 'winner' : ''}`}>
                      <div className="rank">
                        {index === 0 && <Star size={20} className="star-icon" />}
                        #{index + 1}
                      </div>
                      <span className="player-name">{player.nickname}</span>
                      <span className="player-score">{player.score} pts</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="results-actions">
                <button 
                  onClick={goHome}
                  className="game-button primary large"
                >
                  <Home size={20} />
                  Play Again
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;

const crypto = require('crypto');
const { Game } = require('../models');

class MathTicTacToeService {
  constructor() {
    this.games = new Map();
    this.taskTimeLimitSeconds = 10;
    this.turnTimeLimitSeconds = 30;
    this.allowedSizes = [3, 4, 5];
    this.allowedDifficulties = ['easy', 'medium', 'hard'];
  }

  async getGameContainer(gameId) {
    if (this.games.has(gameId)) {
      return this.games.get(gameId);
    }

    const game = await Game.findByPk(gameId);
    if (!game) {
      throw new Error('Игра не найдена');
    }

    const container = {
      gameId,
      sessions: new Map(),
    };
    this.games.set(gameId, container);
    return container;
  }

  createInitialState(gameId, leader, options = {}) {
    const boardSize = this.normalizeBoardSize(options.boardSize);
    const difficulty = this.normalizeDifficulty(options.difficulty);
    const player = this.createPlayer(leader, 'X');

    return {
      gameId,
      sessionId: crypto.randomUUID(),
      leaderId: leader.id,
      players: [player],
      boardSize,
      difficulty,
      lineLength: boardSize,
      board: this.createBoard(boardSize),
      status: 'waiting',
      activePlayerId: null,
      turnExpiresAt: null,
      winner: null,
      winningCells: [],
      moveCount: 0,
      pendingQuestion: null,
      updatedAt: Date.now(),
      createdAt: Date.now(),
    };
  }

  createPlayer(user, symbol) {
    return {
      id: user.id,
      name: user.username,
      symbol,
      isReady: false,
      wantsRematch: false,
    };
  }

  createBoard(boardSize) {
    return Array.from({ length: boardSize }, () =>
      Array.from({ length: boardSize }, () => null)
    );
  }

  normalizeBoardSize(boardSize) {
    const value = Number(boardSize);
    return this.allowedSizes.includes(value) ? value : 3;
  }

  normalizeDifficulty(difficulty) {
    return this.allowedDifficulties.includes(difficulty) ? difficulty : 'easy';
  }

  updateTimestamp(state) {
    state.updatedAt = Date.now();
  }

  async listSessions(gameId, userId) {
    const container = await this.getGameContainer(gameId);
    const sessions = [...container.sessions.values()];

    sessions.forEach((session) => this.syncTimeout(session));
    this.deleteEmptySessions(container);

    return [...container.sessions.values()].map((session) => ({
      sessionId: session.sessionId,
      leaderId: session.leaderId,
      leaderName: session.players.find((player) => player.id === session.leaderId)?.name || null,
      players: session.players.map((player) => ({
        id: player.id,
        name: player.name,
        symbol: player.symbol,
      })),
      playersCount: session.players.length,
      maxPlayers: 2,
      status: session.status,
      boardSize: session.boardSize,
      difficulty: session.difficulty,
      isCurrentPlayer: session.players.some((player) => player.id === userId),
      canJoin: session.status === 'waiting' && session.players.length < 2,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    }));
  }

  async createSession(gameId, user, options = {}) {
    const container = await this.getGameContainer(gameId);
    const existingSession = this.findPlayerSession(container, user.id);
    if (existingSession) {
      return this.toDto(existingSession, user.id);
    }

    const session = this.createInitialState(gameId, user, options);
    container.sessions.set(session.sessionId, session);
    return this.toDto(session, user.id);
  }

  async joinGame(gameId, user) {
    const container = await this.getGameContainer(gameId);
    const existingSession = this.findPlayerSession(container, user.id);
    if (existingSession) {
      this.syncTimeout(existingSession);
      return this.toDto(existingSession, user.id);
    }

    const joinableSession = [...container.sessions.values()].find(
      (session) => session.status === 'waiting' && session.players.length < 2
    );

    if (joinableSession) {
      return this.joinSession(gameId, joinableSession.sessionId, user);
    }

    return this.createSession(gameId, user);
  }

  async joinSession(gameId, sessionId, user) {
    const container = await this.getGameContainer(gameId);
    const existingSession = this.findPlayerSession(container, user.id);
    if (existingSession) {
      if (existingSession.sessionId === sessionId) {
        this.syncTimeout(existingSession);
        return this.toDto(existingSession, user.id);
      }

      throw new Error('Сначала покиньте текущую сессию');
    }

    const session = this.getSession(container, sessionId);
    this.syncTimeout(session);

    if (session.status !== 'waiting') {
      throw new Error('Матч в этой сессии уже начался');
    }

    if (session.players.length >= 2) {
      throw new Error('Сессия заполнена');
    }

    session.players.push(this.createPlayer(user, 'O'));
    this.updateTimestamp(session);
    return this.toDto(session, user.id);
  }

  async getState(gameId, userId, sessionId) {
    const container = await this.getGameContainer(gameId);
    const session = this.resolveSession(container, userId, sessionId);
    this.syncTimeout(session);
    return this.toDto(session, userId);
  }

  async updateSettings(gameId, userId, options = {}) {
    const container = await this.getGameContainer(gameId);
    const session = this.resolveSession(container, userId, options.sessionId);
    this.syncTimeout(session);
    this.ensureLeader(session, userId);

    if (session.status === 'playing') {
      throw new Error('Нельзя менять настройки после старта матча');
    }

    const boardSize = this.normalizeBoardSize(options.boardSize ?? session.boardSize);
    const difficulty = this.normalizeDifficulty(options.difficulty ?? session.difficulty);

    session.boardSize = boardSize;
    session.difficulty = difficulty;
    session.lineLength = boardSize;
    session.board = this.createBoard(boardSize);
    session.winner = null;
    session.winningCells = [];
    session.moveCount = 0;
    session.pendingQuestion = null;
    session.activePlayerId = null;
    session.turnExpiresAt = null;
    session.status = 'waiting';

    session.players.forEach((player) => {
      player.isReady = false;
      player.wantsRematch = false;
    });

    this.updateTimestamp(session);
    return this.toDto(session, userId);
  }

  async setReady(gameId, userId, isReady = true, sessionId) {
    const container = await this.getGameContainer(gameId);
    const session = this.resolveSession(container, userId, sessionId);
    this.syncTimeout(session);
    const player = this.getPlayer(session, userId);

    if (session.status === 'finished') {
      throw new Error('Матч уже завершён. Запросите реванш, чтобы сыграть снова');
    }

    player.isReady = Boolean(isReady);
    this.updateTimestamp(session);

    if (session.players.length === 2 && session.players.every((item) => item.isReady)) {
      this.startMatch(session);
    }

    return {
      started: session.status === 'playing',
      state: this.toDto(session, userId),
    };
  }

  startMatch(session) {
    session.status = 'playing';
    session.board = this.createBoard(session.boardSize);
    session.lineLength = session.boardSize;
    session.activePlayerId = session.players[0]?.id || null;
    session.turnExpiresAt = Date.now() + this.turnTimeLimitSeconds * 1000;
    session.pendingQuestion = null;
    session.moveCount = 0;
    session.winner = null;
    session.winningCells = [];

    session.players.forEach((player) => {
      player.wantsRematch = false;
    });

    this.updateTimestamp(session);
  }

  async requestMove(gameId, userId, row, col, sessionId) {
    const container = await this.getGameContainer(gameId);
    const session = this.resolveSession(container, userId, sessionId);
    this.syncTimeout(session);
    this.ensureGamePlaying(session);
    this.ensurePlayerTurn(session, userId);

    if (session.pendingQuestion) {
      throw new Error('Сначала завершите текущую задачу');
    }

    this.validateCell(session, row, col);

    if (session.board[row][col]) {
      throw new Error('Эта клетка уже занята');
    }

    const { task, answer } = this.generateTask(session.difficulty);
    session.pendingQuestion = {
      playerId: userId,
      row,
      col,
      task,
      answer,
      expiresAt: Date.now() + this.taskTimeLimitSeconds * 1000,
    };

    this.updateTimestamp(session);

    return {
      success: true,
      task,
      timeLimit: this.taskTimeLimitSeconds,
      state: this.toDto(session, userId),
    };
  }

  async submitAnswer(gameId, userId, answer, sessionId) {
    const container = await this.getGameContainer(gameId);
    const session = this.resolveSession(container, userId, sessionId);
    this.syncTimeout(session);
    this.ensureGamePlaying(session);
    this.ensurePendingQuestionForPlayer(session, userId);

    const pendingQuestion = session.pendingQuestion;
    const player = this.getPlayer(session, userId);
    const normalizedAnswer = Number(answer);
    const wasCorrect =
      Number.isFinite(normalizedAnswer) && normalizedAnswer === pendingQuestion.answer;

    let resultMessage = '';

    if (wasCorrect) {
      session.board[pendingQuestion.row][pendingQuestion.col] = player.symbol;
      session.moveCount += 1;

      const winnerPayload = this.findWinner(session, pendingQuestion.row, pendingQuestion.col);
      if (winnerPayload) {
        session.status = 'finished';
        session.winner = {
          playerId: player.id,
          name: player.name,
          symbol: player.symbol,
          type: 'winner',
          message: `${player.name} победил`,
        };
        session.winningCells = winnerPayload.cells;
        session.pendingQuestion = null;
        session.turnExpiresAt = null;
        this.updateTimestamp(session);
        return {
          success: true,
          wasCorrect: true,
          finished: true,
          state: this.toDto(session, userId),
        };
      }

      if (session.moveCount === session.boardSize * session.boardSize) {
        session.status = 'finished';
        session.winner = {
          type: 'draw',
          message: 'Ничья',
        };
        session.winningCells = [];
        session.pendingQuestion = null;
        session.turnExpiresAt = null;
        this.updateTimestamp(session);
        return {
          success: true,
          wasCorrect: true,
          finished: true,
          state: this.toDto(session, userId),
        };
      }

      resultMessage = 'Верный ответ';
    } else {
      resultMessage = 'Неверный ответ. Ход переходит сопернику';
    }

    session.pendingQuestion = null;
    this.finishTurn(session);
    this.updateTimestamp(session);

    return {
      success: true,
      wasCorrect,
      message: resultMessage,
      finished: false,
      state: this.toDto(session, userId),
    };
  }

  async timeout(gameId, userId, sessionId) {
    const container = await this.getGameContainer(gameId);
    const session = this.resolveSession(container, userId, sessionId);
    this.syncTimeout(session);
    this.ensureGamePlaying(session);

    if (session.pendingQuestion) {
      this.ensurePendingQuestionForPlayer(session, userId);
      session.pendingQuestion = null;
      this.finishTurn(session);
    } else {
      this.ensurePlayerTurn(session, userId);
      this.finishTurn(session);
    }

    this.updateTimestamp(session);

    return {
      success: true,
      message: 'Время вышло. Ход переходит сопернику',
      state: this.toDto(session, userId),
    };
  }

  async leaveGame(gameId, userId, sessionId) {
    const container = await this.getGameContainer(gameId);
    const session = this.resolveSession(container, userId, sessionId);
    this.syncTimeout(session);
    const player = this.getPlayer(session, userId);
    const opponent = session.players.find((item) => item.id !== userId);

    if (!opponent) {
      session.players = session.players.filter((item) => item.id !== userId);
      this.deleteEmptySessions(container);
      return {
        success: true,
        state: null,
      };
    }

    session.status = 'finished';
    session.leaderId = opponent.id;
    session.winner = {
      playerId: opponent.id,
      name: opponent.name,
      symbol: opponent.symbol,
      type: 'forfeit',
      message: `${opponent.name} победил: ${player.name} покинул игру`,
    };
    session.pendingQuestion = null;
    session.activePlayerId = null;
    session.turnExpiresAt = null;
    session.winningCells = [];
    session.players = [opponent];

    session.players.forEach((item) => {
      item.isReady = false;
      item.wantsRematch = false;
    });

    this.updateTimestamp(session);
    return {
      success: true,
      state: null,
    };
  }

  async rematch(gameId, userId, sessionId) {
    const container = await this.getGameContainer(gameId);
    const session = this.resolveSession(container, userId, sessionId);
    this.syncTimeout(session);
    const player = this.getPlayer(session, userId);

    if (session.status !== 'finished') {
      throw new Error('Реванш доступен только после окончания партии');
    }

    player.wantsRematch = true;
    this.updateTimestamp(session);

    if (session.players.length === 2 && session.players.every((item) => item.wantsRematch)) {
      session.players = [session.players[1], session.players[0]].map((item) => ({
        ...item,
        symbol: item.symbol === 'X' ? 'O' : 'X',
        isReady: true,
        wantsRematch: false,
      }));
      session.leaderId = session.players[0].id;
      this.startMatch(session);
    }

    return {
      restarted: session.status === 'playing',
      state: this.toDto(session, userId),
    };
  }

  getSession(container, sessionId) {
    const session = container.sessions.get(sessionId);
    if (!session) {
      throw new Error('Сессия не найдена');
    }
    return session;
  }

  findPlayerSession(container, userId) {
    return [...container.sessions.values()].find((session) =>
      session.players.some((player) => player.id === userId)
    );
  }

  resolveSession(container, userId, sessionId) {
    const session = sessionId
      ? this.getSession(container, sessionId)
      : this.findPlayerSession(container, userId);

    if (!session) {
      throw new Error('Сначала создайте сессию или подключитесь к существующей');
    }

    this.getPlayer(session, userId);
    return session;
  }

  deleteEmptySessions(container) {
    [...container.sessions.entries()].forEach(([sessionId, session]) => {
      if (session.players.length === 0) {
        container.sessions.delete(sessionId);
      }
    });
  }

  getPlayer(session, userId) {
    const player = session.players.find((item) => item.id === userId);
    if (!player) {
      throw new Error('Игрок не найден');
    }
    return player;
  }

  ensureLeader(session, userId) {
    if (session.leaderId !== userId) {
      throw new Error('Настройки может менять только лидер сессии');
    }
  }

  ensureGamePlaying(session) {
    if (session.status === 'finished') {
      throw new Error('Матч уже завершён');
    }

    if (session.status !== 'playing') {
      throw new Error('Матч начнётся, когда оба игрока будут готовы');
    }
  }

  ensurePlayerTurn(session, userId) {
    if (session.activePlayerId !== userId) {
      throw new Error('Сейчас ход другого игрока');
    }
  }

  ensurePendingQuestionForPlayer(session, userId) {
    if (!session.pendingQuestion || session.pendingQuestion.playerId !== userId) {
      throw new Error('Для вас нет активной задачи');
    }
  }

  validateCell(session, row, col) {
    const normalizedRow = Number(row);
    const normalizedCol = Number(col);

    if (
      !Number.isInteger(normalizedRow) ||
      !Number.isInteger(normalizedCol) ||
      normalizedRow < 0 ||
      normalizedCol < 0 ||
      normalizedRow >= session.boardSize ||
      normalizedCol >= session.boardSize
    ) {
      throw new Error('Некорректная клетка');
    }
  }

  finishTurn(session) {
    if (session.players.length < 2) {
      session.activePlayerId = null;
      session.turnExpiresAt = null;
      return;
    }

    const currentIndex = session.players.findIndex((item) => item.id === session.activePlayerId);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % session.players.length;
    session.activePlayerId = session.players[nextIndex].id;
    session.turnExpiresAt = Date.now() + this.turnTimeLimitSeconds * 1000;
  }

  syncTimeout(session) {
    if (session.status !== 'playing') {
      return;
    }

    if (session.pendingQuestion) {
      if (Date.now() < session.pendingQuestion.expiresAt) {
        return;
      }

      session.pendingQuestion = null;
      this.finishTurn(session);
      this.updateTimestamp(session);
      return;
    }

    if (session.turnExpiresAt && Date.now() >= session.turnExpiresAt) {
      this.finishTurn(session);
      this.updateTimestamp(session);
    }
  }

  findWinner(session, row, col) {
    const symbol = session.board[row][col];
    if (!symbol) {
      return null;
    }

    const directions = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ];

    for (const [dx, dy] of directions) {
      const cells = [{ row, col }];
      cells.push(...this.collectDirection(session, row, col, dx, dy, symbol));
      cells.unshift(...this.collectDirection(session, row, col, -dx, -dy, symbol));

      if (cells.length >= session.lineLength) {
        return { cells: cells.slice(0, session.lineLength) };
      }
    }

    return null;
  }

  collectDirection(session, row, col, dx, dy, symbol) {
    const cells = [];
    let currentRow = row + dx;
    let currentCol = col + dy;

    while (
      currentRow >= 0 &&
      currentCol >= 0 &&
      currentRow < session.boardSize &&
      currentCol < session.boardSize &&
      session.board[currentRow][currentCol] === symbol
    ) {
      cells.push({ row: currentRow, col: currentCol });
      currentRow += dx;
      currentCol += dy;
    }

    return cells;
  }

  generateTask(difficulty) {
    const normalizedDifficulty = this.normalizeDifficulty(difficulty);

    if (normalizedDifficulty === 'easy') {
      const a = this.randomInt(1, 9);
      const b = this.randomInt(1, 9);
      return { task: `${a} + ${b}`, answer: a + b };
    }

    if (normalizedDifficulty === 'medium') {
      const a = this.randomInt(5, 25);
      const b = this.randomInt(1, 15);
      const c = this.randomInt(1, 10);
      const firstOperator = this.randomChoice(['+', '-']);
      const secondOperator = this.randomChoice(['+', '-']);
      const tokens = [String(a), firstOperator, String(b), secondOperator, String(c)];

      return {
        task: tokens.join(' '),
        answer: this.evaluateExpression(tokens),
      };
    }

    return this.generateHardTask();
  }

  generateHardTask() {
    const operators = ['+', '-', '*', '/'];

    for (let attempt = 0; attempt < 100; attempt += 1) {
      const numbers = [
        this.randomInt(2, 20),
        this.randomInt(1, 12),
        this.randomInt(1, 12),
      ];
      const selectedOperators = [
        this.randomChoice(operators),
        this.randomChoice(operators),
      ];

      const tokens = [
        String(numbers[0]),
        selectedOperators[0],
        String(numbers[1]),
        selectedOperators[1],
        String(numbers[2]),
      ];

      if (!this.isValidDivisionExpression(tokens)) {
        continue;
      }

      const answer = this.evaluateExpression(tokens);
      return {
        task: tokens
          .join(' ')
          .replaceAll('*', '×')
          .replaceAll('/', '÷'),
        answer,
      };
    }

    const fallback = ['12', '+', '3', '*', '2'];
    return {
      task: '12 + 3 × 2',
      answer: this.evaluateExpression(fallback),
    };
  }

  isValidDivisionExpression(tokens) {
    const workTokens = [...tokens];

    for (let index = 1; index < workTokens.length; index += 2) {
      const operator = workTokens[index];
      if (operator !== '/') {
        continue;
      }

      const left = Number(workTokens[index - 1]);
      const right = Number(workTokens[index + 1]);
      if (!right || left % right !== 0) {
        return false;
      }

      const value = left / right;
      workTokens.splice(index - 1, 3, String(value));
      index -= 2;
    }

    return true;
  }

  evaluateExpression(tokens) {
    const normalized = tokens.map((token) =>
      token === '×' ? '*' : token === '÷' ? '/' : token
    );
    const workTokens = [...normalized];

    for (let index = 1; index < workTokens.length; index += 2) {
      const operator = workTokens[index];
      if (operator !== '*' && operator !== '/') {
        continue;
      }

      const left = Number(workTokens[index - 1]);
      const right = Number(workTokens[index + 1]);
      const value = operator === '*' ? left * right : left / right;
      workTokens.splice(index - 1, 3, String(value));
      index -= 2;
    }

    let result = Number(workTokens[0]);
    for (let index = 1; index < workTokens.length; index += 2) {
      const operator = workTokens[index];
      const value = Number(workTokens[index + 1]);
      result = operator === '+' ? result + value : result - value;
    }

    return result;
  }

  randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  randomChoice(list) {
    return list[this.randomInt(0, list.length - 1)];
  }

  toDto(session, userId) {
    this.getPlayer(session, userId);

    const pendingQuestion =
      session.pendingQuestion && session.pendingQuestion.playerId === userId
        ? {
            task: session.pendingQuestion.task,
            row: session.pendingQuestion.row,
            col: session.pendingQuestion.col,
            expiresAt: session.pendingQuestion.expiresAt,
            timeLimit: this.taskTimeLimitSeconds,
          }
        : null;

    return {
      matchId: session.sessionId,
      gameId: session.gameId,
      sessionId: session.sessionId,
      playerId: userId,
      leaderId: session.leaderId,
      isLeader: session.leaderId === userId,
      status: session.status,
      boardSize: session.boardSize,
      difficulty: session.difficulty,
      lineLength: session.lineLength,
      board: session.board,
      players: session.players.map((player) => ({ ...player })),
      activePlayerId: session.activePlayerId,
      turnExpiresAt: session.turnExpiresAt,
      turnTimeLimit: this.turnTimeLimitSeconds,
      pendingQuestion,
      hasPendingQuestion: Boolean(session.pendingQuestion),
      moveCount: session.moveCount,
      winner: session.winner,
      winningCells: session.winningCells,
      updatedAt: session.updatedAt,
    };
  }
}

module.exports = new MathTicTacToeService();

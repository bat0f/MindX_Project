const { Game } = require('../models');

class MathTicTacToeService {
  constructor() {
    this.games = new Map();
    this.taskTimeLimitSeconds = 10;
    this.allowedSizes = [3, 4, 5];
    this.allowedDifficulties = ['easy', 'medium', 'hard'];
  }

  async getOrCreateGame(gameId) {
    if (this.games.has(gameId)) {
      return this.games.get(gameId);
    }

    const game = await Game.findByPk(gameId);
    if (!game) {
      throw new Error('Игра не найдена');
    }

    const state = this.createInitialState(gameId);
    this.games.set(gameId, state);
    return state;
  }

  createInitialState(gameId, options = {}) {
    const boardSize = this.normalizeBoardSize(options.boardSize);
    const difficulty = this.normalizeDifficulty(options.difficulty);

    return {
      gameId,
      players: [],
      boardSize,
      difficulty,
      lineLength: boardSize,
      board: this.createBoard(boardSize),
      status: 'waiting',
      activePlayerId: null,
      winner: null,
      winningCells: [],
      moveCount: 0,
      pendingQuestion: null,
      updatedAt: Date.now(),
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

  async joinGame(gameId, user) {
    const state = await this.getOrCreateGame(gameId);
    this.syncTimeout(state);

    let player = state.players.find((item) => item.id === user.id);
    if (!player) {
      if (state.players.length >= 2) {
        throw new Error('Матч уже заполнен');
      }

      player = {
        id: user.id,
        name: user.username,
        symbol: state.players.length === 0 ? 'X' : 'O',
        isReady: false,
        wantsRematch: false,
      };

      state.players.push(player);
      this.updateTimestamp(state);
    }

    return this.toDto(state, user.id);
  }

  async getState(gameId, userId) {
    const state = await this.getOrCreateGame(gameId);
    this.syncTimeout(state);
    this.getPlayer(state, userId);
    return this.toDto(state, userId);
  }

  async updateSettings(gameId, userId, options = {}) {
    const state = await this.getOrCreateGame(gameId);
    this.syncTimeout(state);
    this.getPlayer(state, userId);

    if (state.status === 'playing') {
      throw new Error('Нельзя менять настройки после старта матча');
    }

    const boardSize = this.normalizeBoardSize(options.boardSize ?? state.boardSize);
    const difficulty = this.normalizeDifficulty(options.difficulty ?? state.difficulty);

    state.boardSize = boardSize;
    state.difficulty = difficulty;
    state.lineLength = boardSize;
    state.board = this.createBoard(boardSize);
    state.winner = null;
    state.winningCells = [];
    state.moveCount = 0;
    state.pendingQuestion = null;
    state.activePlayerId = null;
    state.status = 'waiting';

    state.players.forEach((player) => {
      player.isReady = false;
      player.wantsRematch = false;
    });

    this.updateTimestamp(state);
    return this.toDto(state, userId);
  }

  async setReady(gameId, userId, isReady = true) {
    const state = await this.getOrCreateGame(gameId);
    this.syncTimeout(state);
    const player = this.getPlayer(state, userId);

    if (state.status === 'finished') {
      throw new Error('Матч уже завершён. Запросите реванш, чтобы сыграть снова');
    }

    player.isReady = Boolean(isReady);
    this.updateTimestamp(state);

    if (state.players.length === 2 && state.players.every((item) => item.isReady)) {
      this.startMatch(state);
    }

    return {
      started: state.status === 'playing',
      state: this.toDto(state, userId),
    };
  }

  startMatch(state) {
    state.status = 'playing';
    state.board = this.createBoard(state.boardSize);
    state.lineLength = state.boardSize;
    state.activePlayerId = state.players[0]?.id || null;
    state.pendingQuestion = null;
    state.moveCount = 0;
    state.winner = null;
    state.winningCells = [];

    state.players.forEach((player) => {
      player.wantsRematch = false;
    });

    this.updateTimestamp(state);
  }

  async requestMove(gameId, userId, row, col) {
    const state = await this.getOrCreateGame(gameId);
    this.syncTimeout(state);
    this.ensureGamePlaying(state);
    this.ensurePlayerTurn(state, userId);

    if (state.pendingQuestion) {
      throw new Error('Сначала завершите текущую задачу');
    }

    this.validateCell(state, row, col);

    if (state.board[row][col]) {
      throw new Error('Эта клетка уже занята');
    }

    const { task, answer } = this.generateTask(state.difficulty);
    state.pendingQuestion = {
      playerId: userId,
      row,
      col,
      task,
      answer,
      expiresAt: Date.now() + this.taskTimeLimitSeconds * 1000,
    };

    this.updateTimestamp(state);

    return {
      success: true,
      task,
      timeLimit: this.taskTimeLimitSeconds,
      state: this.toDto(state, userId),
    };
  }

  async submitAnswer(gameId, userId, answer) {
    const state = await this.getOrCreateGame(gameId);
    this.syncTimeout(state);
    this.ensureGamePlaying(state);
    this.ensurePendingQuestionForPlayer(state, userId);

    const pendingQuestion = state.pendingQuestion;
    const player = this.getPlayer(state, userId);
    const normalizedAnswer = Number(answer);
    const wasCorrect =
      Number.isFinite(normalizedAnswer) && normalizedAnswer === pendingQuestion.answer;

    let resultMessage = '';

    if (wasCorrect) {
      state.board[pendingQuestion.row][pendingQuestion.col] = player.symbol;
      state.moveCount += 1;

      const winnerPayload = this.findWinner(state, pendingQuestion.row, pendingQuestion.col);
      if (winnerPayload) {
        state.status = 'finished';
        state.winner = {
          playerId: player.id,
          name: player.name,
          symbol: player.symbol,
          type: 'winner',
          message: `${player.name} победил`,
        };
        state.winningCells = winnerPayload.cells;
        state.pendingQuestion = null;
        this.updateTimestamp(state);
        return {
          success: true,
          wasCorrect: true,
          finished: true,
          state: this.toDto(state, userId),
        };
      }

      if (state.moveCount === state.boardSize * state.boardSize) {
        state.status = 'finished';
        state.winner = {
          type: 'draw',
          message: 'Ничья',
        };
        state.winningCells = [];
        state.pendingQuestion = null;
        this.updateTimestamp(state);
        return {
          success: true,
          wasCorrect: true,
          finished: true,
          state: this.toDto(state, userId),
        };
      }

      resultMessage = 'Верный ответ';
    } else {
      resultMessage = 'Неверный ответ. Ход переходит сопернику';
    }

    state.pendingQuestion = null;
    this.finishTurn(state);
    this.updateTimestamp(state);

    return {
      success: true,
      wasCorrect,
      message: resultMessage,
      finished: false,
      state: this.toDto(state, userId),
    };
  }

  async timeout(gameId, userId) {
    const state = await this.getOrCreateGame(gameId);
    this.syncTimeout(state);
    this.ensureGamePlaying(state);
    this.ensurePendingQuestionForPlayer(state, userId);

    state.pendingQuestion = null;
    this.finishTurn(state);
    this.updateTimestamp(state);

    return {
      success: true,
      message: 'Время вышло. Ход переходит сопернику',
      state: this.toDto(state, userId),
    };
  }

  async rematch(gameId, userId) {
    const state = await this.getOrCreateGame(gameId);
    this.syncTimeout(state);
    const player = this.getPlayer(state, userId);

    if (state.status !== 'finished') {
      throw new Error('Реванш доступен только после окончания партии');
    }

    player.wantsRematch = true;
    this.updateTimestamp(state);

    if (state.players.length === 2 && state.players.every((item) => item.wantsRematch)) {
      state.players = [state.players[1], state.players[0]].map((item) => ({
        ...item,
        symbol: item.symbol === 'X' ? 'O' : 'X',
        isReady: true,
        wantsRematch: false,
      }));
      this.startMatch(state);
    }

    return {
      restarted: state.status === 'playing',
      state: this.toDto(state, userId),
    };
  }

  getPlayer(state, userId) {
    const player = state.players.find((item) => item.id === userId);
    if (!player) {
      throw new Error('Игрок не найден');
    }
    return player;
  }

  ensureGamePlaying(state) {
    if (state.status === 'finished') {
      throw new Error('Матч уже завершён');
    }

    if (state.status !== 'playing') {
      throw new Error('Матч начнётся, когда оба игрока будут готовы');
    }
  }

  ensurePlayerTurn(state, userId) {
    if (state.activePlayerId !== userId) {
      throw new Error('Сейчас ход другого игрока');
    }
  }

  ensurePendingQuestionForPlayer(state, userId) {
    if (!state.pendingQuestion || state.pendingQuestion.playerId !== userId) {
      throw new Error('Для вас нет активной задачи');
    }
  }

  validateCell(state, row, col) {
    const normalizedRow = Number(row);
    const normalizedCol = Number(col);

    if (
      !Number.isInteger(normalizedRow) ||
      !Number.isInteger(normalizedCol) ||
      normalizedRow < 0 ||
      normalizedCol < 0 ||
      normalizedRow >= state.boardSize ||
      normalizedCol >= state.boardSize
    ) {
      throw new Error('Некорректная клетка');
    }
  }

  finishTurn(state) {
    if (state.players.length < 2) {
      state.activePlayerId = null;
      return;
    }

    const currentIndex = state.players.findIndex((item) => item.id === state.activePlayerId);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % state.players.length;
    state.activePlayerId = state.players[nextIndex].id;
  }

  syncTimeout(state) {
    if (!state.pendingQuestion) {
      return;
    }

    if (Date.now() < state.pendingQuestion.expiresAt) {
      return;
    }

    state.pendingQuestion = null;

    if (state.status === 'playing') {
      this.finishTurn(state);
    }

    this.updateTimestamp(state);
  }

  findWinner(state, row, col) {
    const symbol = state.board[row][col];
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
      cells.push(...this.collectDirection(state, row, col, dx, dy, symbol));
      cells.unshift(...this.collectDirection(state, row, col, -dx, -dy, symbol));

      if (cells.length >= state.lineLength) {
        return { cells: cells.slice(0, state.lineLength) };
      }
    }

    return null;
  }

  collectDirection(state, row, col, dx, dy, symbol) {
    const cells = [];
    let currentRow = row + dx;
    let currentCol = col + dy;

    while (
      currentRow >= 0 &&
      currentCol >= 0 &&
      currentRow < state.boardSize &&
      currentCol < state.boardSize &&
      state.board[currentRow][currentCol] === symbol
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

  toDto(state, userId) {
    const pendingQuestion =
      state.pendingQuestion && state.pendingQuestion.playerId === userId
        ? {
            task: state.pendingQuestion.task,
            row: state.pendingQuestion.row,
            col: state.pendingQuestion.col,
            expiresAt: state.pendingQuestion.expiresAt,
            timeLimit: this.taskTimeLimitSeconds,
          }
        : null;

    return {
      matchId: state.gameId,
      playerId: userId,
      status: state.status,
      boardSize: state.boardSize,
      difficulty: state.difficulty,
      lineLength: state.lineLength,
      board: state.board,
      players: state.players.map((player) => ({ ...player })),
      activePlayerId: state.activePlayerId,
      pendingQuestion,
      hasPendingQuestion: Boolean(state.pendingQuestion),
      moveCount: state.moveCount,
      winner: state.winner,
      winningCells: state.winningCells,
      updatedAt: state.updatedAt,
    };
  }
}

module.exports = new MathTicTacToeService();

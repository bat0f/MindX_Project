import './mathtictactoe.scss';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { API } from '@mindx/http/API';
import { ROUTES } from '@mindx/utils/consts';
import { getGameLabel } from '@mindx/utils/gameLabels';
import BlockingWindow from '@mindx/components/BlockingWindow/BlockingWindow';
import Loading from '@mindx/components/UI/Loading/Loading';
import { ErrorEmmiter, SuccessEmmiter } from '@mindx/components/UI/Toastify/Notify';

const SETTINGS_OPTIONS = {
  boardSizes: [3, 4, 5],
  difficulties: [
    { value: 'easy', label: 'Лёгкие' },
    { value: 'medium', label: 'Средние' },
    { value: 'hard', label: 'Сложные' },
  ],
};

const getDifficultyLabel = (difficulty) =>
  SETTINGS_OPTIONS.difficulties.find((item) => item.value === difficulty)?.label || difficulty;

const POINTS_BY_DIFFICULTY = {
  easy: 1,
  medium: 1.25,
  hard: 1.5,
};

const BOARD_MULTIPLIERS = {
  3: 1,
  4: 1.2,
  5: 1.4,
};

const MATCH_POINTS = {
  win: 40,
  draw: 10,
  loss: -15,
  forfeitWin: 25,
  quit: -40,
};

const getRatingPoints = (boardSize, difficulty, result) => {
  const multiplier =
    (POINTS_BY_DIFFICULTY[difficulty] || POINTS_BY_DIFFICULTY.easy) *
    (BOARD_MULTIPLIERS[Number(boardSize)] || BOARD_MULTIPLIERS[3]);

  return Math.round(MATCH_POINTS[result] * multiplier);
};

const DEFAULT_TIME_LIMIT = 10;
const DEFAULT_TURN_TIME_LIMIT = 30;
const MathTicTacToe = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [block, setBlock] = useState('');
  const [gameInfo, setGameInfo] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [sessionSearch, setSessionSearch] = useState('');
  const [sessionDifficultyFilter, setSessionDifficultyFilter] = useState('all');
  const [sessionBoardFilter, setSessionBoardFilter] = useState('all');
  const [state, setState] = useState(null);
  const [selectedBoardSize, setSelectedBoardSize] = useState(3);
  const [selectedDifficulty, setSelectedDifficulty] = useState('easy');
  const [isSettingsDirty, setIsSettingsDirty] = useState(false);
  const [answer, setAnswer] = useState('');
  const [timer, setTimer] = useState(DEFAULT_TIME_LIMIT);
  const [turnTimer, setTurnTimer] = useState(DEFAULT_TURN_TIME_LIMIT);
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);

  const pollRef = useRef(null);
  const timerRef = useRef(null);
  const turnTimerRef = useRef(null);
  const answerInputRef = useRef(null);
  const latestStateRef = useRef(null);

  const currentPlayer = useMemo(
    () => state?.players?.find((item) => item.id === state?.playerId) || null,
    [state]
  );

  const opponentPlayer = useMemo(
    () => state?.players?.find((item) => item.id !== state?.playerId) || null,
    [state]
  );

  const activePlayer = useMemo(
    () => state?.players?.find((item) => item.id === state?.activePlayerId) || null,
    [state]
  );
  const filteredSessions = useMemo(() => {
    const search = sessionSearch.trim().toLowerCase();

    return sessions
      .filter((session) => {
        if (!search) {
          return true;
        }

        const names = [
          session.leaderName,
          ...(session.players || []).map((player) => player.name),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return names.includes(search);
      })
      .filter((session) =>
        sessionDifficultyFilter === 'all' ? true : session.difficulty === sessionDifficultyFilter
      )
      .filter((session) =>
        sessionBoardFilter === 'all' ? true : session.boardSize === Number(sessionBoardFilter)
      )
      .sort((firstSession, secondSession) => {
        return secondSession.updatedAt - firstSession.updatedAt;
      });
  }, [sessionBoardFilter, sessionDifficultyFilter, sessionSearch, sessions]);

  const isMyTurn = Boolean(currentPlayer?.id && currentPlayer.id === state?.activePlayerId);
  const isGameStarted = state?.status === 'playing';
  const isGameFinished = state?.status === 'finished';
  const canManageSettings = Boolean(!state || (state.isLeader && state.status === 'waiting'));
  const currentBoardSize = state?.boardSize || selectedBoardSize;
  const currentDifficulty = state?.difficulty || selectedDifficulty;
  const matchRating = useMemo(
    () => ({
      win: getRatingPoints(currentBoardSize, currentDifficulty, 'win'),
      draw: getRatingPoints(currentBoardSize, currentDifficulty, 'draw'),
      loss: getRatingPoints(currentBoardSize, currentDifficulty, 'loss'),
      forfeitWin: getRatingPoints(currentBoardSize, currentDifficulty, 'forfeitWin'),
      quit: getRatingPoints(currentBoardSize, currentDifficulty, 'quit'),
    }),
    [currentBoardSize, currentDifficulty]
  );
  const isChoosingCell = Boolean(isGameStarted && !state?.pendingQuestion && state?.turnExpiresAt);
  const pendingQuestionKey = state?.pendingQuestion
    ? [
        state.pendingQuestion.row,
        state.pendingQuestion.col,
        state.pendingQuestion.task,
        state.pendingQuestion.expiresAt,
      ].join(':')
    : '';

  const updateState = useCallback((nextState) => {
    if (!nextState) {
      return;
    }

    setState(nextState);
    setSelectedBoardSize((currentValue) =>
      isSettingsDirty && nextState.status === 'waiting' ? currentValue : nextState.boardSize || 3
    );
    setSelectedDifficulty((currentValue) =>
      isSettingsDirty && nextState.status === 'waiting' ? currentValue : nextState.difficulty || 'easy'
    );
  }, [isSettingsDirty]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopTurnTimer = useCallback(() => {
    if (turnTimerRef.current) {
      clearInterval(turnTimerRef.current);
      turnTimerRef.current = null;
    }
  }, []);

  const resetTaskState = useCallback(() => {
    stopTimer();
    setAnswer('');
    setTimer(DEFAULT_TIME_LIMIT);
  }, [stopTimer]);

  const handleTimeout = useCallback(async (showToast = true) => {
    try {
      const response = await API.game.timeoutTicTacToe(id, { sessionId: state?.sessionId });
      updateState(response?.state);
      resetTaskState();
      if (showToast) {
        ErrorEmmiter(response?.message || 'Время вышло');
      }
    } catch (error) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        'Не удалось обработать таймаут.';
      ErrorEmmiter(message);
    }
  }, [id, resetTaskState, state?.sessionId, updateState]);

  const startTaskTimer = useCallback((pendingQuestion) => {
    resetTaskState();

    const expiresAt = pendingQuestion?.expiresAt;
    const initialTime = expiresAt
      ? Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))
      : pendingQuestion?.timeLimit || DEFAULT_TIME_LIMIT;

    setTimer(initialTime);

    timerRef.current = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          handleTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [handleTimeout, resetTaskState]);

  const fetchState = useCallback(async ({ silent = true } = {}) => {
    if (!state?.sessionId) {
      return;
    }

    try {
      const response = await API.game.getTicTacToeState(id, state.sessionId);
      updateState(response?.state);
    } catch (error) {
      if (!silent) {
        const message =
          error?.response?.data?.message ||
          error?.response?.data?.error ||
          'Не удалось обновить состояние матча.';
        ErrorEmmiter(message);
      }
    }
  }, [id, state?.sessionId, updateState]);

  const refreshSessions = useCallback(async () => {
    const response = await API.game.getTicTacToeSessions(id);
    const nextSessions = response?.sessions || [];
    setSessions(nextSessions);
    return nextSessions;
  }, [id]);

  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  useEffect(() => {
    return () => {
      const currentState = latestStateRef.current;

      if (currentState?.sessionId) {
        API.game.leaveTicTacToe(id, { sessionId: currentState.sessionId }).catch((error) => {
          console.error(error);
        });
      }
    };
  }, [id]);

  useEffect(() => {
    if (state) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      refreshSessions().catch((error) => {
        console.error(error);
      });
    }, 3000);

    return () => clearInterval(intervalId);
  }, [refreshSessions, state]);

  useEffect(() => {
    let ignore = false;

    const initialize = async () => {
      setLoading(true);
      try {
        const [gameResponse, sessionsResponse] = await Promise.all([
          API.game.getByIdUser(id),
          API.game.getTicTacToeSessions(id),
        ]);

        if (ignore) {
          return;
        }

        setGameInfo(gameResponse);
        const nextSessions = sessionsResponse?.sessions || [];
        setSessions(nextSessions);

        const currentSession = nextSessions.find(
          (session) => session.isCurrentPlayer && session.status !== 'finished'
        );
        if (currentSession) {
          const stateResponse = await API.game.getTicTacToeState(id, currentSession.sessionId);
          if (!ignore) {
            updateState(stateResponse?.state);
          }
        }
      } catch (error) {
        const message =
          error?.response?.data?.message ||
          error?.response?.data?.error ||
          'Не удалось загрузить игру.';

        if (!ignore) {
          setBlock(message);
          ErrorEmmiter(message);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    initialize();

    return () => {
      ignore = true;
      stopTimer();
      stopTurnTimer();
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [id, stopTimer, stopTurnTimer, updateState]);

  useEffect(() => {
    if (!state?.sessionId) {
      return undefined;
    }

    pollRef.current = setInterval(() => {
      fetchState();
    }, 1500);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [fetchState, state?.sessionId]);

  useEffect(() => {
    if (state?.pendingQuestion) {
      startTaskTimer(state.pendingQuestion);
      window.setTimeout(() => answerInputRef.current?.focus(), 0);
      return;
    }

    resetTaskState();
    setIsSubmittingAnswer(false);
    // Depend on a stable question key so polling does not restart the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingQuestionKey, resetTaskState, startTaskTimer]);

  useEffect(() => {
    stopTurnTimer();

    if (!isChoosingCell) {
      setTurnTimer(state?.turnTimeLimit || DEFAULT_TURN_TIME_LIMIT);
      return undefined;
    }

    const updateTurnTimer = () => {
      const nextValue = Math.max(0, Math.ceil((state.turnExpiresAt - Date.now()) / 1000));
      setTurnTimer(nextValue);
    };

    updateTurnTimer();
    turnTimerRef.current = setInterval(updateTurnTimer, 1000);

    return stopTurnTimer;
  }, [isChoosingCell, state?.turnExpiresAt, state?.turnTimeLimit, stopTurnTimer]);

  const handleApplySettings = async () => {
    try {
      const response = await API.game.updateTicTacToeSettings(id, {
        sessionId: state.sessionId,
        boardSize: selectedBoardSize,
        difficulty: selectedDifficulty,
      });
      setIsSettingsDirty(false);
      updateState(response?.state);
      SuccessEmmiter('Настройки матча обновлены');
    } catch (error) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        'Не удалось обновить настройки.';
      ErrorEmmiter(message);
    }
  };

  const handleReady = async () => {
    try {
      const response = await API.game.readyTicTacToe(id, { sessionId: state.sessionId, isReady: true });
      setIsSettingsDirty(false);
      updateState(response?.state);
      SuccessEmmiter(response?.started ? 'Матч начался' : 'Готовность подтверждена');
    } catch (error) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        'Не удалось подтвердить готовность.';
      ErrorEmmiter(message);
    }
  };

  const handleCellClick = async (rowIndex, colIndex) => {
    if (!isMyTurn || !isGameStarted || state?.pendingQuestion || isGameFinished) {
      return;
    }

    try {
      const response = await API.game.moveTicTacToe(id, {
        sessionId: state.sessionId,
        row: rowIndex,
        col: colIndex,
      });
      updateState(response?.state);
      SuccessEmmiter('Решите пример, чтобы занять клетку');
    } catch (error) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        'Не удалось начать ход.';
      ErrorEmmiter(message);
    }
  };

  const handleSubmitAnswer = async () => {
    if (isSubmittingAnswer) {
      return;
    }

    if (answer === '') {
      ErrorEmmiter('Введите ответ');
      return;
    }

    try {
      setIsSubmittingAnswer(true);
      const response = await API.game.answerTicTacToe(id, {
        sessionId: state.sessionId,
        answer: Number(answer),
      });
      updateState(response?.state);
      resetTaskState();
      SuccessEmmiter(response?.wasCorrect ? 'Верно!' : response?.message || 'Неверно');
    } catch (error) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        'Не удалось отправить ответ.';
      ErrorEmmiter(message);
    } finally {
      setIsSubmittingAnswer(false);
    }
  };

  const handleRematch = async () => {
    try {
      const response = await API.game.rematchTicTacToe(id, { sessionId: state.sessionId });
      updateState(response?.state);
      SuccessEmmiter(response?.reset ? 'Настройте новый матч' : 'Ждём подтверждения соперника');
    } catch (error) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        'Не удалось запросить реванш.';
      ErrorEmmiter(message);
    }
  };

  const getCellClassName = (rowIndex, colIndex, value) => {
    const isWinningCell = (state?.winningCells || []).some(
      (cell) => cell.row === rowIndex && cell.col === colIndex
    );
    const isPendingCell =
      state?.pendingQuestion?.row === rowIndex && state?.pendingQuestion?.col === colIndex;

    return [
      'ttt-cell',
      value ? `filled ${value === 'X' ? 'x-cell' : 'o-cell'}` : '',
      isPendingCell ? 'pending-cell' : '',
      isWinningCell ? 'winner-cell' : '',
    ]
      .filter(Boolean)
      .join(' ');
  };

  const renderResultText = () => {
    if (!state?.winner) {
      return 'Партия завершена';
    }

    if (state.winner.type === 'draw') {
      return 'Ничья';
    }

    if (state.winner.type === 'forfeit') {
      return state.winner.message;
    }

    const isMyWin = state.winner.playerId === state.playerId;
    return isMyWin ? 'Вы победили' : `Победил ${state.winner.name}`;
  };

  const getWinningLineCoords = () => {
    const cells = state?.winningCells || [];
    const size = state?.boardSize || selectedBoardSize;

    if (cells.length < 2 || !size) {
      return null;
    }

    const sortedCells = [...cells].sort((firstCell, secondCell) => {
      if (firstCell.row !== secondCell.row) {
        return firstCell.row - secondCell.row;
      }

      return firstCell.col - secondCell.col;
    });
    const first = sortedCells[0];
    const last = sortedCells[sortedCells.length - 1];
    const startX = ((first.col + 0.5) / size) * 100;
    const startY = ((first.row + 0.5) / size) * 100;
    const endX = ((last.col + 0.5) / size) * 100;
    const endY = ((last.row + 0.5) / size) * 100;
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const length = Math.hypot(deltaX, deltaY);
    const extension = Math.min(100 / size / 2, length / 2);
    const unitX = deltaX / length;
    const unitY = deltaY / length;

    return {
      x1: startX - unitX * extension,
      y1: startY - unitY * extension,
      x2: endX + unitX * extension,
      y2: endY + unitY * extension,
    };
  };

  const handleCreateSession = async () => {
    try {
      const response = await API.game.createTicTacToeSession(id, {
        boardSize: selectedBoardSize,
        difficulty: selectedDifficulty,
      });
      updateState(response?.state);
      await refreshSessions();
    } catch (error) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        'Не удалось создать сессию.';
      ErrorEmmiter(message);
    }
  };

  const handleJoinSession = async (sessionId) => {
    try {
      const response = await API.game.joinTicTacToeSession(id, sessionId);
      updateState(response?.state);
      await refreshSessions();
    } catch (error) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        'Не удалось подключиться к сессии.';
      ErrorEmmiter(message);
    }
  };

  const handleLeaveGame = async () => {
    try {
      const response = await API.game.leaveTicTacToe(id, { sessionId: state.sessionId });
      updateState(response?.state);
      latestStateRef.current = null;
      setState(null);
      await refreshSessions();
    } catch (error) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        'Не удалось покинуть игру.';
      ErrorEmmiter(message);
    }
  };

  const handleReturnToMenu = async () => {
    try {
      await API.game.leaveTicTacToe(id, { sessionId: state.sessionId });
      latestStateRef.current = null;
      setState(null);
      navigate(ROUTES.TICTACTOE_ROUTE);
    } catch (error) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        'Не удалось выйти в меню.';
      ErrorEmmiter(message);
    }
  };

  const winningLineCoords = getWinningLineCoords();
  const winningLineClassName = [
    'ttt-winning-line',
    state?.winner?.symbol === 'O' ? 'o-line' : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (block) {
    return <BlockingWindow message={block} />;
  }

  return (
    <main className="ttt-section">
      {loading && <Loading />}
      <div className="container">
        {!state && (
          <section className="ttt-board-card ttt-session-card">
            <div className="ttt-board-header">
              <div>
                <h2>Сессии</h2>
                <p>Создайте новую сессию со своими настройками или подключитесь к свободной.</p>
              </div>
              <button className="primary-btn" type="button" onClick={handleCreateSession}>
                Создать сессию
              </button>
            </div>

            <div className="ttt-session-filters">
              <label>
                <span>Поиск игрока</span>
                <input
                  type="search"
                  value={sessionSearch}
                  onChange={(event) => setSessionSearch(event.target.value)}
                  placeholder="Имя игрока"
                />
              </label>
              <label>
                <span>Примеры</span>
                <select
                  value={sessionDifficultyFilter}
                  onChange={(event) => setSessionDifficultyFilter(event.target.value)}
                >
                  <option value="all">Все</option>
                  {SETTINGS_OPTIONS.difficulties.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Размер поля</span>
                <select
                  value={sessionBoardFilter}
                  onChange={(event) => setSessionBoardFilter(event.target.value)}
                >
                  <option value="all">Все</option>
                  {SETTINGS_OPTIONS.boardSizes.map((size) => (
                    <option key={size} value={size}>
                      {size}x{size}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="ttt-session-list">
              {filteredSessions.length === 0 && (
                <div className="ttt-session-empty">Пока нет активных сессий.</div>
              )}
              {filteredSessions.map((session) => (
                <div className="ttt-session-item" key={session.sessionId}>
                  <div>
                    <strong>{session.leaderName || 'Сессия'}</strong>
                    <span>
                      {session.playersCount}/{session.maxPlayers} игрока, поле {session.boardSize}x{session.boardSize}
                    </span>
                    {Boolean(session.players?.length) && (
                      <small>{session.players.map((player) => player.name).join(', ')}</small>
                    )}
                    <small>Примеры: {getDifficultyLabel(session.difficulty)}</small>
                  </div>
                  <button
                    className="secondary-btn"
                    type="button"
                    disabled={!session.canJoin && !session.isCurrentPlayer}
                    onClick={() => handleJoinSession(session.sessionId)}
                  >
                    {session.isCurrentPlayer ? 'Вернуться' : 'Подключиться'}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
        {state && (
          <>
        <div className="ttt-layout">
          <section className="ttt-hero-card">
            <span className="ttt-badge">Онлайн-игра в реальном времени</span>
            <h1>{getGameLabel(gameInfo) || 'Крестики-нолики'}</h1>
            <p className="ttt-description">
              Перед каждым ходом игрок выбирает клетку, куда хочет поставить свой символ, и решает
              математический пример. Верный ответ даёт право занять клетку, неверный ответ или
              таймаут в 10 секунд передают ход сопернику.
            </p>

            <div className="ttt-meta">
              <div className="ttt-meta-item ttt-meta-logo-card">
                <span>Режим</span>
                <strong className="ttt-meta-logo">XO</strong>
                <small>дуэль на точность</small>
              </div>
              <div className="ttt-meta-item">
                <span>Поле</span>
                <strong>{currentBoardSize}x{currentBoardSize}</strong>
                <small>для победы собери {state?.lineLength || currentBoardSize} игровых символа в ряд</small>
              </div>
              <div className="ttt-meta-item">
                <span>Примеры</span>
                <strong>{getDifficultyLabel(currentDifficulty)}</strong>
                <small>влияет на рейтинг</small>
              </div>
              <div className="ttt-meta-item">
                <span>Победа</span>
                <strong>+{matchRating.win}</strong>
                <small>+{matchRating.forfeitWin}, если соперник вышел</small>
              </div>
              <div className="ttt-meta-item">
                <span>Ничья</span>
                <strong>{matchRating.draw >= 0 ? '+' : ''}{matchRating.draw}</strong>
                <small>оба игрока получают одинаково</small>
              </div>
              <div className="ttt-meta-item">
                <span>Поражение</span>
                <strong>{matchRating.loss}</strong>
                <small>{matchRating.quit} за выход после старта</small>
              </div>
            </div>
            <p className="ttt-advice">
              Побеждает не тот, кто спешит, а тот, кто видит поле на ход вперёд.
            </p>
          </section>

          <aside className="ttt-sidebar">
            <div className="ttt-panel">
              <h2>Игроки</h2>
              <div className="ttt-player-card self">
                <span>Вы</span>
                <strong>{currentPlayer?.name || 'Подключение...'}</strong>
                <small>{currentPlayer?.symbol ? `Символ: ${currentPlayer.symbol}` : 'Ожидание'}</small>
              </div>
              <div className="ttt-player-card">
                <span>Соперник</span>
                <strong>{opponentPlayer?.name || 'Ожидание второго игрока'}</strong>
                <small>{opponentPlayer?.symbol ? `Символ: ${opponentPlayer.symbol}` : 'Не подключился'}</small>
              </div>

              <div className={`ttt-turn ${isMyTurn ? 'mine' : ''}`}>
                {isGameFinished
                  ? renderResultText()
                  : activePlayer?.name
                    ? isMyTurn
                      ? 'Сейчас ваш ход'
                      : `Сейчас ходит ${activePlayer.name}`
                    : 'Матч начнётся, когда оба игрока будут готовы'}
              </div>
              {isChoosingCell && (
                <div className={`ttt-turn-timer ${turnTimer <= 5 ? 'danger' : ''}`}>
                  <span>Время на ход</span>
                  <strong>{turnTimer} сек.</strong>
                </div>
              )}
              {!isGameFinished && currentPlayer && (
                <button className="danger-btn ttt-leave-btn" type="button" onClick={handleLeaveGame}>
                  Покинуть игру
                </button>
              )}
            </div>

            <div className="ttt-panel">
              <h2>Настройки матча</h2>
              <div className="ttt-controls">
                <label>
                  <span>Размер поля</span>
                  <select
                    value={selectedBoardSize}
                    disabled={!canManageSettings}
                    onChange={(event) => {
                      setIsSettingsDirty(true);
                      setSelectedBoardSize(Number(event.target.value));
                    }}
                  >
                    {SETTINGS_OPTIONS.boardSizes.map((size) => (
                      <option key={size} value={size}>
                        {size}x{size}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Примеры</span>
                  <select
                    value={selectedDifficulty}
                    disabled={!canManageSettings}
                    onChange={(event) => {
                      setIsSettingsDirty(true);
                      setSelectedDifficulty(event.target.value);
                    }}
                  >
                    {SETTINGS_OPTIONS.difficulties.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {!isGameStarted && !isGameFinished && (
                <div className="ttt-actions">
                  <button className="primary-btn" onClick={handleApplySettings} disabled={!canManageSettings}>
                    Сохранить настройки
                  </button>
                  <button
                    className="secondary-btn"
                    onClick={handleReady}
                    disabled={!currentPlayer || currentPlayer.isReady}
                  >
                    {currentPlayer?.isReady ? 'Вы готовы' : 'Я готов'}
                  </button>
                </div>
              )}

              {isGameFinished && (
                <div className="ttt-actions">
                  <button className="primary-btn" onClick={handleRematch}>
                    Сыграть снова
                  </button>
                  <button className="secondary-link-btn" type="button" onClick={handleReturnToMenu}>
                    Вернуться в меню
                  </button>
                </div>
              )}
            </div>
          </aside>
        </div>

        <section className="ttt-board-card">
          <div className="ttt-board-header">
            <div>
              <h2>
                Поле {state?.boardSize || selectedBoardSize}x{state?.boardSize || selectedBoardSize}
              </h2>
              <p>
                Для победы нужно собрать {state?.lineLength || selectedBoardSize} символа в ряд
                по горизонтали, вертикали или диагонали.
              </p>
            </div>

            {state?.pendingQuestion && (
              <div className="ttt-task-box">
                <span>Пример</span>
                <strong>{state.pendingQuestion.task}</strong>
                <div className="ttt-answer-row">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        handleSubmitAnswer();
                      }
                    }}
                    placeholder="Ответ"
                    ref={answerInputRef}
                  />
                  <button className="primary-btn" onClick={handleSubmitAnswer} disabled={isSubmittingAnswer}>
                    Ответить
                  </button>
                </div>
                <small>Осталось {timer} сек.</small>
              </div>
            )}
          </div>

          <div
            className="ttt-board"
            style={{
              gridTemplateColumns: `repeat(${state?.boardSize || selectedBoardSize}, minmax(0, 1fr))`,
            }}
          >
            {winningLineCoords && (
              <svg className={winningLineClassName} viewBox="0 0 100 100" preserveAspectRatio="none">
                <line
                  x1={winningLineCoords.x1}
                  y1={winningLineCoords.y1}
                  x2={winningLineCoords.x2}
                  y2={winningLineCoords.y2}
                />
              </svg>
            )}
            {(state?.board || []).map((row, rowIndex) =>
              row.map((value, colIndex) => (
                <button
                  key={`${rowIndex}-${colIndex}`}
                  className={getCellClassName(rowIndex, colIndex, value)}
                  disabled={
                    Boolean(value) ||
                    !isGameStarted ||
                    !isMyTurn ||
                    Boolean(state?.pendingQuestion) ||
                    isGameFinished
                  }
                  onClick={() => handleCellClick(rowIndex, colIndex)}
                >
                  {value || ''}
                </button>
              ))
            )}
          </div>
        </section>
          </>
        )}
      </div>
    </main>
  );
};

export default MathTicTacToe;

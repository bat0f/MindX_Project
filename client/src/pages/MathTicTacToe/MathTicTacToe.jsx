import './mathtictactoe.scss';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import moment from 'moment';
import { API } from '@mindx/http/API';
import { ROUTES } from '@mindx/utils/consts';
import BlockingWindow from '@mindx/components/BlockingWindow/BlockingWindow';
import Loading from '@mindx/components/UI/Loading/Loading';
import { ErrorEmmiter, SuccessEmmiter } from '@mindx/components/UI/Toastify/Notify';

const SETTINGS_OPTIONS = {
  boardSizes: [3, 4, 5],
  difficulties: [
    { value: 'easy', label: 'Лёгкий' },
    { value: 'medium', label: 'Средний' },
    { value: 'hard', label: 'Сложный' },
  ],
};

const DEFAULT_TIME_LIMIT = 10;

const MathTicTacToe = () => {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [block, setBlock] = useState('');
  const [gameInfo, setGameInfo] = useState(null);
  const [state, setState] = useState(null);
  const [selectedBoardSize, setSelectedBoardSize] = useState(3);
  const [selectedDifficulty, setSelectedDifficulty] = useState('easy');
  const [answer, setAnswer] = useState('');
  const [timer, setTimer] = useState(DEFAULT_TIME_LIMIT);

  const pollRef = useRef(null);
  const timerRef = useRef(null);

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

  const isMyTurn = Boolean(currentPlayer?.id && currentPlayer.id === state?.activePlayerId);
  const isGameStarted = state?.status === 'playing';
  const isGameFinished = state?.status === 'finished';

  const updateState = useCallback((nextState) => {
    if (!nextState) {
      return;
    }

    setState(nextState);
    setSelectedBoardSize(nextState.boardSize || 3);
    setSelectedDifficulty(nextState.difficulty || 'easy');
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const resetTaskState = useCallback(() => {
    stopTimer();
    setAnswer('');
    setTimer(DEFAULT_TIME_LIMIT);
  }, [stopTimer]);

  const handleTimeout = useCallback(async (showToast = true) => {
    try {
      const response = await API.game.timeoutTicTacToe(id);
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
  }, [id, resetTaskState, updateState]);

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
    try {
      const response = await API.game.getTicTacToeState(id);
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
  }, [id, updateState]);

  useEffect(() => {
    let ignore = false;

    const initialize = async () => {
      setLoading(true);
      try {
        const [gameResponse, joinResponse] = await Promise.all([
          API.game.getByIdUser(id),
          API.game.joinTicTacToe(id),
        ]);

        if (ignore) {
          return;
        }

        setGameInfo(gameResponse);
        updateState(joinResponse?.state);
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
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [id, stopTimer, updateState]);

  useEffect(() => {
    if (!state?.matchId) {
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
  }, [fetchState, state?.matchId]);

  useEffect(() => {
    if (state?.pendingQuestion) {
      startTaskTimer(state.pendingQuestion);
      return;
    }

    resetTaskState();
  }, [resetTaskState, startTaskTimer, state?.pendingQuestion]);

  const handleApplySettings = async () => {
    try {
      const response = await API.game.updateTicTacToeSettings(id, {
        boardSize: selectedBoardSize,
        difficulty: selectedDifficulty,
      });
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
      const response = await API.game.readyTicTacToe(id, { isReady: true });
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
    if (answer === '') {
      ErrorEmmiter('Введите ответ');
      return;
    }

    try {
      const response = await API.game.answerTicTacToe(id, { answer: Number(answer) });
      updateState(response?.state);
      resetTaskState();
      SuccessEmmiter(response?.wasCorrect ? 'Верно!' : response?.message || 'Неверно');
    } catch (error) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        'Не удалось отправить ответ.';
      ErrorEmmiter(message);
    }
  };

  const handleRematch = async () => {
    try {
      const response = await API.game.rematchTicTacToe(id);
      updateState(response?.state);
      SuccessEmmiter(response?.restarted ? 'Новая партия началась' : 'Ждём подтверждения соперника');
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

    return [
      'ttt-cell',
      value ? `filled ${value === 'X' ? 'x-cell' : 'o-cell'}` : '',
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

    const isMyWin = state.winner.playerId === state.playerId;
    return isMyWin ? 'Вы победили' : `Победил ${state.winner.name}`;
  };

  if (block) {
    return <BlockingWindow message={block} />;
  }

  return (
    <main className="ttt-section">
      {loading && <Loading />}
      <div className="container">
        <div className="ttt-layout">
          <section className="ttt-hero-card">
            <span className="ttt-badge">Онлайн-игра в реальном времени</span>
            <h1>{gameInfo?.name || 'Крестики нолики'}</h1>
            <p className="ttt-description">
              Перед каждым ходом игрок решает математический пример. Верный ответ даёт
              право занять клетку, неверный ответ или таймаут в 10 секунд передают ход
              сопернику.
            </p>

            <div className="ttt-meta">
              <div className="ttt-meta-item">
                <span>Начало</span>
                <strong>
                  {gameInfo?.startDate
                    ? moment(gameInfo.startDate).format('DD.MM.YYYY HH:mm')
                    : '-'}
                </strong>
              </div>
              <div className="ttt-meta-item">
                <span>Окончание</span>
                <strong>
                  {gameInfo?.endDate ? moment(gameInfo.endDate).format('DD.MM.YYYY HH:mm') : '-'}
                </strong>
              </div>
              <div className="ttt-meta-item">
                <span>Линия для победы</span>
                <strong>{state?.lineLength || selectedBoardSize}</strong>
              </div>
            </div>
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
            </div>

            <div className="ttt-panel">
              <h2>Настройки матча</h2>
              <div className="ttt-controls">
                <label>
                  <span>Размер поля</span>
                  <select
                    value={selectedBoardSize}
                    disabled={isGameStarted}
                    onChange={(event) => setSelectedBoardSize(Number(event.target.value))}
                  >
                    {SETTINGS_OPTIONS.boardSizes.map((size) => (
                      <option key={size} value={size}>
                        {size}x{size}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Сложность</span>
                  <select
                    value={selectedDifficulty}
                    disabled={isGameStarted}
                    onChange={(event) => setSelectedDifficulty(event.target.value)}
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
                  <button className="primary-btn" onClick={handleApplySettings}>
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
                  <NavLink to={ROUTES.TICTACTOE_ROUTE} className="secondary-link-btn">
                    Вернуться в меню
                  </NavLink>
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
                    placeholder="Ответ"
                  />
                  <button className="primary-btn" onClick={handleSubmitAnswer}>
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
              gridTemplateColumns: `repeat(${state?.boardSize || selectedBoardSize}, minmax(72px, 1fr))`,
            }}
          >
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
      </div>
    </main>
  );
};

export default MathTicTacToe;

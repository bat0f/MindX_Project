export const GAME_LABELS_BY_TYPE = {
  square: 'Квадрат',
  carousel: 'Карусель',
  invaders: 'Захватчики',
  tictactoe: 'Крестики-нолики',
};

const GAME_LABELS_BY_NAME = {
  'dev math square': GAME_LABELS_BY_TYPE.square,
  'dev math carousel': GAME_LABELS_BY_TYPE.carousel,
  'dev math invaders': GAME_LABELS_BY_TYPE.invaders,
  'dev math tic tac toe': GAME_LABELS_BY_TYPE.tictactoe,
  'крестики нолики': GAME_LABELS_BY_TYPE.tictactoe,
  'крестики-нолики': GAME_LABELS_BY_TYPE.tictactoe,
};

export const getGameLabel = (game) => {
  if (!game) {
    return '';
  }

  if (game.typeGame && GAME_LABELS_BY_TYPE[game.typeGame]) {
    return GAME_LABELS_BY_TYPE[game.typeGame];
  }

  const normalizedName = String(game.name || '').trim().toLowerCase();
  return GAME_LABELS_BY_NAME[normalizedName] || game.name || '';
};

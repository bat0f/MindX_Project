require('dotenv').config();

const sequelize = require('../database');
const {
  Role,
  Game,
  AccessGame,
  Question,
  Theme,
  QuestionGame,
  ThemeGame,
  CarouselData,
  InvadersData,
} = require('../models');

const DEFAULT_USER_ROLE_ID = 'aff50f23-2fbc-41be-ba07-c1c69c5e388c';
const DEFAULT_ADMIN_ROLE_ID = '84f7f8b2-8b3e-4e1f-9f86-9e9d2d5a0b3a';

const daysFromNow = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
};

const ensureRole = async (id, name) => {
  const [role] = await Role.findOrCreate({
    where: { name },
    defaults: { id, name },
  });

  return role;
};

const ensureQuestion = async (question, answer) => {
  const [item] = await Question.findOrCreate({
    where: { question },
    defaults: { question, answer },
  });

  return item;
};

const ensureTheme = async (name) => {
  const [item] = await Theme.findOrCreate({
    where: { name },
    defaults: { name },
  });

  return item;
};

const ensureAccess = async (game, roles) => {
  await Promise.all(
    roles.map((role) =>
      AccessGame.findOrCreate({
        where: { gameId: game.id, roleId: role.id },
        defaults: { gameId: game.id, roleId: role.id },
      })
    )
  );
};

const ensureGame = async ({ typeGame, name, roles }) => {
  const [game] = await Game.findOrCreate({
    where: { name },
    defaults: {
      typeGame,
      name,
      startDate: daysFromNow(-1),
      endDate: daysFromNow(30),
    },
  });

  await ensureAccess(game, roles);

  return game;
};

const ensureQuestionGame = async (game, question, numberQuestion) => {
  await QuestionGame.findOrCreate({
    where: { gameId: game.id, questionId: question.id },
    defaults: {
      gameId: game.id,
      questionId: question.id,
      numberQuestion,
    },
  });
};

const seedSquare = async (roles) => {
  const game = await ensureGame({
    typeGame: 'square',
    name: 'Dev Math Square',
    roles,
  });

  const themes = await Promise.all(
    ['Addition', 'Subtraction', 'Multiplication', 'Division', 'Mixed'].map(ensureTheme)
  );

  await Promise.all(
    themes.map((theme, index) =>
      ThemeGame.findOrCreate({
        where: { gameId: game.id, themeId: theme.id },
        defaults: {
          gameId: game.id,
          themeId: theme.id,
          numberTheme: index + 1,
        },
      })
    )
  );

  const questionData = [
    ['2 + 2', '4'], ['5 + 3', '8'], ['9 + 6', '15'], ['12 + 7', '19'], ['25 + 16', '41'],
    ['9 - 4', '5'], ['15 - 6', '9'], ['20 - 8', '12'], ['31 - 12', '19'], ['50 - 17', '33'],
    ['3 * 3', '9'], ['4 * 5', '20'], ['6 * 7', '42'], ['8 * 9', '72'], ['12 * 11', '132'],
    ['8 / 2', '4'], ['18 / 3', '6'], ['36 / 6', '6'], ['63 / 7', '9'], ['144 / 12', '12'],
    ['2 * 6 + 1', '13'], ['30 - 4 * 5', '10'], ['7 + 8 / 2', '11'], ['5 * 5 - 9', '16'], ['100 / 4 + 6', '31'],
  ];

  const questions = await Promise.all(
    questionData.map(([question, answer]) => ensureQuestion(question, answer))
  );

  await Promise.all(
    questions.map((question, index) => ensureQuestionGame(game, question, index + 1))
  );
};

const seedCarousel = async (roles) => {
  const game = await ensureGame({
    typeGame: 'carousel',
    name: 'Dev Math Carousel',
    roles,
  });

  await CarouselData.findOrCreate({
    where: { gameId: game.id },
    defaults: {
      gameId: game.id,
      scoreFirst: 10,
      scoreSuccess: 5,
      scoreFailure: 5,
    },
  });

  const questionData = [
    ['10 + 5', '15'],
    ['18 - 7', '11'],
    ['6 * 4', '24'],
    ['45 / 5', '9'],
    ['9 * 9', '81'],
  ];

  const questions = await Promise.all(
    questionData.map(([question, answer]) => ensureQuestion(`Carousel: ${question}`, answer))
  );

  await Promise.all(
    questions.map((question, index) => ensureQuestionGame(game, question, index + 1))
  );
};

const seedRealtimeGame = async (typeGame, name, roles) => {
  const game = await ensureGame({ typeGame, name, roles });

  if (typeGame === 'invaders') {
    await InvadersData.findOrCreate({
      where: { gameId: game.id },
      defaults: {
        gameId: game.id,
        schoolClass: '5',
        level: 1,
        speed: 3,
        enemiesCount: 10,
        scoreFirst: 100,
        scoreSuccess: 50,
        scoreFailure: -25,
      },
    });
  }
};

const run = async () => {
  await sequelize.authenticate();
  await sequelize.sync();

  const roles = await Promise.all([
    ensureRole(DEFAULT_USER_ROLE_ID, 'USER'),
    ensureRole(DEFAULT_ADMIN_ROLE_ID, 'ADMIN'),
  ]);

  await seedSquare(roles);
  await seedCarousel(roles);
  await seedRealtimeGame('invaders', 'Dev Math Invaders', roles);
  await seedRealtimeGame('tictactoe', 'Dev Math Tic Tac Toe', roles);

  console.log('Dev seed data is ready.');
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });

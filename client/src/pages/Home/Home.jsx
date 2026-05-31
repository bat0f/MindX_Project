import { NavLink } from 'react-router-dom';

import classes from './home.module.css';

const gameCards = [
  {
    title: 'Квадрат',
    description: 'Поле с математическими вопросами, где нужно открывать клетки, собирать очки и использовать бонусы для лучшего результата.',
    route: '/square',
    mark: 'x2',
    accent: 'square',
  },
  {
    title: 'Карусель',
    description: 'Динамичная игра с последовательностью заданий: отвечайте быстро, проходите раунды и удерживайте темп до финала.',
    route: '/carousel',
    mark: '360',
    accent: 'carousel',
  },
  {
    title: 'Захватчики',
    description: 'Стратегический режим с ресурсами и территориями: решайте задачи, делайте ходы и постепенно захватывайте поле.',
    route: '/invaders',
    mark: '01',
    accent: 'invaders',
  },
  {
    title: 'Крестики-нолики',
    description: 'Дуэль для двух игроков: выбирайте размер поля и сложность, решайте примеры и выстраивайте победную линию.',
    route: '/tictactoe',
    mark: 'XO',
    accent: 'tictactoe',
  },
];

const Home = () => {
  return (
    <main className={classes.section}>
      <section className={classes.hero}>
        <h1 className={classes.title_home}>Mind<strong className={classes.strong_X}>X</strong></h1>
        <p className={classes.description_home}>
          Современный сервис для организации интеллектуальных игр
        </p>
      </section>

      <section className={classes.gamesSection} aria-label="Игры">
        <div className={classes.gamesHeading}>
          <span>Выберите режим</span>
          <h2>Наши игры</h2>
        </div>

        <div className={classes.gamesGrid}>
          {gameCards.map((game) => (
            <NavLink
              key={game.route}
              to={game.route}
              className={`${classes.gameCard} ${classes[game.accent]}`}
            >
              <span className={classes.gameMark}>{game.mark}</span>
              <span className={classes.gameTitle}>{game.title}</span>
              <span className={classes.gameDescription}>{game.description}</span>
              <span className={classes.gameAction}>Открыть</span>
            </NavLink>
          ))}
        </div>
      </section>
    </main>
  );
};

export default Home;

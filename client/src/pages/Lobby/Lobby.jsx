import './lobby.scss'
import GameCard from './components/GameCard/GameCard';
import { API } from '@mindx/http/API';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ErrorEmmiter } from '@mindx/components/UI/Toastify/Notify';

const Lobby = (props) => {
  //#region development
  const { type } = props;
  const navigate = useNavigate();
  
  const [gameList, setGameList] = useState([]);
  //#endregion

  useEffect(() => {
    API.lobby.getList(type)
      .then(response => {
        if (type === 'tictactoe' && response?.length > 0) {
          navigate(`/tictactoe/${response[0].id}`, { replace: true });
          return;
        }

        setGameList(response);
      })
      .catch((error) => {
        console.error(error);
				ErrorEmmiter(error?.response.data?.error);
      });
  }, [navigate, type]);

  return (
    <main className="lobby-section">
      <div className="container">
        <div className="access_text">
          <h1>Список игр</h1>
        </div>
        {/*  TODO: Сделать select и searchstring */}
        <ul className="games">
          {gameList.map((card, index) => {
            return <GameCard key={index} model={card}/>
          })}
        </ul>
      </div>
    </main>
  );
}

export default Lobby;

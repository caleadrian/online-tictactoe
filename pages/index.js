import { useEffect, useState, useRef } from "react";
import io from "socket.io-client";
import { v4 as uuidv4 } from 'uuid';
import AlertModal from "../components/AlertModal";
import GameResultModal from '../components/GameResultModal';
import GameStartIntroModal from "../components/GameStartIntroModal";
import { getFromStorage } from '../helper/localStorage';
import Router from "next/router";
import AnimatePage from '../components/AnimatePage';
import TimerBar from "../components/TimerBar";

export default function Home() {

  const DEFAULT_MOVES = ['', '', '', '', '', '', '', '', ''];
  const TIMER_SECS = 15.0;
  const [socket, setSocket] = useState(null);
  const [myRoom, setMyRoom] = useState('');
  const [myName, setMyName] = useState('me');
  const [oppName, setOppName] = useState('unknown');
  const [isHost, setIsHost] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [symbol, setSymbol] = useState('');
  const [moves, setMoves] = useState(DEFAULT_MOVES);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [isMatchDone, setIsMatchDone] = useState(false);
  const [isWin, setIsWin] = useState(false);
  const [timer, setTimer] = useState(TIMER_SECS);
  const [openIntroModal, setIntroModal] = useState(false);
  const [resultModalDesc, setResultModalDesc] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRematch, setIsRematch] = useState(false);
  const [openAlertModal, setOpenAlertModal] = useState(false);
  const mySetTimeout = useRef(setTimeout);
  const [enemyTimer, setEnemyTimer] = useState(TIMER_SECS);
  const [myWins, setMyWins] = useState(0);
  const [myLoses, setMyLoses] = useState(0);
  const [pauseMyInterval, setPauseMyInterval] = useState(false);

  useEffect(() => {
    const getPlayerName = () => {
      if (typeof getFromStorage('player-name') === 'undefined' ||
        getFromStorage('player-name') === null ||
        getFromStorage('player-name') === '') {
        Router.push('/signin');
      } else {
        setMyName(getFromStorage('player-name'));
      }
    }

    fetch('/api/socketio').finally(() => {
      const socket = io();
      setSocket(socket);
    });

    getPlayerName();
  }, []);


  useEffect(() => {

    if (socket) {
      socket.on("connect", () => {
        console.log('connected :', socket.connected); // true
      });

      socket.on('joined-room', (d) => {
        setMyRoom(d.room)
        setSymbol(d.isHost ? 'x' : 'circle');
        setIsMyTurn(d.isHost);
        if (!isRematch) {
          setOppName(d.name);
        }

        setIsHost(d.isHost);

        if (d.isHost) {
          setIsLoading(true);
          setIsReady(d.isReady);
        } else {
          setIsLoading(false);
          setIntroModal(true);
          mySetTimeout.current = setTimeout(() => {
            setIsReady(d.isReady);
            setIntroModal(false);
          }, 5000);

        }
      });

      socket.on('move', (d) => {
        setPauseMyInterval(false);
        setIsMyTurn(d.turn === symbol ? false : true);
        setMoves(d.moves);
      });

    }
  }, [socket, symbol, isRematch]);

  // For Game Ready Event
  useEffect(() => {
    const callback = (d) => {
      setIsLoading(false);

      setIntroModal(true);
      if (isRematch) {
        setTimer(TIMER_SECS);
        setIsRematch(false);
      } else {
        setOppName(d.name ? d.name : oppName);
      }
      mySetTimeout.current = setTimeout(() => {
        setIsReady(d.isReady);
        setIntroModal(false);
      }, 5000);
    }

    if (socket) {
      socket.on('game-ready', (d) => callback(d));
    }

    return () => {
      if (socket) {
        socket.off('game-ready', callback);
      }
    }
  }, [socket, isRematch, isLoading, oppName]);

  // For Times Up Event
  useEffect(() => {
    let myInterval = null;
    if (isReady && isMyTurn) {

      if (timer <= 0) {
        clearInterval(myInterval);
        socket.emit('times-up',
          { symbol: symbol, room: myRoom });

      } else {
        if (!pauseMyInterval) {
          myInterval = setInterval(() => {
            if (isMatchDone) {
              clearInterval(myInterval);
              // setTimer(TIMER_SECS);
            } else {
              const t = parseFloat((timer - 0.1).toFixed(4));
              setTimer(t);
              socket.emit('enemy-timer', {
                room: myRoom,
                timer: t
              });
            }

          }, 100);
        }

      }

    } else if (isReady && !isMyTurn) {
      // setTimer(TIMER_SECS);
    }

    return () => clearInterval(myInterval);
  }, [timer, isReady, isMyTurn, isMatchDone, myRoom, socket, symbol, pauseMyInterval])

  // Game Result Event
  useEffect(() => {
    const callback = (d) => {
      if (d.result === 'done' && symbol) {
        for (let index = 0; index < d.combination.length; index++) {
          const el = document.getElementById('cell' + d.combination[index]);
          el.classList.add(d.winner == symbol ? 'win' : 'lose');
        }
        setTimeout(() => {
          const iWin = d.winner == symbol ? true : false;
          setIsWin(iWin);
          if (iWin) {
            setMyWins(w => w + 1);
          } else {
            setMyLoses(l => l + 1)
          }
          setIsMatchDone(true);
        }, 200);

      } else if (d.result === 'draw') {
        setTimeout(() => {
          setIsWin(null);
          setIsMatchDone(true);
        }, 200);
      } else if (d.result === 'timesup' && symbol) {

        setTimeout(() => {
          setIsWin(d.winner == symbol ? true : false);
          setIsMatchDone(true);
        }, 200);
      }
    }

    if (socket) {
      socket.on('game-result', (d) => callback(d));
    }

    return () => {
      if (socket) {
        socket.off('game-result');
      }
    }

  }, [socket, symbol])

  // Disconnect Event
  useEffect(() => {
    const callback = () => {
      const m = [...moves];
      let movesMade = 0;
      for (let i = 0; i < m.length; i++) {

        if (m[i] !== '') {
          movesMade = movesMade + 1;
        }

        if (i === 8) {
          const desc = 'Your opponent is disconnected.';
          clearTimeout(mySetTimeout.current);
          setTimer(TIMER_SECS);
          setIntroModal(false);
          setIsReady(false);

          if (isMatchDone) {
            setIsMatchDone(false);
            setOpenAlertModal(true);
          } else {
            if (movesMade >= 3) {
              setIsWin(true);
              setIsMatchDone(true);
            } else {
              setIsWin(null);
              setIsMatchDone(true);
              // setOpenAlertModal(true);
            }
          }

        }
      }


    }

    if (socket) {
      socket.on('enemy-disconnect', callback);
    }

    return () => {
      if (socket) {
        socket.off('enemy-disconnect', callback);
        setResultModalDesc('');
      }
    }

  }, [socket, moves, isMatchDone, isWin, resultModalDesc]);

  // Opp wants rematch event
  useEffect(() => {

    const callback = () => {
      setIsRematch(true);
    }

    if (socket) {
      socket.on('rematch', () => callback());
    }

    return () => {
      if (socket) {
        socket.off('rematch');
      }
    }

  }, [socket, isRematch]);

  // Opp exit the match event
  useEffect(() => {
    const callback = () => {
      setOpenAlertModal(true);
      setIsMatchDone(false);
      setIsReady(false);
    }

    if (socket) {
      socket.on('exit-room', () => callback());
    }

    return () => {
      if (socket) {
        socket.off('exit-room', () => callback());
      }
    };

  }, [socket, openAlertModal]);


  useEffect(() => {
    if (socket) {
      socket.on('enemy-timer', (d) => {
        setEnemyTimer(d.timer);
      })
    }
  }, [socket])

  const handleJoinRoom = (isPlayAgain = false) => {
    if (socket.connected) {

      if (isPlayAgain) {
        setIsMatchDone(false);
        socket.emit('join-room', { id: socket.id, name: myName, room: myRoom });
      } else {
        socket.emit('join-room', { id: socket.id, name: myName, room: '' });
      }
    }
  }

  const handleCellClick = (i) => {
    setPauseMyInterval(true);
    let m = [...moves];
    if (m[i] === '') {
      setIsMyTurn(false);
      m[i] = symbol;
      setMoves(m);
      socket.emit('move', {
        room: myRoom,
        moves: m,
        turn: symbol
      });
    }

  }

  const handleResultModalExit = () => {
    clearTimeout(mySetTimeout.current);
    setIsReady(false);
    setIsMatchDone(false);
    setIsLoading(true);
    socket.emit('exit-room', { room: myRoom }, (res) => {
      if (res.status === 'ok') {
        setEnemyTimer(TIMER_SECS);
        setMyRoom('');
        setIsHost(null);
        setMoves(DEFAULT_MOVES);
        // setOppName('');
        setSymbol('');
        setTimer(TIMER_SECS);
        setIntroModal(false);
        setResultModalDesc('');
        setIsWin(null);
        setIsLoading(false);
        setOpenAlertModal(false);
      }
    })
  }

  const handleResultModalPlayAgain = () => {
    if (resultModalDesc === '') {
      socket.emit('rematch',
        {
          room: myRoom,
          acceptRematch: isRematch
        }, (res) => {
          if (res.status === 'ok') {
            setTimer(TIMER_SECS);
            setEnemyTimer(TIMER_SECS);
            setIsMatchDone(false);
            setIsReady(false);
            setIsLoading(!isRematch ? true : false);
            setMoves(DEFAULT_MOVES);
            // setIsMyTurn(false);
            // setSymbol('');
          }
        });
    } else {
      if (isHost) {
        clearTimeout(mySetTimeout.current);
        setIsLoading(true);
        setIsReady(false);
        setMoves(DEFAULT_MOVES);
        setIsMatchDone(false);
        setEnemyTimer(TIMER_SECS);
        setTimer(TIMER_SECS);
        setIsWin(null);
        setIntroModal(false);
      } else {
        handleJoinRoom(true);
      }
    }

  }


  return (
    <AnimatePage>
      <div className="app font-sans relative">
        <GameStartIntroModal open={openIntroModal}></GameStartIntroModal>
        <GameResultModal clickExit={handleResultModalExit}
          clickPlayAgain={handleResultModalPlayAgain} modalDesc={resultModalDesc}
          open={isMatchDone} win={isWin}></GameResultModal>
        <AlertModal open={openAlertModal} clickExit={handleResultModalExit}></AlertModal>

        <div className="max-w-4xl mx-auto m-0 p-3 h-screen relative overflow-hidden">
          {isHost !== null &&
            (
              <div className="relative w-auto">
                <div className={"w-auto flex justify-center " + (isMyTurn ? "" : "opacity-50")}>

                  <div className="flex w-28 flex-col mr-10">
                    <div className="player-cardjustify-start relative overflow-hidden h-12 w-[120px] rounded-sm flex">
                      <div className={'symbol w-[40px] mr-2 h-full relative overflow-hidden flex justify-center items-center ' + symbol}></div>
                      <div className="time-container min-w-[48px] text-3xl after:h-full items-center flex">
                        <div>{timer}</div>
                      </div>
                    </div>
                    <TimerBar matchDone={isMatchDone} secs={TIMER_SECS} start={(isReady && !isLoading && isMyTurn)} left={true}></TimerBar>

                    <div className="mt-1">{myName}</div>
                  </div>

                  <div className={"flex w-28 flex-col justify-end " + (!isMyTurn ? "" : "opacity-50")}>
                    <div className="player-card justify-end relative overflow-hidden h-12 w-[120px] rounded-sm flex">
                      <div className="time-container min-w-[48px] text-3xl h-full items-center justify-end flex">
                        <div>{enemyTimer}</div>
                      </div>
                      <div className={'symbol w-[40px] ml-2 h-full relative overflow-hidden flex justify-center items-center ' + (symbol === 'x' ? 'circle' : 'x')}></div>
                    </div>
                    <TimerBar matchDone={isMatchDone} secs={TIMER_SECS} start={(isReady && !isLoading && !isMyTurn)} left={false}></TimerBar>

                    <div className="flex justify-end mt-1">{oppName || ' - '}</div>
                  </div>


                </div>

              </div>

            )}

          {(!isReady && myRoom === '') &&
            (<div className="flex w-full p-5">
              <button disabled={!socket}
                id="findMatchBtn"
                className="rounded-full border-0 shadow-sm px-10 py-3 bg-gradient-to-tl from-[#F7B12D] via-[#FA8247] to-[#FC585D] text-base font-medium text-white hover:opacity-90 focus:outline-none focus:ring-0 focus:ring-offset-4 focus:ring-offset-transparent sm:ml-3 sm:w-auto sm:text-sm"
                onClick={handleJoinRoom}>Find Match</button>
            </div>)
          }
          {(isReady && !isLoading && myRoom !== '') && (
            <div style={{ pointerEvents: (isMyTurn ? 'auto' : 'none') }}
              className={'board ' + (isMyTurn ? symbol : '')} id='board'>
              {moves.map((cell, i) => (
                <div className={'cell ' + cell}
                  onClick={() => handleCellClick(i)} data-cell
                  key={i + cell} index={i} id={'cell' + i}> </div>
              ))}
            </div>
          )}
          {(!isReady && isLoading) && (
            <div className="justify-center flex items-center relative h-full">
              <span className="loader"></span>
            </div>
          )}
        </div>
      </div>
    </AnimatePage>
  )
}

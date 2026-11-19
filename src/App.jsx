import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import BOARD_CONFIG from '../boardConfig.json';
import {
  Dices,
  Users,
  Send,
  Copy,
  Check,
  ArrowLeftRight,
  Home,
  Lock,
  Play,
  LogOut,
  ShieldAlert,
  Coins,
  Building2,
} from 'lucide-react';

// ============================================================================
// НАСТРОЙКИ TELEGRAM БОТА
// ============================================================================
const BOT_USERNAME = 'uzmonopoly_bot'; // Юзернейм бота без @
const MINI_APP_NAME = 'game'; // Short name из BotFather (/newapp). Оставьте '' если кнопка меню

// Подключение к серверу (на Render.com подключается к текущему домену автоматически)
const SERVER_URL = import.meta.env.DEV ? 'http://localhost:3001' : undefined;
const socket = io(SERVER_URL);

// Координаты клеток в сетке 7x7 (по часовой стрелке от левого верхнего угла)
const getTileGridPosition = (index) => {
  if (index <= 6) return { row: 1, col: index + 1 };
  if (index <= 11) return { row: index - 5, col: 7 };
  if (index <= 18) return { row: 7, col: 7 - (index - 12) };
  return { row: 7 - (index - 18), col: 1 };
};

export default function App() {
  const [playerId] = useState(() => {
    const saved = sessionStorage.getItem('uzmonopoly_pid');
    if (saved) return saved;
    const id = 'p_' + Math.random().toString(36).substring(2, 10);
    sessionStorage.setItem('uzmonopoly_pid', id);
    return id;
  });

  const [nickname, setNickname] = useState('');
  const [isTelegramUser, setIsTelegramUser] = useState(false);

  const [roomCodeInput, setRoomCodeInput] = useState(['', '', '', '', '']);
  const [roomPassword, setRoomPassword] = useState('');
  const [activeRoomCode, setActiveRoomCode] = useState('');
  const [roomData, setRoomData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedType, setCopiedType] = useState(null);
  const inputRefs = useRef([]);

  // Состояние торгового предложения
  const [tradeModalOpen, setTradeModalOpen] = useState(false);
  const [tradeTargetId, setTradeTargetId] = useState('');
  const [offerMoney, setOfferMoney] = useState(0);
  const [requestMoney, setRequestMoney] = useState(0);
  const [offerTiles, setOfferTiles] = useState([]);
  const [requestTiles, setRequestTiles] = useState([]);
  const [offerJailCard, setOfferJailCard] = useState(false);
  const [requestJailCard, setRequestJailCard] = useState(false);

  // Инициализация Telegram WebApp и чтение кода из ссылки
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      const user = tg.initDataUnsafe?.user;
      if (user) {
        const tgName = user.username
          ? `@${user.username}`
          : [user.first_name, user.last_name].filter(Boolean).join(' ');
        if (tgName) {
          setNickname(tgName);
          setIsTelegramUser(true);
        }
      }
    }

    const tgStartParam = tg?.initDataUnsafe?.start_param;
    const urlParams = new URLSearchParams(window.location.search);
    const urlRoom = urlParams.get('room');
    const detected = (tgStartParam || urlRoom || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 5);

    if (detected.length === 5) {
      setRoomCodeInput(detected.split(''));
    }
  }, []);

  // Подписка на обновления комнаты от сервера
  useEffect(() => {
    const handleRoomUpdate = (updatedRoom) => {
      setRoomData(updatedRoom);
    };
    socket.on('room_update', handleRoomUpdate);
    return () => {
      socket.off('room_update', handleRoomUpdate);
    };
  }, []);

  // Ввод 5-значного кода [ _ _ _ _ _ ]
  const handleCodeChange = (index, value) => {
    const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!clean) return;
    const next = [...roomCodeInput];
    next[index] = clean.slice(-1);
    setRoomCodeInput(next);
    if (index < 4 && inputRefs.current[index + 1]) {
      inputRefs.current[index + 1].focus();
    }
  };

  const handleCodeKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      const next = [...roomCodeInput];
      if (next[index]) {
        next[index] = '';
        setRoomCodeInput(next);
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus();
        next[index - 1] = '';
        setRoomCodeInput(next);
      }
    }
  };

  const handleCodePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData('text')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 5);
    if (!pasted) return;
    const filled = pasted.split('');
    while (filled.length < 5) filled.push('');
    setRoomCodeInput(filled);
    inputRefs.current[Math.min(pasted.length, 4)]?.focus();
  };

  // Создание и вход в комнату через Socket.io
  const handleCreateRoom = () => {
    setLoading(true);
    setErrorMsg('');
    socket.emit(
      'create_room',
      { playerId, nickname, password: roomPassword },
      (res) => {
        setLoading(false);
        if (res.error) {
          setErrorMsg(res.error);
        } else {
          setActiveRoomCode(res.room.code);
          setRoomData(res.room);
        }
      }
    );
  };

  const handleJoinRoom = () => {
    const code = roomCodeInput.join('');
    if (code.length < 5) {
      setErrorMsg('5 xonali xona kodini to‘liq kiriting!');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    socket.emit(
      'join_room',
      { playerId, nickname, code, password: roomPassword },
      (res) => {
        setLoading(false);
        if (res.error) {
          setErrorMsg(res.error);
        } else {
          setActiveRoomCode(res.room.code);
          setRoomData(res.room);
        }
      }
    );
  };

  // Ссылки приглашения
  const getWebShareLink = () => `${window.location.origin}/?room=${activeRoomCode}`;
  const getTelegramShareLink = () =>
    MINI_APP_NAME
      ? `https://t.me/${BOT_USERNAME}/${MINI_APP_NAME}?startapp=${activeRoomCode}`
      : `https://t.me/${BOT_USERNAME}?startapp=${activeRoomCode}`;

  const copyLink = (url, type) => {
    navigator.clipboard.writeText(url);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  const shareViaTelegram = () => {
    const tgLink = getTelegramShareLink();
    const text = encodeURIComponent(`UzMonopoly o‘yiniga qo‘shiling! Xona kodi: ${activeRoomCode}`);
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(tgLink)}&text=${text}`;
    if (window.Telegram?.WebApp?.openTelegramLink) {
      window.Telegram.WebApp.openTelegramLink(shareUrl);
    } else {
      window.open(shareUrl, '_blank');
    }
  };

  // Действия игрока
  const startGame = () => socket.emit('start_game', { code: activeRoomCode, playerId });
  const rollDice = () => socket.emit('roll_dice', { code: activeRoomCode, playerId });
  const buyCurrentTile = () => socket.emit('buy_tile', { code: activeRoomCode, playerId });
  const buildHouse = (tileId) => socket.emit('build_house', { code: activeRoomCode, playerId, tileId });
  const payBailOrUseCard = (useCard) => socket.emit('leave_jail', { code: activeRoomCode, playerId, useCard });
  const endTurn = () => socket.emit('end_turn', { code: activeRoomCode, playerId });

  const sendTradeOffer = () => {
    if (!tradeTargetId) return;
    socket.emit('send_trade', {
      code: activeRoomCode,
      trade: {
        fromId: playerId,
        toId: tradeTargetId,
        offerMoney: Number(offerMoney) || 0,
        requestMoney: Number(requestMoney) || 0,
        offerTiles,
        requestTiles,
        offerJailCard,
        requestJailCard,
      },
    });
    setTradeModalOpen(false);
    setOfferMoney(0);
    setRequestMoney(0);
    setOfferTiles([]);
    setRequestTiles([]);
    setOfferJailCard(false);
    setRequestJailCard(false);
  };

  const respondTrade = (accept) => {
    socket.emit('respond_trade', { code: activeRoomCode, playerId, accept });
  };

  // ============================================================================
  // ЭКРАН 1: ГЛАВНОЕ МЕНЮ
  // ============================================================================
  if (!activeRoomCode || !roomData) {
    return (
      <div className="min-h-screen bg-[#0f172a] text-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-[#1e293b] border border-slate-700/80 rounded-2xl shadow-2xl p-6 space-y-5">
          <div className="text-center space-y-1">
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 to-sky-400 bg-clip-text text-transparent">
              UzMonopoly
            </h1>
            <p className="text-xs text-slate-400">Onlayn ko‘p o‘yinchi stol o‘yini</p>
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-500/10 border border-red-500/40 rounded-xl text-xs text-red-300 text-center">
              {errorMsg}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              O‘yinchi ismi (Nik) {isTelegramUser && <span className="text-sky-400">(Telegram)</span>}
            </label>
            <input
              type="text"
              value={nickname}
              disabled={isTelegramUser}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Ismingizni kiriting..."
              className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-medium focus:outline-none ${
                isTelegramUser
                  ? 'bg-slate-900/70 border-slate-700 text-slate-400 cursor-not-allowed'
                  : 'bg-slate-900 border-slate-700 text-white focus:border-emerald-500'
              }`}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Xona paroli (ixtiyoriy)
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
              <input
                type="text"
                value={roomPassword}
                onChange={(e) => setRoomPassword(e.target.value)}
                placeholder="Parol o‘rnating yoki kiriting..."
                className="w-full pl-10 pr-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2 text-center">
              Xona kodi (kirish uchun 5 ta belgi)
            </label>
            <div className="flex justify-center gap-2.5" onPaste={handleCodePaste}>
              {roomCodeInput.map((char, idx) => (
                <input
                  key={idx}
                  ref={(el) => (inputRefs.current[idx] = el)}
                  type="text"
                  maxLength={1}
                  value={char}
                  placeholder="_"
                  onChange={(e) => handleCodeChange(idx, e.target.value)}
                  onKeyDown={(e) => handleCodeKeyDown(idx, e)}
                  className="w-12 h-14 text-center text-xl font-mono font-bold uppercase bg-slate-900 border-2 border-slate-700 rounded-xl text-white focus:border-sky-500 focus:outline-none transition"
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              onClick={handleCreateRoom}
              disabled={loading}
              className="py-3 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl shadow-lg shadow-emerald-900/30 transition"
            >
              Xona yaratish
            </button>
            <button
              onClick={handleJoinRoom}
              disabled={loading}
              className="py-3 px-4 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl shadow-lg shadow-sky-900/30 transition"
            >
              Xonaga kirish
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // ЭКРАН 2: ЛОББИ ОЖИДАНИЯ
  // ============================================================================
  if (roomData.status === 'waiting') {
    const isHost = roomData.hostId === playerId;
    return (
      <div className="min-h-screen bg-[#0f172a] text-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-[#1e293b] border border-slate-700 rounded-2xl shadow-2xl p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-700 pb-4">
            <div>
              <h2 className="text-xl font-bold text-white">UzMonopoly — Kutish xonasi</h2>
              <p className="text-xs text-slate-400">Do‘stlaringizni taklif qiling</p>
            </div>
            <div className="text-right">
              <span className="text-[11px] uppercase text-slate-400 block">Xona kodi</span>
              <span className="font-mono text-2xl font-extrabold tracking-widest text-emerald-400">
                {activeRoomCode}
              </span>
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-700/80 rounded-xl p-4 space-y-3">
            <p className="text-xs text-slate-400 font-medium">Xona havolasini ulashish:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                onClick={() => copyLink(getWebShareLink(), 'web')}
                className="flex items-center justify-center gap-2 py-2.5 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-xl text-xs font-semibold text-white transition"
              >
                {copiedType === 'web' ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Sayt havolasi nusxalandi</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-slate-300" />
                    <span>Sayt havolasi (?room=)</span>
                  </>
                )}
              </button>

              <button
                onClick={shareViaTelegram}
                className="flex items-center justify-center gap-2 py-2.5 px-3 bg-sky-600 hover:bg-sky-500 rounded-xl text-xs font-semibold text-white transition"
              >
                <Send className="w-4 h-4" />
                <span>Telegram orqali ulashish</span>
              </button>
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <Users className="w-4 h-4" /> O‘yinchilar ({roomData.players.length}/{BOARD_CONFIG.maxPlayers})
              </span>
              {roomData.password && <span>Parol: {roomData.password}</span>}
            </div>
            <div className="space-y-2">
              {roomData.players.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between px-4 py-2.5 bg-slate-900/90 border border-slate-700/70 rounded-xl"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-3.5 h-3.5 rounded-full shadow" style={{ backgroundColor: p.color }} />
                    <span className="font-semibold text-sm">{p.name}</span>
                  </div>
                  {p.id === roomData.hostId && (
                    <span className="text-[11px] px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded-md font-medium">
                      Xona egasi
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => {
                setActiveRoomCode('');
                setRoomData(null);
              }}
              className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl flex items-center gap-1.5"
            >
              <LogOut className="w-4 h-4" /> Chiqish
            </button>

            {isHost ? (
              <button
                onClick={startGame}
                disabled={roomData.players.length < 2}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition"
              >
                <Play className="w-4 h-4" />
                {roomData.players.length < 2 ? 'Kamida 2 o‘yinchi kerak' : 'O‘yinni boshlash'}
              </button>
            ) : (
              <div className="flex-1 py-3 bg-slate-900 border border-slate-700 rounded-xl text-center text-xs text-slate-400 flex items-center justify-center">
                Xona egasi o‘yinni boshlashini kuting...
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // ЭКРАН 3: ИГРОВОЕ ПОЛЕ
  // ============================================================================
  const currentPlayer = roomData.players[roomData.turnIndex];
  const me = roomData.players.find((p) => p.id === playerId);
  const isMyTurn = currentPlayer?.id === playerId && roomData.status === 'playing';
  const currentTile = me ? BOARD_CONFIG.tiles[me.position] : null;
  const canBuyCurrent =
    isMyTurn &&
    roomData.hasRolled &&
    currentTile &&
    (currentTile.type === 'city' || currentTile.type === 'station') &&
    !roomData.properties?.[currentTile.id] &&
    me.money >= currentTile.price;

  return (
    <div className="min-h-screen bg-[#0b1120] text-slate-100 flex flex-col lg:flex-row p-2 sm:p-4 gap-4">
      <div className="flex-1 flex items-center justify-center">
        <div className="relative w-full max-w-[740px] aspect-square bg-[#111827] border-2 border-slate-700 rounded-2xl p-1.5 sm:p-2 shadow-2xl">
          <div className="w-full h-full grid grid-cols-7 grid-rows-7 gap-1">
            {BOARD_CONFIG.tiles.map((tile) => {
              const { row, col } = getTileGridPosition(tile.id);
              const prop = roomData.properties?.[tile.id];
              const owner = prop ? roomData.players.find((p) => p.id === prop.ownerId) : null;

              return (
                <div
                  key={tile.id}
                  style={{
                    gridRow: row,
                    gridColumn: col,
                    borderColor: owner ? owner.color : '#334155',
                    backgroundColor: owner ? `${owner.color}20` : '#1e293b',
                  }}
                  className="relative border-2 rounded-lg flex flex-col justify-between overflow-hidden select-none p-1 transition-colors"
                >
                  {tile.group ? (
                    <div
                      className="h-2 sm:h-2.5 w-full rounded-sm flex items-center justify-center gap-0.5"
                      style={{ backgroundColor: tile.group }}
                    >
                      {Array.from({ length: prop?.houses || 0 }).map((_, i) => (
                        <span key={i} className="w-1.5 h-1.5 bg-white rounded-full" />
                      ))}
                    </div>
                  ) : (
                    <div className="h-1" />
                  )}

                  <div className="text-center leading-tight my-auto px-0.5">
                    <div className="text-[9px] sm:text-[11px] font-bold text-slate-100 truncate">
                      {tile.name}
                    </div>
                    {tile.price && (
                      <div className="text-[8px] sm:text-[10px] font-mono text-emerald-400">
                        {tile.price}$
                      </div>
                    )}
                    {tile.subtext && (
                      <div className="text-[8px] sm:text-[10px] text-slate-400">{tile.subtext}</div>
                    )}
                  </div>

                  <div className="h-2.5 flex items-center justify-center">
                    {owner && (
                      <span
                        className="text-[7px] sm:text-[9px] font-bold px-1 rounded truncate max-w-full text-white"
                        style={{ backgroundColor: owner.color }}
                      >
                        {owner.name}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            <div className="col-start-2 col-end-7 row-start-2 row-end-7 bg-[#0f172a]/90 border border-slate-800 rounded-xl flex flex-col items-center justify-center p-3 text-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-lg sm:text-2xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 to-sky-400 bg-clip-text text-transparent">
                  UzMonopoly
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-slate-300">
                  #{activeRoomCode}
                </span>
              </div>

              <div className="flex items-center gap-3">
                {roomData.dice.map((val, idx) => (
                  <div
                    key={idx}
                    className="w-10 h-10 sm:w-12 sm:h-12 bg-slate-800 border-2 border-slate-600 rounded-xl flex items-center justify-center text-lg sm:text-xl font-extrabold text-white shadow-inner"
                  >
                    {val}
                  </div>
                ))}
              </div>

              <div className="text-xs sm:text-sm text-slate-300">
                Navbat:{' '}
                <span className="font-bold" style={{ color: currentPlayer?.color }}>
                  {currentPlayer?.name}
                </span>
              </div>

              {isMyTurn && (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {!roomData.hasRolled ? (
                    <button
                      onClick={rollDice}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold rounded-xl flex items-center gap-1.5 shadow-lg transition"
                    >
                      <Dices className="w-4 h-4" /> Tosh tashlash
                    </button>
                  ) : (
                    <>
                      {canBuyCurrent && (
                        <button
                          onClick={buyCurrentTile}
                          className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl flex items-center gap-1 transition"
                        >
                          <Coins className="w-4 h-4" /> Sotib olish ({currentTile.price}$)
                        </button>
                      )}
                      <button
                        onClick={endTurn}
                        className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs sm:text-sm font-bold rounded-xl transition"
                      >
                        Navbatni berish
                      </button>
                    </>
                  )}

                  {me?.inJail && !roomData.hasRolled && (
                    <div className="flex gap-1.5 w-full justify-center mt-1">
                      <button
                        onClick={() => payBailOrUseCard(false)}
                        disabled={me.money < BOARD_CONFIG.jailFine}
                        className="px-2.5 py-1 bg-rose-600/80 hover:bg-rose-600 disabled:opacity-40 text-[11px] font-semibold rounded-lg"
                      >
                        Jarima ({BOARD_CONFIG.jailFine}$)
                      </button>
                      {me.jailFreeCards > 0 && (
                        <button
                          onClick={() => payBailOrUseCard(true)}
                          className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-[11px] font-semibold rounded-lg"
                        >
                          Karta ishlatish ({me.jailFreeCards})
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="pointer-events-none absolute inset-1.5 sm:inset-2">
            {roomData.players
              .filter((p) => !p.bankrupt)
              .map((p, idx) => {
                const { row, col } = getTileGridPosition(p.position);
                const cellSize = 100 / 7;
                const offsetX = ((idx % 3) - 1) * 1.6;
                const offsetY = (Math.floor(idx / 3) - 0.5) * 1.6;

                return (
                  <div
                    key={p.id}
                    style={{
                      top: `${(row - 0.5) * cellSize + offsetY}%`,
                      left: `${(col - 0.5) * cellSize + offsetX}%`,
                      backgroundColor: p.color,
                    }}
                    title={p.name}
                    className="absolute -translate-x-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 rounded-full border-2 border-white shadow-lg transition-all duration-500 ease-out flex items-center justify-center text-[8px] font-bold text-white"
                  >
                    {p.name.replace('@', '')[0]?.toUpperCase()}
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      <div className="w-full lg:w-96 flex flex-col gap-3">
        <div className="bg-[#1e293b] border border-slate-700 rounded-xl p-3 flex items-center justify-between gap-2">
          <div>
            <span className="text-[11px] text-slate-400 block">Do‘stlarni chaqirish:</span>
            <span className="font-mono text-sm font-bold text-emerald-400">{activeRoomCode}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => copyLink(getWebShareLink(), 'web')}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-xs font-medium flex items-center gap-1"
            >
              {copiedType === 'web' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>Sayt</span>
            </button>
            <button
              onClick={shareViaTelegram}
              className="px-2.5 py-1.5 bg-sky-600 hover:bg-sky-500 rounded-lg text-xs font-medium flex items-center gap-1"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Telegram</span>
            </button>
          </div>
        </div>

        <div className="bg-[#1e293b] border border-slate-700 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-slate-400">O‘yinchilar</span>
            <button
              onClick={() => setTradeModalOpen(true)}
              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-semibold flex items-center gap-1"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" /> Almashish
            </button>
          </div>

          <div className="space-y-1.5">
            {roomData.players.map((p) => (
              <div
                key={p.id}
                className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${
                  p.id === currentPlayer?.id
                    ? 'bg-slate-800 border-emerald-500/60'
                    : 'bg-slate-900/60 border-slate-800'
                } ${p.bankrupt ? 'opacity-40 line-through' : ''}`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                  <span className="font-semibold truncate">{p.name}</span>
                  {p.inJail && <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                  {p.jailFreeCards > 0 && (
                    <span className="px-1.5 py-0.2 bg-indigo-500/20 text-indigo-300 rounded text-[10px]">
                      Karta x{p.jailFreeCards}
                    </span>
                  )}
                </div>
                <span className="font-mono font-bold text-emerald-400">{p.money}$</span>
              </div>
            ))}
          </div>
        </div>

        {roomData.pendingTrade && roomData.pendingTrade.toId === playerId && (
          <div className="bg-indigo-950/90 border border-indigo-500 rounded-xl p-3 space-y-2 text-xs">
            <div className="font-bold text-indigo-300">
              Yangi savdo taklifi (
              {roomData.players.find((p) => p.id === roomData.pendingTrade.fromId)?.name}):
            </div>
            <div>
              <span className="text-slate-400">Sizga beradi: </span>
              <span className="text-emerald-400 font-semibold">
                {roomData.pendingTrade.offerMoney}$
                {roomData.pendingTrade.offerJailCard ? ' + Qamoq kartasi' : ''}
                {roomData.pendingTrade.offerTiles.length > 0 &&
                  ' + ' +
                    roomData.pendingTrade.offerTiles
                      .map((id) => BOARD_CONFIG.tiles.find((t) => t.id === id)?.name)
                      .join(', ')}
              </span>
            </div>
            <div>
              <span className="text-slate-400">Sizdan so‘raydi: </span>
              <span className="text-amber-400 font-semibold">
                {roomData.pendingTrade.requestMoney}$
                {roomData.pendingTrade.requestJailCard ? ' + Qamoq kartasi' : ''}
                {roomData.pendingTrade.requestTiles.length > 0 &&
                  ' + ' +
                    roomData.pendingTrade.requestTiles
                      .map((id) => BOARD_CONFIG.tiles.find((t) => t.id === id)?.name)
                      .join(', ')}
              </span>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => respondTrade(true)}
                className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-bold"
              >
                Qabul qilish
              </button>
              <button
                onClick={() => respondTrade(false)}
                className="flex-1 py-1.5 bg-rose-600 hover:bg-rose-500 rounded-lg font-bold"
              >
                Rad etish
              </button>
            </div>
          </div>
        )}

        <div className="bg-[#1e293b] border border-slate-700 rounded-xl p-3 space-y-2">
          <div className="text-xs font-bold uppercase text-slate-400 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5" /> Mening shaharlarim
          </div>
          <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
            {Object.entries(roomData.properties || {})
              .filter(([, prop]) => prop.ownerId === playerId)
              .map(([tid, prop]) => {
                const tile = BOARD_CONFIG.tiles.find((t) => t.id === Number(tid));
                if (!tile) return null;
                return (
                  <div
                    key={tid}
                    className="flex items-center justify-between px-2.5 py-1.5 bg-slate-900 rounded-lg text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-sm"
                        style={{ backgroundColor: tile.group || '#64748b' }}
                      />
                      <span className="font-medium">{tile.name}</span>
                      {tile.type === 'city' && (
                        <span className="text-[10px] text-slate-400">({prop.houses || 0}/4 uy)</span>
                      )}
                    </div>
                    {tile.type === 'city' && (prop.houses || 0) < 4 && (
                      <button
                        onClick={() => buildHouse(tile.id)}
                        disabled={(me?.money || 0) < tile.houseCost}
                        className="px-2 py-0.5 bg-emerald-600/80 hover:bg-emerald-600 disabled:opacity-40 rounded text-[10px] font-semibold flex items-center gap-1"
                      >
                        <Home className="w-3 h-3" /> +{tile.houseCost}$
                      </button>
                    )}
                  </div>
                );
              })}
          </div>
        </div>

        <div className="flex-1 bg-[#1e293b] border border-slate-700 rounded-xl p-3 flex flex-col min-h-[140px]">
          <span className="text-xs font-bold uppercase text-slate-400 mb-1.5">O‘yin tarixi</span>
          <div className="flex-1 max-h-44 overflow-y-auto space-y-1 text-[11px] text-slate-300 pr-1">
            {(roomData.logs || []).map((entry, idx) => (
              <div key={idx} className="border-b border-slate-800/80 pb-1">
                {String(entry)}
              </div>
            ))}
          </div>
        </div>
      </div>

      {tradeModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-[#1e293b] border border-slate-700 rounded-2xl p-5 space-y-4 text-xs">
            <h3 className="text-base font-bold text-white">O‘yinchilar bilan almashish</h3>

            <div>
              <label className="block text-slate-400 mb-1">Kimga taklif yuborasiz?</label>
              <select
                value={tradeTargetId}
                onChange={(e) => {
                  setTradeTargetId(e.target.value);
                  setRequestTiles([]);
                }}
                className="w-full p-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
              >
                <option value="">O‘yinchini tanlang...</option>
                {roomData.players
                  .filter((p) => p.id !== playerId && !p.bankrupt)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.money}$)
                    </option>
                  ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-900 p-3 rounded-xl space-y-2">
                <div className="font-bold text-emerald-400">Siz berasiz:</div>
                <input
                  type="number"
                  min={0}
                  max={me?.money || 0}
                  value={offerMoney}
                  onChange={(e) => setOfferMoney(e.target.value)}
                  placeholder="Pul ($)"
                  className="w-full p-1.5 bg-slate-800 border border-slate-700 rounded text-white"
                />
                {(me?.jailFreeCards || 0) > 0 && (
                  <label className="flex items-center gap-1.5 text-slate-300">
                    <input
                      type="checkbox"
                      checked={offerJailCard}
                      onChange={(e) => setOfferJailCard(e.target.checked)}
                    />
                    Qamoq kartasi
                  </label>
                )}
                <div className="max-h-24 overflow-y-auto space-y-1">
                  {Object.entries(roomData.properties || {})
                    .filter(([, prop]) => prop.ownerId === playerId)
                    .map(([tid]) => {
                      const t = BOARD_CONFIG.tiles.find((x) => x.id === Number(tid));
                      return (
                        <label key={tid} className="flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={offerTiles.includes(Number(tid))}
                            onChange={(e) =>
                              setOfferTiles((prev) =>
                                e.target.checked
                                  ? [...prev, Number(tid)]
                                  : prev.filter((id) => id !== Number(tid))
                              )
                            }
                          />
                          <span className="truncate">{t?.name}</span>
                        </label>
                      );
                    })}
                </div>
              </div>

              <div className="bg-slate-900 p-3 rounded-xl space-y-2">
                <div className="font-bold text-amber-400">Siz so‘raysiz:</div>
                <input
                  type="number"
                  min={0}
                  value={requestMoney}
                  onChange={(e) => setRequestMoney(e.target.value)}
                  placeholder="Pul ($)"
                  className="w-full p-1.5 bg-slate-800 border border-slate-700 rounded text-white"
                />
                {(roomData.players.find((p) => p.id === tradeTargetId)?.jailFreeCards || 0) > 0 && (
                  <label className="flex items-center gap-1.5 text-slate-300">
                    <input
                      type="checkbox"
                      checked={requestJailCard}
                      onChange={(e) => setRequestJailCard(e.target.checked)}
                    />
                    Qamoq kartasi
                  </label>
                )}
                <div className="max-h-24 overflow-y-auto space-y-1">
                  {Object.entries(roomData.properties || {})
                    .filter(([, prop]) => prop.ownerId === tradeTargetId)
                    .map(([tid]) => {
                      const t = BOARD_CONFIG.tiles.find((x) => x.id === Number(tid));
                      return (
                        <label key={tid} className="flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={requestTiles.includes(Number(tid))}
                            onChange={(e) =>
                              setRequestTiles((prev) =>
                                e.target.checked
                                  ? [...prev, Number(tid)]
                                  : prev.filter((id) => id !== Number(tid))
                              )
                            }
                          />
                          <span className="truncate">{t?.name}</span>
                        </label>
                      );
                    })}
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setTradeModalOpen(false)}
                className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl font-semibold"
              >
                Bekor qilish
              </button>
              <button
                onClick={sendTradeOffer}
                disabled={!tradeTargetId}
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-xl font-bold text-white"
              >
                Taklif yuborish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import BOARD_CONFIG from '../boardConfig.json';
import {
  Dices,
  Users,
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
  UserX,
  Skull,
  OctagonX,
  X,
  Trash2,
  Trophy,
} from 'lucide-react';

// ============================================================================
// НАСТРОЙКИ TELEGRAM БОТА
// ============================================================================
const BOT_USERNAME = 'uzmonopoly_bot';
const MINI_APP_NAME = 'game';

const SERVER_URL = import.meta.env.DEV ? 'http://localhost:3001' : undefined;
const socket = io(SERVER_URL);

const GRID_SIZE = BOARD_CONFIG.gridSize || 7;

// ============================================================================
// СЛОВАРЬ ФЛАГОВ ДЛЯ СТРАН (circle-flags)
// Если страны нет в словаре (и не указан tile.flag), иконка не отображается
// ============================================================================
const COUNTRY_FLAG_CODES = {
  // Узбекистан и регионы
  "o'zbekiston": 'uz',
  'ozbekiston': 'uz',
  uzbekistan: 'uz',
  surxondaryo: 'uz',
  "qoraqalpog'iston": 'uz',
  qoraqalpogiston: 'uz',
  xorazm: 'uz',
  buxoro: 'uz',
  sirdaryo: 'uz',
  vodiy: 'uz',
  poytaxt: 'uz',
  toshkent: 'uz',
  // Страны мира (на узбекском, русском и английском)
  braziliya: 'br',
  brazil: 'br',
  бразилия: 'br',
  turkiya: 'tr',
  turkey: 'tr',
  турция: 'tr',
  rossiya: 'ru',
  russia: 'ru',
  россия: 'ru',
  aqsh: 'us',
  usa: 'us',
  сша: 'us',
  germaniya: 'de',
  germany: 'de',
  германия: 'de',
  fransiya: 'fr',
  france: 'fr',
  франция: 'fr',
  italiya: 'it',
  italy: 'it',
  италия: 'it',
  ispaniya: 'es',
  spain: 'es',
  испания: 'es',
  angliya: 'gb',
  britaniya: 'gb',
  uk: 'gb',
  великобритания: 'gb',
  yaponiya: 'jp',
  japan: 'jp',
  япония: 'jp',
  koreya: 'kr',
  korea: 'kr',
  корея: 'kr',
  xitoy: 'cn',
  china: 'cn',
  китай: 'cn',
  baa: 'ae',
  dubay: 'ae',
  uae: 'ae',
  оаэ: 'ae',
  qozogiston: 'kz',
  "qozog'iston": 'kz',
  kazakhstan: 'kz',
  казахстан: 'kz',
  hindiston: 'in',
  india: 'in',
  индия: 'in',
  kanada: 'ca',
  canada: 'ca',
  канада: 'ca',
  avstraliya: 'au',
  australia: 'au',
  австралия: 'au',
  shveytsariya: 'ch',
  switzerland: 'ch',
  швейцария: 'ch',
  misr: 'eg',
  egypt: 'eg',
  египет: 'eg',
  argentina: 'ar',
  аргентина: 'ar',
};

const getCountryFlagUrl = (tile) => {
  if (tile.flag) {
    return `https://kapowaz.github.io/circle-flags/flags/${tile.flag.toLowerCase()}.svg`;
  }
  if (!tile.country) return null;
  const normalized = tile.country.toLowerCase().replace(/[‘’`]/g, "'").trim();
  const code = COUNTRY_FLAG_CODES[normalized];
  return code ? `https://kapowaz.github.io/circle-flags/flags/${code}.svg` : null;
};

// Координаты клеток в сетке NxN по часовой стрелке от левого верхнего угла
const getTileGridPosition = (index) => {
  const side = GRID_SIZE - 1;
  if (index <= side) return { row: 1, col: index + 1 };
  if (index <= side * 2) return { row: index - side + 1, col: GRID_SIZE };
  if (index <= side * 3) return { row: GRID_SIZE, col: GRID_SIZE - (index - side * 2) };
  return { row: GRID_SIZE - (index - side * 3), col: 1 };
};

// Позиционирование круглой иконки флага на внутреннем крае клетки (наполовину выступает к центру)
const getFlagEdgePlacement = (row, col) => {
  // Угловые клетки не являются городами, но на случай расширения проверяем стороны
  if (row === 1 && col > 1 && col < GRID_SIZE) {
    // Верхний ряд -> нижний край (выступает вниз к центру)
    return {
      posClass: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2',
      paddingFix: 'pb-1.5',
    };
  }
  if (row === GRID_SIZE && col > 1 && col < GRID_SIZE) {
    // Нижний ряд -> верхний край (выступает вверх к центру)
    return {
      posClass: 'top-0 left-1/2 -translate-x-1/2 -translate-y-1/2',
      paddingFix: 'pt-1.5',
    };
  }
  if (col === 1 && row > 1 && row < GRID_SIZE) {
    // Левый столбец -> правый край (выступает вправо к центру)
    return {
      posClass: 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2',
      paddingFix: 'pr-1.5',
    };
  }
  if (col === GRID_SIZE && row > 1 && row < GRID_SIZE) {
    // Правый столбец -> левый край (выступает влево к центру)
    return {
      posClass: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2',
      paddingFix: 'pl-1.5',
    };
  }
  return { posClass: 'top-0 left-1/2 -translate-x-1/2 -translate-y-1/2', paddingFix: '' };
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

  const [selectedTile, setSelectedTile] = useState(null);

  // Состояние торговли
  const [tradeModalOpen, setTradeModalOpen] = useState(false);
  const [tradeTargetId, setTradeTargetId] = useState('');
  const [offerMoney, setOfferMoney] = useState(0);
  const [requestMoney, setRequestMoney] = useState(0);
  const [offerTiles, setOfferTiles] = useState([]);
  const [requestTiles, setRequestTiles] = useState([]);
  const [offerJailCard, setOfferJailCard] = useState(false);
  const [requestJailCard, setRequestJailCard] = useState(false);
  const [forgiveDebt, setForgiveDebt] = useState(false);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      const user = tg.initDataUnsafe?.user;
      if (user) {
        const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
        if (fullName) {
          setNickname(fullName);
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

  useEffect(() => {
    const handleRoomUpdate = (updatedRoom) => setRoomData(updatedRoom);
    const handleKicked = ({ targetId }) => {
      if (targetId === playerId) {
        setActiveRoomCode('');
        setRoomData(null);
        setErrorMsg('Siz xona egasi tomonidan o‘yindan chetlatildingiz.');
      }
    };

    socket.on('room_update', handleRoomUpdate);
    socket.on('player_kicked', handleKicked);
    return () => {
      socket.off('room_update', handleRoomUpdate);
      socket.off('player_kicked', handleKicked);
    };
  }, [playerId]);

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

  const handleCreateRoom = () => {
    setLoading(true);
    setErrorMsg('');
    socket.emit('create_room', { playerId, nickname, password: roomPassword }, (res) => {
      setLoading(false);
      if (res.error) setErrorMsg(res.error);
      else {
        setActiveRoomCode(res.room.code);
        setRoomData(res.room);
      }
    });
  };

  const handleJoinRoom = () => {
    const code = roomCodeInput.join('');
    if (code.length < 5) {
      setErrorMsg('5 xonali xona kodini to‘liq kiriting!');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    socket.emit('join_room', { playerId, nickname, code, password: roomPassword }, (res) => {
      setLoading(false);
      if (res.error) setErrorMsg(res.error);
      else {
        setActiveRoomCode(res.room.code);
        setRoomData(res.room);
      }
    });
  };

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

  // Проверка наличия домов в стране (группе) города
  const hasHousesInCountry = (tile) => {
    if (!tile || tile.type !== 'city' || !tile.group || !roomData) return false;
    return BOARD_CONFIG.tiles.some(
      (t) => t.type === 'city' && t.group === tile.group && (roomData.properties?.[t.id]?.houses || 0) > 0
    );
  };

  // Действия
  const startGame = () => socket.emit('start_game', { code: activeRoomCode, playerId });
  const leaveRoom = () => {
    socket.emit('leave_room', { code: activeRoomCode, playerId });
    setActiveRoomCode('');
    setRoomData(null);
  };
  const kickPlayer = (targetId) =>
    socket.emit('kick_player', { code: activeRoomCode, hostId: playerId, targetId });
  const endGameByHost = () => socket.emit('end_game', { code: activeRoomCode, hostId: playerId });
  const declareBankrupt = () => socket.emit('declare_bankrupt', { code: activeRoomCode, playerId });

  const rollDice = () => socket.emit('roll_dice', { code: activeRoomCode, playerId });
  const buyCurrentTile = () => socket.emit('buy_tile', { code: activeRoomCode, playerId });
  const buildHouse = (tileId) =>
    socket.emit('build_house', { code: activeRoomCode, playerId, tileId });
  const sellHouse = (tileId) =>
    socket.emit('sell_house', { code: activeRoomCode, playerId, tileId });
  const sellTile = (tileId) =>
    socket.emit('sell_tile', { code: activeRoomCode, playerId, tileId });
  const payBailOrUseCard = (useCard) =>
    socket.emit('leave_jail', { code: activeRoomCode, playerId, useCard });
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
        forgiveDebt,
      },
    });
    setTradeModalOpen(false);
    setOfferMoney(0);
    setRequestMoney(0);
    setOfferTiles([]);
    setRequestTiles([]);
    setOfferJailCard(false);
    setRequestJailCard(false);
    setForgiveDebt(false);
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
              O‘yinchi ismi {isTelegramUser && <span className="text-sky-400">(Telegram)</span>}
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
            <p className="text-xs text-slate-400 font-medium">Xona havolasini nusxalash:</p>
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
                    <span>Sayt havolasi</span>
                  </>
                )}
              </button>

              <button
                onClick={() => copyLink(getTelegramShareLink(), 'tg')}
                className="flex items-center justify-center gap-2 py-2.5 px-3 bg-sky-600 hover:bg-sky-500 rounded-xl text-xs font-semibold text-white transition"
              >
                {copiedType === 'tg' ? (
                  <>
                    <Check className="w-4 h-4 text-white" />
                    <span>Telegram havolasi nusxalandi!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Telegram havolasini nusxalash</span>
                  </>
                )}
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
                  <div className="flex items-center gap-2">
                    {p.id === roomData.hostId && (
                      <span className="text-[11px] px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded-md font-medium">
                        Xona egasi
                      </span>
                    )}
                    {isHost && p.id !== playerId && (
                      <button
                        onClick={() => kickPlayer(p.id)}
                        title="O‘yinchini chiqarib yuborish"
                        className="p-1 text-rose-400 hover:bg-rose-500/20 rounded-lg transition"
                      >
                        <UserX className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={leaveRoom}
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
  const isHost = roomData.hostId === playerId;
  const isMyTurn = currentPlayer?.id === playerId && roomData.status === 'playing' && !me?.bankrupt;
  const currentTile = me ? BOARD_CONFIG.tiles[me.position] : null;

  const canBuyCurrent =
    isMyTurn &&
    me.money >= 0 &&
    currentTile &&
    currentTile.type !== 'parking' &&
    (currentTile.type === 'city' ||
      currentTile.type === 'station' ||
      currentTile.type === 'company') &&
    !roomData.properties?.[currentTile.id] &&
    me.money >= currentTile.price;

  const targetPlayerObj = roomData.players.find((p) => p.id === tradeTargetId);
  const canForgiveTargetDebt =
    targetPlayerObj && targetPlayerObj.money < 0 && targetPlayerObj.owedToId === playerId;

  const winnerPlayer =
    roomData.players.find((p) => p.id === roomData.winnerId) ||
    roomData.players.find((p) => !p.bankrupt);

  // Адаптивный размер круглой иконки флага под любой GRID_SIZE (7x7 .. 13x13+)
  const flagPixelSize = `clamp(11px, calc(15vw / ${GRID_SIZE}), 22px)`;

  return (
    <div className="min-h-screen bg-[#0b1120] text-slate-100 flex flex-col lg:flex-row p-2 sm:p-4 gap-4">
      {/* ЛЕВАЯ ЧАСТЬ: ИГРОВАЯ ДОСКА NxN */}
      <div className="flex-1 flex items-center justify-center">
        <div className="relative w-full max-w-[85vh] aspect-square bg-[#111827] border-2 border-slate-700 rounded-2xl p-1.5 sm:p-2 shadow-2xl">
          <div
            className="w-full h-full grid gap-1"
            style={{
              gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${GRID_SIZE}, minmax(0, 1fr))`,
            }}
          >
            {BOARD_CONFIG.tiles.map((tile) => {
              const { row, col } = getTileGridPosition(tile.id);
              const prop = roomData.properties?.[tile.id];
              const owner = prop ? roomData.players.find((p) => p.id === prop.ownerId) : null;
              const isClickable = tile.type === 'city' || tile.type === 'station' || tile.type === 'company';
              const flagUrl = tile.type === 'city' ? getCountryFlagUrl(tile) : null;
              const edgePlacement = getFlagEdgePlacement(row, col);

              return (
                <div
                  key={tile.id}
                  onClick={() => isClickable && setSelectedTile(tile)}
                  style={{
                    gridRow: row,
                    gridColumn: col,
                  }}
                  className={`relative select-none ${isClickable ? 'cursor-pointer group' : ''}`}
                >
                  {/* Внутренняя карточка клетки */}
                  <div
                    style={{
                      borderColor: owner ? owner.color : '#334155',
                      backgroundColor: owner ? `${owner.color}22` : '#1e293b',
                    }}
                    className={`w-full h-full border-2 rounded-lg flex flex-col justify-between overflow-hidden p-0.5 sm:p-1 transition-colors group-hover:brightness-110 ${
                      flagUrl ? edgePlacement.paddingFix : ''
                    }`}
                  >
                    {tile.group ? (
                      <div
                        className="h-1.5 sm:h-2 w-full rounded-sm flex items-center justify-center gap-0.5 shrink-0"
                        style={{ backgroundColor: tile.group }}
                      >
                        {Array.from({ length: prop?.houses || 0 }).map((_, i) => (
                          <span key={i} className="w-1.5 h-1.5 bg-white rounded-full" />
                        ))}
                      </div>
                    ) : (
                      <div className="h-0.5 shrink-0" />
                    )}

                    {/* Название клетки и цена */}
                    <div className="text-center leading-tight my-auto px-0.5 overflow-hidden">
                      <div className="overflow-hidden w-full">
                        <span
                          className={`text-[9px] sm:text-[11px] font-bold text-slate-100 ${
                            tile.name.length > 7 ? 'animate-marquee sm:animate-none' : ''
                          }`}
                        >
                          {tile.name}
                        </span>
                      </div>
                      {tile.price && (
                        <div className="text-[8px] sm:text-[10px] font-mono text-emerald-400 leading-tight">
                          {tile.price}$
                        </div>
                      )}
                      {tile.subtext && (
                        <div className="text-[8px] sm:text-[10px] text-slate-400 leading-tight">
                          {tile.subtext}
                        </div>
                      )}
                    </div>

                    {/* Ник владельца (исправлена высота и отступы, чтобы низ букв не обрезался) */}
                    <div className="min-h-[14px] flex items-center justify-center overflow-hidden shrink-0">
                      {owner && (
                        <div
                          className="w-full overflow-hidden rounded px-1 py-[1px] text-center leading-none"
                          style={{ backgroundColor: owner.color }}
                        >
                          <span
                            className={`block text-[8px] sm:text-[9px] font-bold text-white leading-tight ${
                              owner.name.length > 7 ? 'animate-marquee sm:animate-none' : ''
                            }`}
                          >
                            {owner.name}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Круглая иконка флага на внутреннем крае клетки (наполовину выступает к центру) */}
                  {flagUrl && (
                    <img
                      src={flagUrl}
                      alt={tile.country || ''}
                      style={{ width: flagPixelSize, height: flagPixelSize }}
                      className={`pointer-events-none absolute z-10 rounded-full ring-1 ring-slate-900 shadow-md object-cover ${edgePlacement.posClass}`}
                    />
                  )}
                </div>
              );
            })}

            {/* ЦЕНТР ДОСКИ */}
            <div
              style={{
                gridColumnStart: 2,
                gridColumnEnd: GRID_SIZE,
                gridRowStart: 2,
                gridRowEnd: GRID_SIZE,
              }}
              className="bg-[#0f172a]/90 border border-slate-800 rounded-xl flex flex-col items-center justify-center p-3 text-center gap-2.5"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg sm:text-2xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 to-sky-400 bg-clip-text text-transparent">
                  UzMonopoly
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-slate-300">
                  #{activeRoomCode}
                </span>
              </div>

              {roomData.status === 'finished' ? (
                <div className="flex flex-col items-center gap-3 py-2">
                  <div className="flex items-center gap-2 text-amber-400 font-extrabold text-base sm:text-xl">
                    <Trophy className="w-6 h-6" />
                    <span>O‘yin yakunlandi!</span>
                  </div>
                  {winnerPlayer && (
                    <div className="text-xs sm:text-sm text-slate-300">
                      G‘olib:{' '}
                      <span
                        className="font-extrabold text-base sm:text-lg px-2 py-0.5 rounded-lg bg-slate-800"
                        style={{ color: winnerPlayer.color }}
                      >
                        {winnerPlayer.name}
                      </span>
                    </div>
                  )}
                  <button
                    onClick={leaveRoom}
                    className="mt-1 px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs sm:text-sm font-bold rounded-xl flex items-center gap-2 shadow-lg transition"
                  >
                    <LogOut className="w-4 h-4" /> Xonadan chiqish
                  </button>
                </div>
              ) : (
                <>
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
                      {me.money < 0 ? (
                        <div className="text-[11px] text-rose-400 bg-rose-500/10 border border-rose-500/30 px-3 py-1.5 rounded-lg max-w-xs">
                          Balansingiz manfiy ({me.money}$)! Tosh tashlash uchun mulk soting, savdo qiling yoki bankrot tugmasini bosing.
                        </div>
                      ) : (
                        <>
                          {!roomData.hasRolled && (
                            <button
                              onClick={rollDice}
                              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold rounded-xl flex items-center gap-1.5 shadow-lg transition"
                            >
                              <Dices className="w-4 h-4" /> Tosh tashlash
                            </button>
                          )}

                          {canBuyCurrent && (
                            <button
                              onClick={buyCurrentTile}
                              className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl flex items-center gap-1 transition"
                            >
                              <Coins className="w-4 h-4" /> Sotib olish ({currentTile.price}$)
                            </button>
                          )}

                          {roomData.hasRolled && (
                            <button
                              onClick={endTurn}
                              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs sm:text-sm font-bold rounded-xl transition"
                            >
                              Navbatni berish
                            </button>
                          )}
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
                </>
              )}
            </div>
          </div>

          {/* ФИШКИ ИГРОКОВ */}
          <div className="pointer-events-none absolute inset-1.5 sm:inset-2 z-20">
            {roomData.players
              .filter((p) => !p.bankrupt)
              .map((p, idx) => {
                const { row, col } = getTileGridPosition(p.position);
                const cellSize = 100 / GRID_SIZE;
                const offsetX = ((idx % 3) - 1) * 1.4;
                const offsetY = (Math.floor(idx / 3) - 0.5) * 1.4;

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
                    {p.name[0]?.toUpperCase()}
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* ПРАВАЯ ПАНЕЛЬ */}
      <div className="w-full lg:w-96 flex flex-col gap-3">
        <div className="bg-[#1e293b] border border-slate-700 rounded-xl p-3 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="text-[11px] text-slate-400 block">Xona kodi:</span>
              <span className="font-mono text-sm font-bold text-emerald-400">{activeRoomCode}</span>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => copyLink(getWebShareLink(), 'web')}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-xs font-medium flex items-center gap-1"
              >
                {copiedType === 'web' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>Sayt</span>
              </button>
              <button
                onClick={() => copyLink(getTelegramShareLink(), 'tg')}
                className="px-2.5 py-1.5 bg-sky-600 hover:bg-sky-500 rounded-lg text-xs font-medium flex items-center gap-1"
              >
                {copiedType === 'tg' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>Telegram</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-700/70">
            <button
              onClick={leaveRoom}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px] font-semibold flex items-center gap-1"
            >
              <LogOut className="w-3.5 h-3.5" /> Chiqish
            </button>

            {me && !me.bankrupt && roomData.status === 'playing' && (
              <button
                onClick={declareBankrupt}
                className="px-2.5 py-1.5 bg-rose-900/60 hover:bg-rose-800 border border-rose-700 text-rose-200 rounded-lg text-[11px] font-semibold flex items-center gap-1"
              >
                <Skull className="w-3.5 h-3.5" /> Bankrot
              </button>
            )}

            {isHost && roomData.status === 'playing' && (
              <button
                onClick={endGameByHost}
                className="ml-auto px-2.5 py-1.5 bg-amber-900/60 hover:bg-amber-800 border border-amber-700 text-amber-200 rounded-lg text-[11px] font-semibold flex items-center gap-1"
              >
                <OctagonX className="w-3.5 h-3.5" /> O‘yinni tugatish
              </button>
            )}
          </div>
        </div>

        {/* Список игроков */}
        <div className="bg-[#1e293b] border border-slate-700 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-slate-400">O‘yinchilar</span>
            {me && !me.bankrupt && roomData.status === 'playing' && (
              <button
                onClick={() => setTradeModalOpen(true)}
                className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-semibold flex items-center gap-1"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" /> Almashish
              </button>
            )}
          </div>

          <div className="space-y-1.5">
            {roomData.players.map((p) => (
              <div
                key={p.id}
                className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${
                  p.id === currentPlayer?.id && !p.bankrupt
                    ? 'bg-slate-800 border-emerald-500/60'
                    : 'bg-slate-900/60 border-slate-800'
                } ${p.bankrupt ? 'opacity-50' : ''}`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                  <span className={`font-semibold truncate ${p.bankrupt ? 'line-through' : ''}`}>
                    {p.name}
                  </span>
                  {p.bankrupt && (
                    <span className="text-[10px] px-1.5 bg-slate-800 text-slate-400 rounded">
                      Kuzatuvchi
                    </span>
                  )}
                  {p.inJail && !p.bankrupt && (
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  )}
                  {p.jailFreeCards > 0 && !p.bankrupt && (
                    <span className="px-1.5 py-0.2 bg-indigo-500/20 text-indigo-300 rounded text-[10px]">
                      Karta x{p.jailFreeCards}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`font-mono font-bold ${
                      p.money < 0 ? 'text-rose-400' : 'text-emerald-400'
                    }`}
                  >
                    {p.money}$
                  </span>
                  {isHost && p.id !== playerId && !p.bankrupt && (
                    <button
                      onClick={() => kickPlayer(p.id)}
                      title="O‘yindan chiqarib yuborish (Kick)"
                      className="p-1 text-rose-400 hover:bg-rose-500/20 rounded transition"
                    >
                      <UserX className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Входящее предложение обмена */}
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
                {roomData.pendingTrade.forgiveDebt ? ' + Qarzingizni kechirish (0$)' : ''}
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

        {/* Мои владения: постройка/удаление домов (50%) и продажа города (50%, если нет домов в стране) */}
        <div className="bg-[#1e293b] border border-slate-700 rounded-xl p-3 space-y-2">
          <div className="text-xs font-bold uppercase text-slate-400 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5" /> Mening mulklarim
          </div>
          <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
            {Object.entries(roomData.properties || {})
              .filter(([, prop]) => prop.ownerId === playerId)
              .map(([tid, prop]) => {
                const tile = BOARD_CONFIG.tiles.find((t) => t.id === Number(tid));
                if (!tile) return null;

                const countryCities = BOARD_CONFIG.tiles.filter(
                  (t) => t.type === 'city' && t.group === tile.group
                );
                const hasFullCountry =
                  tile.type === 'city' &&
                  countryCities.every((c) => roomData.properties[c.id]?.ownerId === playerId);

                const maxHouses = (tile.rents?.length || 1) - 1;
                const housesCount = prop.houses || 0;
                const countryHasHouses = hasHousesInCountry(tile);

                return (
                  <div
                    key={tid}
                    onClick={() => setSelectedTile(tile)}
                    className="flex items-center justify-between px-2.5 py-1.5 bg-slate-900 rounded-lg text-xs cursor-pointer hover:bg-slate-800 gap-1"
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: tile.group || '#64748b' }}
                      />
                      <span className="font-medium truncate">{tile.name}</span>
                      {tile.type === 'city' && (
                        <span className="text-[10px] text-slate-400 shrink-0">
                          ({housesCount}/{maxHouses})
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {/* Построить дом */}
                      {tile.type === 'city' && housesCount < maxHouses && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            buildHouse(tile.id);
                          }}
                          disabled={!hasFullCountry || (me?.money || 0) < tile.houseCost}
                          title={
                            !hasFullCountry
                              ? 'Uy qurish uchun shu davlatning barcha shaharlarini yig‘ing'
                              : `Uy qurish (-${tile.houseCost}$)`
                          }
                          className="px-1.5 py-0.5 bg-emerald-600/80 hover:bg-emerald-600 disabled:opacity-35 rounded text-[10px] font-semibold flex items-center gap-0.5"
                        >
                          <Home className="w-3 h-3" /> +{tile.houseCost}$
                        </button>
                      )}

                      {/* Удалить дом (+50% стоимости) */}
                      {tile.type === 'city' && housesCount > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            sellHouse(tile.id);
                          }}
                          title={`Uyni buzish (+${Math.floor(tile.houseCost / 2)}$)`}
                          className="px-1.5 py-0.5 bg-amber-600/80 hover:bg-amber-600 rounded text-[10px] font-semibold"
                        >
                          -Uy (+{Math.floor(tile.houseCost / 2)}$)
                        </button>
                      )}

                      {/* Удалить/продать город банку (+50% стоимости, если в стране нет домов) */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          sellTile(tile.id);
                        }}
                        disabled={countryHasHouses}
                        title={
                          countryHasHouses
                            ? 'Bu davlatda uy borligi sababli shaharni sotib bo‘lmaydi'
                            : `Shaharni bankka sotish (+${Math.floor(tile.price / 2)}$)`
                        }
                        className="px-1.5 py-0.5 bg-rose-600/80 hover:bg-rose-600 disabled:opacity-30 rounded text-[10px] font-semibold flex items-center gap-0.5"
                      >
                        <Trash2 className="w-3 h-3" /> +{Math.floor(tile.price / 2)}$
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* История игры */}
        <div className="flex-1 bg-[#1e293b] border border-slate-700 rounded-xl p-3 flex flex-col min-h-[150px]">
          <span className="text-xs font-bold uppercase text-slate-400 mb-1.5">O‘yin tarixi</span>
          <div className="flex-1 max-h-48 overflow-y-auto flex flex-col-reverse gap-1 text-[11px] text-slate-300 pr-1">
            {(roomData.logs || []).map((entry, idx) => (
              <div key={entry.id || idx} className="border-b border-slate-800/80 pb-1">
                {entry.segments ? (
                  entry.segments.map((seg, sIdx) => (
                    <span
                      key={sIdx}
                      style={{ color: seg.color || undefined }}
                      className={seg.bold ? 'font-bold' : ''}
                    >
                      {seg.text}
                    </span>
                  ))
                ) : (
                  <span>{String(entry)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* МОДАЛЬНОЕ ОКНО ИНФОРМАЦИИ О КАРТОЧКЕ */}
      {selectedTile && (
        <div
          onClick={() => setSelectedTile(null)}
          className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs bg-[#1e293b] border border-slate-600 rounded-2xl overflow-hidden shadow-2xl text-xs"
          >
            <div
              className="p-3.5 flex items-center justify-between text-white font-bold"
              style={{ backgroundColor: selectedTile.group || '#334155' }}
            >
              <div className="flex items-center gap-2.5">
                {selectedTile.type === 'city' && getCountryFlagUrl(selectedTile) && (
                  <img
                    src={getCountryFlagUrl(selectedTile)}
                    alt=""
                    className="w-6 h-6 rounded-full ring-1 ring-white/60"
                  />
                )}
                <div>
                  <div className="text-base">{selectedTile.name}</div>
                  {selectedTile.country && (
                    <div className="text-[11px] opacity-90">{selectedTile.country}</div>
                  )}
                </div>
              </div>
              <button onClick={() => setSelectedTile(null)} className="p-1 hover:bg-black/20 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-2.5 text-slate-200">
              <div className="flex justify-between font-semibold border-b border-slate-700 pb-2">
                <span>Sotib olish narxi:</span>
                <span className="text-emerald-400 font-mono">{selectedTile.price}$</span>
              </div>

              {selectedTile.type === 'city' && (
                <>
                  <div className="flex justify-between font-semibold border-b border-slate-700 pb-2">
                    <span>1 ta uy qurish narxi:</span>
                    <span className="text-amber-400 font-mono">{selectedTile.houseCost}$</span>
                  </div>
                  <div className="space-y-1.5 pt-1">
                    <div className="text-[11px] uppercase text-slate-400 font-bold">
                      Ijara narxlari:
                    </div>
                    {selectedTile.rents.map((r, hIdx) => (
                      <div key={hIdx} className="flex justify-between text-slate-300">
                        <span>{hIdx === 0 ? 'Uysiz (asosiy)' : `${hIdx} ta uy bilan`}:</span>
                        <span className="font-mono font-bold text-white">{r}$</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {selectedTile.type === 'station' && (
                <div className="space-y-1.5 pt-1">
                  <div className="text-[11px] uppercase text-slate-400 font-bold">
                    Stansiyalar soniga qarab ijara:
                  </div>
                  {BOARD_CONFIG.stationRents.map((r, sIdx) => (
                    <div key={sIdx} className="flex justify-between text-slate-300">
                      <span>{sIdx + 1} ta stansiya bo‘lsa:</span>
                      <span className="font-mono font-bold text-white">{r}$</span>
                    </div>
                  ))}
                </div>
              )}

              {selectedTile.type === 'company' && (
                <div className="space-y-1.5 pt-1">
                  <div className="text-[11px] uppercase text-slate-400 font-bold">
                    Kompaniyalar soniga qarab to‘lov:
                  </div>
                  {(BOARD_CONFIG.companyMultipliers || [4, 10]).map((mult, cIdx) => (
                    <div key={cIdx} className="flex justify-between text-slate-300">
                      <span>{cIdx + 1} ta kompaniya bo‘lsa:</span>
                      <span className="font-mono font-bold text-white">
                        tashlangan tosh × {mult}$
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* МОДАЛЬНОЕ ОКНО ТОРГОВЛИ (нельзя выбрать города стран, где есть дома) */}
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
                  setForgiveDebt(false);
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

            {canForgiveTargetDebt && (
              <label className="flex items-center gap-2 p-2.5 bg-emerald-500/10 border border-emerald-500/40 rounded-xl text-emerald-300 font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={forgiveDebt}
                  onChange={(e) => setForgiveDebt(e.target.checked)}
                />
                <span>
                  {targetPlayerObj.name}ning qarzini kechirish (hisobini 0$ ga tushirish)
                </span>
              </label>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-900 p-3 rounded-xl space-y-2">
                <div className="font-bold text-emerald-400">Siz berasiz:</div>
                <input
                  type="number"
                  min={0}
                  max={Math.max(0, me?.money || 0)}
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
                      const blocked = hasHousesInCountry(t);
                      return (
                        <label
                          key={tid}
                          title={blocked ? 'Bu davlatda uy borligi uchun almashib bo‘lmaydi' : ''}
                          className={`flex items-center gap-1.5 ${blocked ? 'opacity-40 cursor-not-allowed' : ''}`}
                        >
                          <input
                            type="checkbox"
                            disabled={blocked}
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
                {(targetPlayerObj?.jailFreeCards || 0) > 0 && (
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
                      const blocked = hasHousesInCountry(t);
                      return (
                        <label
                          key={tid}
                          title={blocked ? 'Bu davlatda uy borligi uchun almashib bo‘lmaydi' : ''}
                          className={`flex items-center gap-1.5 ${blocked ? 'opacity-40 cursor-not-allowed' : ''}`}
                        >
                          <input
                            type="checkbox"
                            disabled={blocked}
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
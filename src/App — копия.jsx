import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, updateDoc, getDoc } from 'firebase/firestore';
import { Dices, Building2, Train, Zap, AlertCircle, ArrowRight, Home, ArrowLeftRight } from 'lucide-react';

// Предотвращение ошибки "tailwind is not defined" при асинхронной загрузке CDN
if (typeof window !== 'undefined') {
    window.tailwind = window.tailwind || {};
    window.tailwind.config = window.tailwind.config || {};
}

// ==========================================
// 1. JSON ИГРОВАЯ КОНФИГУРАЦИЯ (Узбекистан)
// ==========================================
const BOARD_CONFIG = [
  { id: 0, name: 'BOSH', type: 'corner', color: 'bg-slate-200' },
  { id: 1, name: 'Chilonzor', type: 'property', group: 'brown', price: 60, rent: 2, housePrice: 50, color: 'bg-amber-800' },
  { id: 2, name: 'Jamoat Fondi', type: 'chance', color: 'bg-slate-800' },
  { id: 3, name: 'Yunusobod', type: 'property', group: 'brown', price: 60, rent: 4, housePrice: 50, color: 'bg-amber-800' },
  { id: 4, name: 'Daromad Solig\'i', type: 'tax', price: 200, color: 'bg-slate-800' },
  { id: 5, name: 'Toshkent Vokzali', type: 'station', price: 200, rent: 25, color: 'bg-slate-700' },
  { id: 6, name: 'Nukus', type: 'property', group: 'lightblue', price: 100, rent: 6, housePrice: 50, color: 'bg-sky-300' },
  { id: 7, name: 'Imkoniyat', type: 'chance', color: 'bg-slate-800' },
  { id: 8, name: 'Urganch', type: 'property', group: 'lightblue', price: 100, rent: 6, housePrice: 50, color: 'bg-sky-300' },
  { id: 9, name: 'Xiva', type: 'property', group: 'lightblue', price: 120, rent: 8, housePrice: 50, color: 'bg-sky-300' },
  { id: 10, name: 'Qamoq', type: 'corner', color: 'bg-slate-800' },
  { id: 11, name: 'Navoiy', type: 'property', group: 'pink', price: 140, rent: 10, housePrice: 100, color: 'bg-pink-500' },
  { id: 12, name: 'Elektr Tarmoqlari', type: 'utility', price: 150, rent: 10, color: 'bg-slate-700' },
  { id: 13, name: 'Zarafshon', type: 'property', group: 'pink', price: 140, rent: 10, housePrice: 100, color: 'bg-pink-500' },
  { id: 14, name: 'Buxoro', type: 'property', group: 'pink', price: 160, rent: 12, housePrice: 100, color: 'bg-pink-500' },
  { id: 15, name: 'Samarqand Vokzali', type: 'station', price: 200, rent: 25, color: 'bg-slate-700' },
  { id: 16, name: 'Qarshi', type: 'property', group: 'orange', price: 180, rent: 14, housePrice: 100, color: 'bg-orange-500' },
  { id: 17, name: 'Jamoat Fondi', type: 'chance', color: 'bg-slate-800' },
  { id: 18, name: 'Shahrisabz', type: 'property', group: 'orange', price: 180, rent: 14, housePrice: 100, color: 'bg-orange-500' },
  { id: 19, name: 'Termiz', type: 'property', group: 'orange', price: 200, rent: 16, housePrice: 100, color: 'bg-orange-500' },
  { id: 20, name: 'Bepul Parkovka', type: 'corner', color: 'bg-slate-800' },
  { id: 21, name: 'Jizzax', type: 'property', group: 'red', price: 220, rent: 18, housePrice: 150, color: 'bg-red-500' },
  { id: 22, name: 'Imkoniyat', type: 'chance', color: 'bg-slate-800' },
  { id: 23, name: 'Guliston', type: 'property', group: 'red', price: 220, rent: 18, housePrice: 150, color: 'bg-red-500' },
  { id: 24, name: 'Angren', type: 'property', group: 'red', price: 240, rent: 20, housePrice: 150, color: 'bg-red-500' },
  { id: 25, name: 'Buxoro Vokzali', type: 'station', price: 200, rent: 25, color: 'bg-slate-700' },
  { id: 26, name: 'Qo\'qon', type: 'property', group: 'yellow', price: 260, rent: 22, housePrice: 150, color: 'bg-yellow-400' },
  { id: 27, name: 'Marg\'ilon', type: 'property', group: 'yellow', price: 260, rent: 22, housePrice: 150, color: 'bg-yellow-400' },
  { id: 28, name: 'Suv Ta\'minoti', type: 'utility', price: 150, rent: 10, color: 'bg-slate-700' },
  { id: 29, name: 'Farg\'ona', type: 'property', group: 'yellow', price: 280, rent: 24, housePrice: 150, color: 'bg-yellow-400' },
  { id: 30, name: 'Qamoqqa Bor', type: 'corner', color: 'bg-slate-800' },
  { id: 31, name: 'Namangan', type: 'property', group: 'green', price: 300, rent: 26, housePrice: 200, color: 'bg-green-500' },
  { id: 32, name: 'Andijon', type: 'property', group: 'green', price: 300, rent: 26, housePrice: 200, color: 'bg-green-500' },
  { id: 33, name: 'Jamoat Fondi', type: 'chance', color: 'bg-slate-800' },
  { id: 34, name: 'Shahrixon', type: 'property', group: 'green', price: 320, rent: 28, housePrice: 200, color: 'bg-green-500' },
  { id: 35, name: 'Andijon Vokzali', type: 'station', price: 200, rent: 25, color: 'bg-slate-700' },
  { id: 36, name: 'Imkoniyat', type: 'chance', color: 'bg-slate-800' },
  { id: 37, name: 'Samarqand', type: 'property', group: 'darkblue', price: 350, rent: 35, housePrice: 200, color: 'bg-blue-600' },
  { id: 38, name: 'Hashamat Solig\'i', type: 'tax', price: 100, color: 'bg-slate-800' },
  { id: 39, name: 'Toshkent', type: 'property', group: 'darkblue', price: 400, rent: 50, housePrice: 200, color: 'bg-blue-600' },
];

const COLORS = ['bg-blue-500', 'bg-red-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500', 'bg-pink-500'];

// ==========================================
// 2. ИНИЦИАЛИЗАЦИЯ FIREBASE
// ==========================================
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const app = Object.keys(firebaseConfig).length > 0 ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'monopoly-app-id';

// ==========================================
// 3. ОСНОВНОЙ КОМПОНЕНТ
// ==========================================
export default function UzMonopolyOnline() {
  const [user, setUser] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [isTrading, setIsTrading] = useState(false);
  const [tradeOffer, setTradeOffer] = useState({ targetId: '', giveMoney: 0, giveProps: [], getMoney: 0, getProps: [] });
  const logsEndRef = useRef(null);

  // Новые состояния для Главного меню
  const [joinedRoomId, setJoinedRoomId] = useState(null);
  const [nickname, setNickname] = useState('');
  const [isTgUser, setIsTgUser] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [roomPassword, setRoomPassword] = useState('');
  const [menuError, setMenuError] = useState('');

  // Инициализация имени из Telegram
  useEffect(() => {
    if (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp) {
        const initData = window.Telegram.WebApp.initDataUnsafe;
        if (initData && initData.user) {
            const tgName = initData.user.first_name || initData.user.username;
            setNickname(tgName);
            setIsTgUser(true);
        }
    }
  }, []);

  // Авторизация
  useEffect(() => {
    if (!auth) return;
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) {
        console.error("Auth error", e);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // Подписка на состояние комнаты
  useEffect(() => {
    if (!user || !db || !joinedRoomId) return;
    const gameDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', joinedRoomId);
    
    const unsubscribe = onSnapshot(gameDocRef, (docSnap) => {
      if (docSnap.exists()) {
        setGameState(docSnap.data());
      } else {
        // Комната должна быть создана через меню, но на всякий случай оставим резервный фолбэк
        setDoc(gameDocRef, {
          status: 'LOBBY', 
          players: {}, 
          playerOrder: [],
          turnIndex: 0,
          properties: {}, 
          dice: [1, 1],
          logs: ['Xona yaratildi...'],
          pendingAction: null
        });
      }
    }, (error) => console.error(error));

    return () => unsubscribe();
  }, [user, joinedRoomId]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [gameState?.logs]);

  // ==========================================
  // ЛОГИКА ИГРЫ
  // ==========================================
  const pushStateUpdate = async (newStateUpdates) => {
    if (!user || !db || !joinedRoomId) return;
    const gameDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', joinedRoomId);
    await updateDoc(gameDocRef, newStateUpdates);
  };

  const addLog = (msg, currentLogs) => {
    return [...(currentLogs || gameState.logs), msg].slice(-30);
  };

  const joinGame = async () => {
    if (!user) return;
    
    const playerName = nickname || `O'yinchi ${gameState.playerOrder.length + 1}`;
    
    const newPlayer = {
      name: playerName,
      color: COLORS[gameState.playerOrder.length % COLORS.length],
      balance: 1500,
      pos: 0,
      inJail: false,
      jailTurns: 0
    };
    await pushStateUpdate({
      [`players.${user.uid}`]: newPlayer,
      playerOrder: [...gameState.playerOrder, user.uid],
      logs: addLog(`${newPlayer.name} o'yinga qo'shildi.`, gameState.logs)
    });
  };

  const startGame = async () => {
    await pushStateUpdate({
      status: 'PLAYING',
      logs: addLog('O\'yin boshlandi!', gameState.logs)
    });
  };

  const rollDice = async () => {
    if (!isMyTurn || gameState.pendingAction) return;
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    let logs = addLog(`${me.name} tosh tashladi: ${d1} va ${d2}.`, gameState.logs);
    
    let newPos = me.pos + d1 + d2;
    let newBalance = me.balance;
    let pendingAction = null;
    let nextTurn = (gameState.turnIndex + 1) % gameState.playerOrder.length;

    if (newPos >= 40) {
      newPos = newPos % 40;
      newBalance += 200;
      logs = addLog(`${me.name} BOSH qatoridan o'tdi va $200 oldi.`, logs);
    }
    
    const space = BOARD_CONFIG[newPos];
    
    if (space.id === 30) {
        newPos = 10;
        logs = addLog(`${me.name} qamoqqa tushdi!`, logs);
    } else if (space.type === 'property' || space.type === 'station' || space.type === 'utility') {
        const owner = gameState.properties?.[space.id]?.owner;
        if (!owner) {
            pendingAction = { type: 'BUY', spaceId: space.id };
            nextTurn = gameState.turnIndex;
        } else if (owner !== user.uid) {
            let rent = space.rent || 25; 
            newBalance -= rent;
            const ownerName = gameState.players[owner].name;
            logs = addLog(`${me.name} $${rent} ijara to'ladi (${ownerName} ga).`, logs);
            await pushStateUpdate({
                [`players.${owner}.balance`]: gameState.players[owner].balance + rent,
            });
        }
    } else if (space.type === 'tax') {
        newBalance -= space.price;
        logs = addLog(`${me.name} $${space.price} soliq to'ladi.`, logs);
    }

    await pushStateUpdate({
        dice: [d1, d2],
        [`players.${user.uid}.pos`]: newPos,
        [`players.${user.uid}.balance`]: newBalance,
        logs: logs,
        pendingAction: pendingAction,
        turnIndex: pendingAction ? gameState.turnIndex : nextTurn
    });
  };

  const handleBuy = async (buy) => {
      const space = BOARD_CONFIG[gameState.pendingAction.spaceId];
      let logs = gameState.logs;
      
      if (buy && me.balance >= space.price) {
          logs = addLog(`${me.name} ${space.name}ni $${space.price} ga sotib oldi.`, logs);
          await pushStateUpdate({
              [`players.${user.uid}.balance`]: me.balance - space.price,
              [`properties.${space.id}`]: { owner: user.uid, houses: 0 },
              pendingAction: null,
              turnIndex: (gameState.turnIndex + 1) % gameState.playerOrder.length,
              logs: logs
          });
      } else {
          logs = addLog(`${me.name} ${space.name}ni sotib olishni rad etdi.`, logs);
          await pushStateUpdate({
              pendingAction: null,
              turnIndex: (gameState.turnIndex + 1) % gameState.playerOrder.length,
              logs: logs
          });
      }
  };

  const submitTrade = async () => {
      const targetName = gameState.players[tradeOffer.targetId].name;
      await pushStateUpdate({
          pendingAction: {
              type: 'TRADE',
              from: user.uid,
              to: tradeOffer.targetId,
              offer: tradeOffer
          },
          logs: addLog(`${me.name} ${targetName} ga ayirboshlash taklif qildi.`, gameState.logs)
      });
      setIsTrading(false);
  };

  const respondTrade = async (accept) => {
      const action = gameState.pendingAction;
      const offer = action.offer;
      let logs = gameState.logs;
      
      if (accept) {
          logs = addLog(`${me.name} ${gameState.players[action.from].name} ning taklifini qabul qildi!`, logs);
          const updates = { pendingAction: null, logs: logs };
          
          updates[`players.${action.from}.balance`] = gameState.players[action.from].balance - offer.giveMoney + offer.getMoney;
          updates[`players.${action.to}.balance`] = gameState.players[action.to].balance + offer.giveMoney - offer.getMoney;
          
          offer.giveProps.forEach(propId => { updates[`properties.${propId}.owner`] = action.to; });
          offer.getProps.forEach(propId => { updates[`properties.${propId}.owner`] = action.from; });
          
          await pushStateUpdate(updates);
      } else {
          logs = addLog(`${me.name} taklifni rad etdi.`, logs);
          await pushStateUpdate({ pendingAction: null, logs: logs });
      }
  };

  // ==========================================
  // ЛОГИКА ГЛАВНОГО МЕНЮ
  // ==========================================
  const handleCreateRoom = async () => {
      setMenuError('');
      if (!roomCode || !nickname) return setMenuError("Iltimos kod va nikni kiriting!");
      const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomCode);
      const snap = await getDoc(roomRef);
      
      if (snap.exists()) {
          return setMenuError("Bu xona allaqachon mavjud. Boshqa kod ishlating yoki unga kiring.");
      }
      
      await setDoc(roomRef, {
          password: roomPassword,
          status: 'LOBBY', 
          players: {}, 
          playerOrder: [],
          turnIndex: 0,
          properties: {}, 
          dice: [1, 1],
          logs: ['Xona yaratildi! O\'yinchilar kutilmoqda...'],
          pendingAction: null
      });
      setJoinedRoomId(roomCode);
  };

  const handleJoinRoom = async () => {
      setMenuError('');
      if (!roomCode || !nickname) return setMenuError("Iltimos kod va nikni kiriting!");
      const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomCode);
      const snap = await getDoc(roomRef);
      
      if (!snap.exists()) {
          return setMenuError("Bunday xona topilmadi!");
      }
      
      if (snap.data().password !== roomPassword) {
          return setMenuError("Parol noto'g'ri!");
      }
      
      setJoinedRoomId(roomCode);
  };


  // ==========================================
  // UTILS ДЛЯ ОТРИСОВКИ КАРТЫ (ВЕРХ-ЛЕВО + ПО ЧАСОВОЙ)
  // ==========================================
  const isCorner = (id) => id % 10 === 0;

  // CSS Grid позиционирование (Старт в 1:1, по часовой стрелке)
  const getGridArea = (id) => {
    if (id === 0) return { gridColumn: 1, gridRow: 1 }; // Верх-Лево
    if (id >= 1 && id <= 9) return { gridColumn: 1 + id, gridRow: 1 }; // Верх
    if (id === 10) return { gridColumn: 11, gridRow: 1 }; // Верх-Право
    if (id >= 11 && id <= 19) return { gridColumn: 11, gridRow: 1 + (id - 10) }; // Право
    if (id === 20) return { gridColumn: 11, gridRow: 11 }; // Низ-Право
    if (id >= 21 && id <= 29) return { gridColumn: 11 - (id - 20), gridRow: 11 }; // Низ
    if (id === 30) return { gridColumn: 1, gridRow: 11 }; // Низ-Лево
    if (id >= 31 && id <= 39) return { gridColumn: 1, gridRow: 11 - (id - 30) }; // Лево
    return {};
  };

  // Абсолютные координаты для фишек (%)
  const getTokenCoords = (id, playerIndex, totalPlayers) => {
    let left = 0, top = 0;
    const cornerSize = 12.5; 
    const edgeSize = 8.3333;

    if (id === 0) { left = cornerSize/2; top = cornerSize/2; }
    else if (id >= 1 && id <= 9) { left = cornerSize + (id - 0.5) * edgeSize; top = cornerSize/2; }
    else if (id === 10) { left = 100 - cornerSize/2; top = cornerSize/2; }
    else if (id >= 11 && id <= 19) { left = 100 - cornerSize/2; top = cornerSize + (id - 10 - 0.5) * edgeSize; }
    else if (id === 20) { left = 100 - cornerSize/2; top = 100 - cornerSize/2; }
    else if (id >= 21 && id <= 29) { left = 100 - cornerSize - (id - 20 - 0.5) * edgeSize; top = 100 - cornerSize/2; }
    else if (id === 30) { left = cornerSize/2; top = 100 - cornerSize/2; }
    else if (id >= 31 && id <= 39) { left = cornerSize/2; top = 100 - cornerSize - (id - 30 - 0.5) * edgeSize; }

    const angle = playerIndex * ((Math.PI * 2) / Math.max(1, totalPlayers));
    const radius = isCorner(id) ? 2.5 : 1.5; 
    
    return {
        left: `${left + Math.cos(angle) * radius}%`,
        top: `${top + Math.sin(angle) * radius}%`
    };
  };

  if (!app || !db) return <div className="p-8 text-white flex justify-center items-center h-screen bg-slate-950 font-bold">Firebase sozlanmoqda...</div>;

  // Главное меню (если комната еще не выбрана)
  if (!joinedRoomId) {
      return (
          <div className="h-screen bg-slate-950 flex items-center justify-center p-4 font-sans text-slate-200 relative overflow-hidden">
              {/* Фоновый декор */}
              <div className="absolute inset-0 opacity-10 flex items-center justify-center pointer-events-none">
                  <Building2 size={400} />
              </div>
              
              <div className="bg-slate-900 border border-slate-700 p-8 rounded-2xl shadow-2xl z-10 w-full max-w-md">
                  <div className="flex flex-col items-center mb-8">
                      <Building2 size={48} className="text-emerald-500 mb-4" />
                      <h1 className="text-3xl font-black tracking-widest text-white uppercase text-center">UzMonopoly</h1>
                  </div>

                  {menuError && (
                      <div className="mb-4 bg-red-900/50 border border-red-500 text-red-200 p-3 rounded-lg text-sm text-center">
                          {menuError}
                      </div>
                  )}

                  <div className="flex flex-col gap-4">
                      <div>
                          <label className="text-xs text-slate-400 mb-1 block">Nik (Ismingiz)</label>
                          <input 
                              type="text" 
                              value={nickname}
                              onChange={(e) => setNickname(e.target.value)}
                              disabled={isTgUser}
                              placeholder="Ismingizni kiriting"
                              className={`w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white outline-none focus:border-emerald-500 transition-colors ${isTgUser ? 'opacity-70 cursor-not-allowed' : ''}`}
                          />
                          {isTgUser && <span className="text-[10px] text-emerald-500 mt-1 block">Telegram orqali avtomatik to'ldirildi</span>}
                      </div>

                      <div>
                          <label className="text-xs text-slate-400 mb-1 block">Xona kodi</label>
                          <input 
                              type="text" 
                              value={roomCode}
                              onChange={(e) => setRoomCode(e.target.value)}
                              placeholder="Masalan: 12345"
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white outline-none focus:border-indigo-500 transition-colors"
                          />
                      </div>

                      <div>
                          <label className="text-xs text-slate-400 mb-1 block">Xona paroli (ixtiyoriy)</label>
                          <input 
                              type="password" 
                              value={roomPassword}
                              onChange={(e) => setRoomPassword(e.target.value)}
                              placeholder="Maxfiy so'z"
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white outline-none focus:border-indigo-500 transition-colors"
                          />
                      </div>

                      <div className="flex gap-3 mt-4">
                          <button onClick={handleCreateRoom} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-lg shadow-lg transition-transform active:scale-95 text-sm">
                              Xona yaratish
                          </button>
                          <button onClick={handleJoinRoom} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-lg shadow-lg transition-transform active:scale-95 text-sm">
                              Xonaga kirish
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      );
  }

  if (!gameState) return <div className="p-8 text-white flex justify-center items-center h-screen bg-slate-950 font-bold animate-pulse">Xona yuklanmoqda...</div>;

  const me = gameState.players[user?.uid];
  const isMyTurn = gameState.playerOrder[gameState.turnIndex] === user?.uid;
  const currentPlayer = gameState.players[gameState.playerOrder[gameState.turnIndex]];

  return (
    <div className="h-screen bg-slate-950 text-slate-200 font-sans flex flex-col xl:flex-row overflow-y-auto xl:overflow-hidden">
      
      {/* ПАНЕЛЬ УПРАВЛЕНИЯ */}
      <div className="w-full xl:w-[400px] xl:min-w-[400px] bg-slate-900 border-t xl:border-t-0 xl:border-r border-slate-800 flex flex-col z-20 shadow-2xl relative order-2 xl:order-1 xl:h-screen">
        <div className="p-4 border-b border-slate-800 bg-slate-950 flex items-center justify-between shrink-0">
          <h1 className="text-xl font-black tracking-widest text-emerald-400 uppercase flex items-center gap-2">
            <Building2 size={24} /> UzMonopoly
          </h1>
        </div>

        {gameState.status === 'LOBBY' ? (
          <div className="p-6 flex flex-col gap-4 flex-1 overflow-y-auto">
            <h2 className="text-lg font-bold text-slate-300">Kutish Zali</h2>
            <div className="flex flex-col gap-2">
              {gameState.playerOrder.map((uid, i) => (
                <div key={uid} className="flex items-center gap-3 bg-slate-800 p-3 rounded-lg border border-slate-700">
                  <div className={`w-4 h-4 rounded-full ${gameState.players[uid].color}`}></div>
                  <span className="font-semibold">{gameState.players[uid].name} {uid === user?.uid ? '(Siz)' : ''}</span>
                </div>
              ))}
            </div>
            {!me ? (
              <button onClick={joinGame} className="mt-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-lg transition-colors shadow-lg">
                Qo'shilish
              </button>
            ) : (
              <button onClick={startGame} disabled={gameState.playerOrder.length < 2} className="mt-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white font-bold py-3 rounded-lg transition-colors">
                O'yinni boshlash (2+ kerak)
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col h-full overflow-hidden">
            {/* Игроки */}
            <div className="p-4 overflow-y-auto flex flex-col gap-2 shrink-0 max-h-[30vh] xl:max-h-[40%] border-b border-slate-800">
              {gameState.playerOrder.map((uid, idx) => {
                const p = gameState.players[uid];
                const isActive = gameState.turnIndex === idx;
                return (
                  <div key={uid} className={`p-2 sm:p-3 rounded-xl border ${isActive ? 'border-emerald-500 bg-slate-800 shadow-[0_0_15px_rgba(16,185,129,0.15)]' : 'border-slate-700 bg-slate-900'} relative overflow-hidden transition-all`}>
                    {isActive && <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>}
                    <div className="flex justify-between items-center mb-1">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${p.color}`}></div>
                        <span className="font-bold text-xs sm:text-sm">{p.name} {uid === user?.uid ? '(Siz)' : ''}</span>
                      </div>
                      <span className="text-emerald-400 font-bold text-sm sm:text-base">${p.balance}</span>
                    </div>
                    {p.inJail && <span className="text-[10px] bg-red-900/50 text-red-400 px-2 py-0.5 rounded border border-red-800">Qamoqda ({p.jailTurns}/3)</span>}
                  </div>
                );
              })}
            </div>

            {/* Активная зона действий */}
            <div className="p-4 bg-slate-900 border-b border-slate-800 shrink-0 min-h-[120px] flex flex-col justify-center items-center">
                {gameState.pendingAction ? (
                   <div className="w-full text-center">
                     {gameState.pendingAction.type === 'BUY' && isMyTurn && (
                       <div className="animate-in fade-in zoom-in p-3 sm:p-4 bg-slate-800 border border-slate-700 rounded-xl shadow-lg">
                          <p className="text-xs sm:text-sm text-slate-300 mb-3"><strong className="text-white">{BOARD_CONFIG[gameState.pendingAction.spaceId].name}</strong>ni <strong className="text-emerald-400">${BOARD_CONFIG[gameState.pendingAction.spaceId].price}</strong> ga sotib olasizmi?</p>
                          <div className="flex gap-2">
                            <button onClick={() => handleBuy(true)} className="flex-1 bg-emerald-600 py-2 rounded text-sm font-bold hover:bg-emerald-500 shadow-md">Sotib olish</button>
                            <button onClick={() => handleBuy(false)} className="flex-1 bg-slate-700 py-2 rounded text-sm font-bold hover:bg-slate-600 shadow-md">Rad etish</button>
                          </div>
                       </div>
                     )}
                     {gameState.pendingAction.type === 'BUY' && !isMyTurn && (
                         <p className="text-slate-400 text-sm animate-pulse">{currentPlayer?.name} mulk sotib olmoqda...</p>
                     )}
                     {gameState.pendingAction.type === 'TRADE' && gameState.pendingAction.to === user?.uid && (
                        <div className="animate-in fade-in p-4 bg-indigo-900/50 border border-indigo-500 rounded-xl shadow-lg">
                           <p className="text-sm font-bold text-indigo-200 mb-2">Sizga ayirboshlash taklif qilindi!</p>
                           <div className="flex gap-2">
                             <button onClick={() => respondTrade(true)} className="flex-1 bg-indigo-600 py-2 rounded text-sm font-bold hover:bg-indigo-500">Qabul qilish</button>
                             <button onClick={() => respondTrade(false)} className="flex-1 bg-slate-700 py-2 rounded text-sm font-bold hover:bg-slate-600">Rad etish</button>
                           </div>
                        </div>
                     )}
                   </div>
                ) : (
                   <div className="flex flex-col items-center gap-3 w-full">
                      {isMyTurn ? (
                        <>
                            <button onClick={rollDice} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-6 rounded-full flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/50 transition-transform active:scale-95 w-full max-w-[250px]">
                              <Dices size={20} /> Tosh tashlash
                            </button>
                            <button onClick={() => setIsTrading(true)} className="text-xs sm:text-sm text-slate-400 hover:text-white flex items-center gap-1 border border-slate-700 px-4 py-1.5 rounded-full bg-slate-800 transition-colors">
                               <ArrowLeftRight size={14} /> Ayirboshlash taklif qilish
                            </button>
                        </>
                      ) : (
                        <div className="text-center">
                          <p className="text-slate-400 text-xs sm:text-sm mb-1">Navbat kutilmoqda...</p>
                          <p className="font-bold text-base sm:text-lg text-white">{currentPlayer?.name}</p>
                          <div className="flex gap-2 justify-center mt-2 opacity-50">
                             <div className="w-8 h-8 sm:w-10 sm:h-10 bg-slate-800 border border-slate-700 rounded-lg flex items-center justify-center text-lg sm:text-xl font-bold">{gameState.dice[0]}</div>
                             <div className="w-8 h-8 sm:w-10 sm:h-10 bg-slate-800 border border-slate-700 rounded-lg flex items-center justify-center text-lg sm:text-xl font-bold">{gameState.dice[1]}</div>
                          </div>
                        </div>
                      )}
                   </div>
                )}
            </div>

            {/* Логи событий */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2 text-[10px] sm:text-xs font-mono bg-slate-950 min-h-[150px]">
               {gameState.logs.map((log, i) => (
                 <div key={i} className="text-slate-400 border-b border-slate-800/50 pb-1">{String(log)}</div>
               ))}
               <div ref={logsEndRef} />
            </div>
          </div>
        )}
      </div>

      {/* ИГРОВОЕ ПОЛЕ */}
      <div className="flex-1 bg-[#0f172a] relative flex items-center justify-center p-2 sm:p-4 lg:p-8 order-1 xl:order-2 overflow-hidden min-h-[100vw] xl:min-h-0">
        <div className="w-full max-w-[800px] aspect-square relative bg-slate-950 border-2 border-slate-700 shadow-2xl rounded p-[2px]">
          
          <div className="w-full h-full grid" style={{
              gridTemplateColumns: '1.5fr repeat(9, 1fr) 1.5fr',
              gridTemplateRows: '1.5fr repeat(9, 1fr) 1.5fr',
              gap: '1px'
          }}>
              
            {/* Центр доски */}
            <div className="bg-[#0f172a] flex flex-col items-center justify-center shadow-inner relative z-0 rounded-xl m-1 border-2 border-slate-800/50 overflow-hidden" style={{ gridColumn: '2 / 11', gridRow: '2 / 11' }}>
               <Building2 size={64} className="text-slate-700/60 mb-4 sm:mb-8 sm:w-24 sm:h-24 md:w-32 md:h-32" />
               <div className="absolute text-slate-800/40 font-black text-2xl sm:text-4xl md:text-6xl tracking-widest uppercase mb-32 md:mb-48">UzMonopoly</div>
               
               {gameState.status === 'PLAYING' && (
                  <div className="flex gap-2 sm:gap-4 z-10">
                      <div className="w-10 h-10 sm:w-16 sm:h-16 bg-slate-800 border-2 border-slate-600 rounded-xl flex items-center justify-center text-xl sm:text-4xl font-black text-white shadow-lg shadow-black/50">
                        {gameState.dice[0]}
                      </div>
                      <div className="w-10 h-10 sm:w-16 sm:h-16 bg-slate-800 border-2 border-slate-600 rounded-xl flex items-center justify-center text-xl sm:text-4xl font-black text-white shadow-lg shadow-black/50">
                        {gameState.dice[1]}
                      </div>
                  </div>
               )}
            </div>

            {/* Клетки доски */}
            {BOARD_CONFIG.map((space) => {
              const isCorn = isCorner(space.id);
              const gridStyles = getGridArea(space.id);
              
              // Направления с учетом "по часовой стрелке" (Старт = Верх-Лево)
              const isTop = space.id > 0 && space.id < 10;
              const isRight = space.id > 10 && space.id < 20;
              const isBottom = space.id > 20 && space.id < 30;
              const isLeft = space.id > 30 && space.id < 40;

              let containerClass = "absolute inset-0 flex ";
              if (isTop) containerClass += "flex-col-reverse"; 
              if (isRight) containerClass += "flex-row";       
              if (isBottom) containerClass += "flex-col";       
              if (isLeft) containerClass += "flex-row-reverse"; 

              const hasColor = space.type === 'property';
              let colorBarClass = "";
              if (isTop || isBottom) colorBarClass = `w-full h-[25%] ${space.color || ''}`;
              if (isLeft || isRight) colorBarClass = `w-[25%] h-full ${space.color || ''}`;

              const ownerId = gameState.properties?.[space.id]?.owner;
              const ownerColor = ownerId ? gameState.players[ownerId].color : null;

              let textRot = "";
              if (isRight) textRot = "-rotate-90";
              if (isBottom) textRot = ""; // Прямо
              if (isLeft) textRot = "rotate-90";
              if (isTop) textRot = "rotate-180";

              return (
                <div 
                  key={space.id}
                  style={gridStyles}
                  className={`relative bg-slate-900 border border-slate-700/80 overflow-hidden ${isCorn ? 'flex items-center justify-center p-1 sm:p-2' : ''}`}
                >
                  {isCorn ? (
                     <span className="font-black text-[8px] sm:text-[10px] md:text-sm lg:text-base text-center leading-tight uppercase text-slate-300">
                        {space.name}
                     </span>
                  ) : (
                     <div className={containerClass}>
                        {hasColor && (
                            <div className={`${colorBarClass} relative flex items-center justify-center border-slate-800/80`}
                                 style={{ 
                                     borderBottomWidth: isTop ? '1px' : '0', 
                                     borderTopWidth: isBottom ? '1px' : '0',
                                     borderLeftWidth: isRight ? '1px' : '0',
                                     borderRightWidth: isLeft ? '1px' : '0' 
                                 }}>
                                {ownerColor && <div className={`absolute inset-0 opacity-80 ${ownerColor}`}></div>}
                            </div>
                        )}
                        <div className="flex-1 flex items-center justify-center w-full h-full relative overflow-hidden bg-slate-900/50">
                            <div className={`flex flex-col items-center justify-center w-full p-[1px] sm:p-1 ${textRot}`}>
                                <span className="font-bold text-[5px] sm:text-[7px] md:text-[8px] lg:text-[10px] text-center leading-[1.1] uppercase text-slate-300 w-full truncate px-[2px]">
                                    {space.name}
                                </span>
                                
                                <div className="flex-1 flex items-center justify-center my-[1px] sm:my-[2px]">
                                    {space.type === 'station' && <Train size={12} className="text-slate-500 opacity-80 w-3 h-3 sm:w-4 sm:h-4" />}
                                    {space.type === 'utility' && <Zap size={12} className="text-slate-500 opacity-80 w-3 h-3 sm:w-4 sm:h-4" />}
                                    {space.type === 'chance' && <AlertCircle size={12} className="text-indigo-400 opacity-80 w-3 h-3 sm:w-4 sm:h-4" />}
                                </div>
                                
                                {space.price && (
                                    <span className="text-[5px] sm:text-[7px] md:text-[9px] font-bold text-emerald-500/90 tracking-tighter">
                                        ${space.price}
                                    </span>
                                )}
                            </div>
                        </div>
                     </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Фишки Игроков */}
          {gameState.status === 'PLAYING' && gameState.playerOrder.map((uid, idx) => {
             const p = gameState.players[uid];
             const coords = getTokenCoords(p.pos, idx, gameState.playerOrder.length);

             return (
               <div 
                 key={uid}
                 className={`absolute w-4 h-4 sm:w-6 sm:h-6 md:w-8 md:h-8 rounded-full shadow-[0_4px_10px_rgba(0,0,0,0.9)] border-2 border-white flex items-center justify-center ${p.color} text-[8px] sm:text-[10px] md:text-sm text-white font-black z-30 transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)]`}
                 style={{ 
                   top: coords.top, 
                   left: coords.left,
                   transform: 'translate(-50%, -50%)'
                 }}
               >
                 {p.name.charAt(0)}
               </div>
             );
          })}
        </div>
      </div>

      {/* ТОРГОВЛЯ (AYIRBOSHLASH) */}
      {isTrading && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
           <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col">
              <div className="p-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
                 <h2 className="text-lg font-bold text-white flex items-center gap-2"><ArrowLeftRight/> Ayirboshlash</h2>
                 <button onClick={() => setIsTrading(false)} className="text-slate-400 hover:text-white">✕</button>
              </div>
              <div className="p-4 grid grid-cols-2 gap-4">
                 <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                    <h3 className="font-bold text-emerald-400 mb-3 border-b border-slate-700 pb-2">Siz taklif qilasiz</h3>
                    <div className="mb-3">
                       <label className="text-xs text-slate-400 mb-1 block">Pul ($)</label>
                       <input type="number" min="0" max={me.balance} value={tradeOffer.giveMoney} onChange={(e) => setTradeOffer({...tradeOffer, giveMoney: parseInt(e.target.value)||0})} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-emerald-500" />
                    </div>
                    <div>
                       <label className="text-xs text-slate-400 mb-1 block">Ko'chmas mulk</label>
                       <div className="flex flex-col gap-1 max-h-40 overflow-y-auto pr-1">
                          {BOARD_CONFIG.filter(s => gameState.properties[s.id]?.owner === user.uid).map(prop => (
                             <label key={prop.id} className="flex items-center gap-2 bg-slate-900 p-2 rounded cursor-pointer border border-transparent hover:border-slate-600">
                                <input type="checkbox" checked={tradeOffer.giveProps.includes(prop.id)} 
                                  onChange={(e) => {
                                    const newProps = e.target.checked ? [...tradeOffer.giveProps, prop.id] : tradeOffer.giveProps.filter(id => id !== prop.id);
                                    setTradeOffer({...tradeOffer, giveProps: newProps});
                                  }} />
                                <span className="text-sm">{prop.name}</span>
                             </label>
                          ))}
                       </div>
                    </div>
                 </div>

                 <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                    <div className="mb-3 flex justify-between items-center border-b border-slate-700 pb-2">
                       <h3 className="font-bold text-indigo-400">Kimdan xohlaysiz</h3>
                       <select value={tradeOffer.targetId} onChange={(e) => setTradeOffer({...tradeOffer, targetId: e.target.value, getProps: []})} className="bg-slate-900 border border-slate-700 rounded p-1 text-sm text-white outline-none w-1/2">
                          <option value="">Tanlang...</option>
                          {gameState.playerOrder.filter(id => id !== user.uid).map(id => (
                             <option key={id} value={id}>{gameState.players[id].name}</option>
                          ))}
                       </select>
                    </div>
                    {tradeOffer.targetId && (
                      <>
                        <div className="mb-3">
                          <label className="text-xs text-slate-400 mb-1 block">Pul ($)</label>
                          <input type="number" min="0" value={tradeOffer.getMoney} onChange={(e) => setTradeOffer({...tradeOffer, getMoney: parseInt(e.target.value)||0})} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-indigo-500" />
                        </div>
                        <div>
                          <label className="text-xs text-slate-400 mb-1 block">Ko'chmas mulk</label>
                          <div className="flex flex-col gap-1 max-h-40 overflow-y-auto pr-1">
                              {BOARD_CONFIG.filter(s => gameState.properties[s.id]?.owner === tradeOffer.targetId).map(prop => (
                                <label key={prop.id} className="flex items-center gap-2 bg-slate-900 p-2 rounded cursor-pointer border border-transparent hover:border-slate-600">
                                    <input type="checkbox" checked={tradeOffer.getProps.includes(prop.id)} 
                                      onChange={(e) => {
                                        const newProps = e.target.checked ? [...tradeOffer.getProps, prop.id] : tradeOffer.getProps.filter(id => id !== prop.id);
                                        setTradeOffer({...tradeOffer, getProps: newProps});
                                      }} />
                                    <span className="text-sm">{prop.name}</span>
                                </label>
                              ))}
                          </div>
                        </div>
                      </>
                    )}
                 </div>
              </div>
              <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end">
                 <button onClick={submitTrade} disabled={!tradeOffer.targetId} className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 text-white font-bold py-2 px-6 rounded-lg transition-colors">
                    Taklifni yuborish
                 </button>
              </div>
           </div>
        </div>
      )}

    </div>
  );
}
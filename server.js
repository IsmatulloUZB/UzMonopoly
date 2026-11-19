import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BOARD_CONFIG = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'boardConfig.json'), 'utf-8')
);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
});

const rooms = new Map();

const generateRoomCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (rooms.has(code));
  return code;
};

// Добавление лога с поддержкой цветных имён игроков
const addLog = (room, segments) => {
  room.logs.push({
    id: Date.now() + Math.random(),
    segments: Array.isArray(segments) ? segments : [{ text: String(segments) }],
  });
  if (room.logs.length > 50) {
    room.logs = room.logs.slice(-50);
  }
};

const playerSeg = (p) => ({ text: p.name, color: p.color, bold: true });

const broadcastRoom = (roomCode) => {
  const room = rooms.get(roomCode);
  if (room) {
    io.to(roomCode).emit('room_update', room);
  }
};

const eliminatePlayer = (room, player) => {
  player.bankrupt = true;
  player.money = 0;
  player.owedToId = null;
  // Освобождаем всю недвижимость выбывшего игрока
  Object.keys(room.properties).forEach((tid) => {
    if (room.properties[tid].ownerId === player.id) {
      delete room.properties[tid];
    }
  });
};

const checkGameWinner = (room) => {
  const active = room.players.filter((p) => !p.bankrupt);
  if (active.length <= 1 && room.status === 'playing') {
    room.status = 'finished';
    if (active[0]) {
      addLog(room, [
        { text: 'O‘yin tugadi! G‘olib: ' },
        playerSeg(active[0]),
        { text: '!' },
      ]);
    } else {
      addLog(room, 'O‘yin tugadi!');
    }
    return true;
  }
  return false;
};

const advanceTurn = (room) => {
  if (checkGameWinner(room)) return;
  let nextIdx = (room.turnIndex + 1) % room.players.length;
  let guard = 0;
  while (room.players[nextIdx].bankrupt && guard < room.players.length) {
    nextIdx = (nextIdx + 1) % room.players.length;
    guard++;
  }
  room.turnIndex = nextIdx;
  room.hasRolled = false;
  room.doublesCount = 0;
  addLog(room, [{ text: 'Navbat: ' }, playerSeg(room.players[nextIdx])]);
};

io.on('connection', (socket) => {
  // 1. Создание комнаты
  socket.on('create_room', ({ playerId, nickname, password }, callback) => {
    if (!nickname?.trim()) {
      return callback({ error: 'Iltimos, ismingizni kiriting!' });
    }
    const code = generateRoomCode();
    const newPlayer = {
      id: playerId,
      socketId: socket.id,
      name: nickname.trim(),
      money: BOARD_CONFIG.startingMoney,
      position: 0,
      color: BOARD_CONFIG.playerColors[0].hex,
      inJail: false,
      jailTurns: 0,
      jailFreeCards: 0,
      bankrupt: false,
      owedToId: null,
    };

    const room = {
      code,
      password: (password || '').trim(),
      hostId: playerId,
      status: 'waiting',
      players: [newPlayer],
      turnIndex: 0,
      dice: [1, 1],
      hasRolled: false,
      doublesCount: 0,
      properties: {},
      pendingTrade: null,
      logs: [],
    };

    addLog(room, [playerSeg(newPlayer), { text: ` yangi xona yaratdi (${code}).` }]);
    rooms.set(code, room);
    socket.join(code);
    callback({ room });
  });

  // 2. Вход в комнату
  socket.on('join_room', ({ playerId, nickname, code, password }, callback) => {
    if (!nickname?.trim()) {
      return callback({ error: 'Iltimos, ismingizni kiriting!' });
    }
    const cleanCode = (code || '').toUpperCase().trim();
    const room = rooms.get(cleanCode);

    if (!room) return callback({ error: 'Bunday kodli xona topilmadi!' });
    if (room.password && room.password !== (password || '').trim()) {
      return callback({ error: 'Xona paroli noto‘g‘ri!' });
    }

    const existing = room.players.find((p) => p.id === playerId);
    if (existing) {
      existing.socketId = socket.id;
      socket.join(cleanCode);
      broadcastRoom(cleanCode);
      return callback({ room });
    }

    if (room.status !== 'waiting') {
      return callback({ error: 'Bu xonada o‘yin allaqachon boshlangan!' });
    }
    if (room.players.length >= BOARD_CONFIG.maxPlayers) {
      return callback({ error: 'Xona to‘lgan!' });
    }

    const usedColors = new Set(room.players.map((p) => p.color));
    const freeColor =
      BOARD_CONFIG.playerColors.find((c) => !usedColors.has(c.hex)) ||
      BOARD_CONFIG.playerColors[room.players.length % BOARD_CONFIG.playerColors.length];

    const joinedPlayer = {
      id: playerId,
      socketId: socket.id,
      name: nickname.trim(),
      money: BOARD_CONFIG.startingMoney,
      position: 0,
      color: freeColor.hex,
      inJail: false,
      jailTurns: 0,
      jailFreeCards: 0,
      bankrupt: false,
      owedToId: null,
    };

    room.players.push(joinedPlayer);
    addLog(room, [playerSeg(joinedPlayer), { text: ' xonaga qo‘shildi.' }]);
    socket.join(cleanCode);
    broadcastRoom(cleanCode);
    callback({ room });
  });

  // 3. Запуск игры хостом
  socket.on('start_game', ({ code, playerId }) => {
    const room = rooms.get(code);
    if (!room || room.hostId !== playerId || room.players.length < 2) return;
    room.status = 'playing';
    room.doublesCount = 0;
    addLog(room, 'O‘yin boshlandi! Omad!');
    broadcastRoom(code);
  });

  // 4. Выход игрока из комнаты по кнопке
  socket.on('leave_room', ({ code, playerId }) => {
    const room = rooms.get(code);
    if (!room) return;
    const pIdx = room.players.findIndex((p) => p.id === playerId);
    if (pIdx === -1) return;
    const leavingPlayer = room.players[pIdx];

    if (room.status === 'waiting') {
      room.players.splice(pIdx, 1);
      if (room.players.length === 0) {
        rooms.delete(code);
        return;
      }
      if (room.hostId === playerId) {
        room.hostId = room.players[0].id;
      }
      addLog(room, [playerSeg(leavingPlayer), { text: ' xonani tark etdi.' }]);
    } else {
      eliminatePlayer(room, leavingPlayer);
      addLog(room, [playerSeg(leavingPlayer), { text: ' o‘yindan chiqdi.' }]);
      if (room.hostId === playerId) {
        const nextHost = room.players.find((p) => !p.bankrupt);
        if (nextHost) room.hostId = nextHost.id;
      }
      if (room.turnIndex === pIdx && room.status === 'playing') {
        advanceTurn(room);
      } else {
        checkGameWinner(room);
      }
    }
    socket.leave(code);
    broadcastRoom(code);
  });

  // 5. Кик игрока владельцем комнаты
  socket.on('kick_player', ({ code, hostId, targetId }) => {
    const room = rooms.get(code);
    if (!room || room.hostId !== hostId || hostId === targetId) return;
    const pIdx = room.players.findIndex((p) => p.id === targetId);
    if (pIdx === -1) return;
    const kicked = room.players[pIdx];

    if (room.status === 'waiting') {
      room.players.splice(pIdx, 1);
    } else {
      eliminatePlayer(room, kicked);
      if (room.turnIndex === pIdx && room.status === 'playing') {
        advanceTurn(room);
      } else {
        checkGameWinner(room);
      }
    }

    addLog(room, [playerSeg(kicked), { text: ' xona egasi tomonidan chetlatildi.' }]);
    io.to(code).emit('player_kicked', { targetId });
    broadcastRoom(code);
  });

  // 6. Владелец комнаты завершает игру досрочно
  socket.on('end_game', ({ code, hostId }) => {
    const room = rooms.get(code);
    if (!room || room.hostId !== hostId) return;
    room.status = 'finished';
    addLog(room, 'Xona egasi o‘yinni yakunladi.');
    broadcastRoom(code);
  });

  // 7. Добровольное банкротство (игрок выбывает и остаётся наблюдателем)
  socket.on('declare_bankrupt', ({ code, playerId }) => {
    const room = rooms.get(code);
    if (!room || room.status !== 'playing') return;
    const pIdx = room.players.findIndex((p) => p.id === playerId);
    if (pIdx === -1 || room.players[pIdx].bankrupt) return;

    const p = room.players[pIdx];
    eliminatePlayer(room, p);
    addLog(room, [playerSeg(p), { text: ' bankrot deb e’lon qilindi va kuzatuvchiga aylandi.' }]);

    if (room.turnIndex === pIdx) {
      advanceTurn(room);
    } else {
      checkGameWinner(room);
    }
    broadcastRoom(code);
  });

  // 8. Бросок кубиков
  socket.on('roll_dice', ({ code, playerId }) => {
    const room = rooms.get(code);
    if (!room || room.status !== 'playing' || room.hasRolled) return;

    const p = room.players[room.turnIndex];
    if (!p || p.id !== playerId || p.bankrupt || p.money < 0) return;

    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    const steps = d1 + d2;
    const isDouble = d1 === d2;

    room.dice = [d1, d2];
    addLog(room, [
      playerSeg(p),
      { text: ` tosh tashladi: ${d1} + ${d2} = ${steps}${isDouble ? ' (DUBL!)' : ''}.` },
    ]);

    // Проверка на 3-й дубль подряд -> Тюрьма
    if (!p.inJail && isDouble) {
      room.doublesCount = (room.doublesCount || 0) + 1;
      if (room.doublesCount >= 3) {
        const jailIdx = BOARD_CONFIG.tiles.findIndex((t) => t.type === 'jail');
        p.position = jailIdx !== -1 ? jailIdx : 6;
        p.inJail = true;
        p.jailTurns = 0;
        room.doublesCount = 0;
        room.hasRolled = true;
        addLog(room, [
          playerSeg(p),
          { text: ' ketma-ket 3 marta dubl tashlagani uchun qamoqqa tushdi!' },
        ]);
        return broadcastRoom(code);
      }
    } else if (!isDouble) {
      room.doublesCount = 0;
    }

    // Логика тюрьмы (выход после 3 неудачных бросков оставаясь в поле тюрьмы)
    if (p.inJail) {
      if (isDouble) {
        p.inJail = false;
        p.jailTurns = 0;
        room.doublesCount = 0;
        addLog(room, [playerSeg(p), { text: ' dubl tashlab qamoqdan chiqdi!' }]);
      } else {
        p.jailTurns += 1;
        if (p.jailTurns >= 3) {
          p.inJail = false;
          p.jailTurns = 0;
          room.hasRolled = true;
          addLog(room, [
            playerSeg(p),
            { text: ' 3 ta urinishdan so‘ng qamoqdan ozod bo‘ldi (qamoq maydonida qoldi).' },
          ]);
          return broadcastRoom(code);
        } else {
          room.hasRolled = true;
          addLog(room, [
            playerSeg(p),
            { text: ` qamoqda qoldi (${p.jailTurns}/3 urinish).` },
          ]);
          return broadcastRoom(code);
        }
      }
    }

    // Движение по часовой стрелке
    const oldPos = p.position;
    const totalTiles = BOARD_CONFIG.tiles.length;
    const newPos = (oldPos + steps) % totalTiles;

    if (newPos === 0) {
      p.money += BOARD_CONFIG.landStartReward;
      addLog(room, [
        playerSeg(p),
        { text: ` to‘g‘ri START katagiga tushdi (+${BOARD_CONFIG.landStartReward}$)!` },
      ]);
    } else if (oldPos + steps >= totalTiles) {
      p.money += BOARD_CONFIG.passStartReward;
      addLog(room, [
        playerSeg(p),
        { text: ` START katagidan o‘tdi (+${BOARD_CONFIG.passStartReward}$).` },
      ]);
    }

    p.position = newPos;
    const landedTile = BOARD_CONFIG.tiles[newPos];
    addLog(room, [playerSeg(p), { text: ` "${landedTile.name}" katagiga tushdi.` }]);

    if (landedTile.type === 'tax') {
      p.money -= landedTile.amount;
      p.owedToId = p.money < 0 ? 'bank' : null;
      addLog(room, [playerSeg(p), { text: ` ${landedTile.amount}$ soliq to‘ladi.` }]);
    } else if (landedTile.type === 'gotojail') {
      const jailIdx = BOARD_CONFIG.tiles.findIndex((t) => t.type === 'jail');
      p.position = jailIdx !== -1 ? jailIdx : 6;
      p.inJail = true;
      p.jailTurns = 0;
      room.doublesCount = 0;
      addLog(room, [playerSeg(p), { text: ' qamoqxonaga jo‘natildi!' }]);
    } else if (landedTile.type === 'chance') {
      const events = [
        { text: 'Bank xatosi: +150$ oldingiz!', delta: 150 },
        { text: 'Yo‘l qoidasini buzdingiz: -75$ jarima.', delta: -75 },
        { text: 'Qamoqdan bepul chiqish kartasini oldingiz!', jailCard: true },
        { text: 'Do‘stlaringizdan sovg‘a: +100$!', delta: 100 },
      ];
      const ev = events[Math.floor(Math.random() * events.length)];
      if (ev.jailCard) {
        p.jailFreeCards = (p.jailFreeCards || 0) + 1;
      } else {
        p.money += ev.delta;
        if (p.money < 0) p.owedToId = 'bank';
      }
      addLog(room, [{ text: `Omad kartasi: ${ev.text}` }]);
    } else if (landedTile.type === 'city' || landedTile.type === 'station') {
      const prop = room.properties[landedTile.id];
      if (prop && prop.ownerId !== p.id) {
        const owner = room.players.find((pl) => pl.id === prop.ownerId);
        if (owner && !owner.bankrupt) {
          // В тюрьме игрок не получает прибыли
          if (owner.inJail) {
            addLog(room, [
              playerSeg(owner),
              { text: ' qamoqda bo‘lgani uchun ijara haqi olmadi.' },
            ]);
          } else {
            let rentToPay = 0;
            if (landedTile.type === 'city') {
              const houses = prop.houses || 0;
              rentToPay = landedTile.rents[houses] ?? landedTile.rents[0];
            } else {
              // Считаем сколько станций у владельца
              const ownedStationsCount = BOARD_CONFIG.tiles.filter(
                (t) => t.type === 'station' && room.properties[t.id]?.ownerId === owner.id
              ).length;
              const stationIdx = Math.max(
                0,
                Math.min(ownedStationsCount - 1, BOARD_CONFIG.stationRents.length - 1)
              );
              rentToPay = BOARD_CONFIG.stationRents[stationIdx];
            }

            p.money -= rentToPay;
            owner.money += rentToPay;
            if (p.money < 0) {
              p.owedToId = owner.id;
            }
            addLog(room, [
              playerSeg(p),
              { text: ' ijara haqi sifatida ' },
              playerSeg(owner),
              { text: `ga ${rentToPay}$ to‘ladi.` },
            ]);
          }
        }
      }
    }

    if (p.money >= 0) {
      p.owedToId = null;
    } else {
      addLog(room, [
        playerSeg(p),
        { text: ' manfiy balansga tushdi! Savdo qiling yoki bankrot tugmasini bosing.' },
      ]);
    }

    // Если выпал дубль (и не попал в тюрьму / не в минусе), можно и купить клетку, и бросить снова
    room.hasRolled = !isDouble || p.inJail || p.money < 0;
    broadcastRoom(code);
  });

  // 9. Покупка клетки (доступна даже если выпал дубль до повторного броска)
  socket.on('buy_tile', ({ code, playerId }) => {
    const room = rooms.get(code);
    if (!room) return;
    const p = room.players[room.turnIndex];
    if (!p || p.id !== playerId || p.money < 0) return;

    const tile = BOARD_CONFIG.tiles[p.position];
    if ((tile.type !== 'city' && tile.type !== 'station') || room.properties[tile.id]) return;
    if (p.money < tile.price) return;

    p.money -= tile.price;
    room.properties[tile.id] = { ownerId: p.id, houses: 0 };
    addLog(room, [
      playerSeg(p),
      { text: ` "${tile.name}" mulkini ${tile.price}$ ga sotib oldi!` },
    ]);
    broadcastRoom(code);
  });

  // 10. Строительство дома (только если собраны все города этой страны/группы)
  socket.on('build_house', ({ code, playerId, tileId }) => {
    const room = rooms.get(code);
    if (!room) return;
    const tile = BOARD_CONFIG.tiles.find((t) => t.id === tileId);
    const prop = room.properties[tileId];
    const p = room.players.find((pl) => pl.id === playerId);

    if (!tile || tile.type !== 'city' || !prop || prop.ownerId !== playerId || !p) return;

    // Проверка монополии на всю страну/группу
    const countryCities = BOARD_CONFIG.tiles.filter(
      (t) => t.type === 'city' && t.group === tile.group
    );
    const ownsAll = countryCities.every((c) => room.properties[c.id]?.ownerId === playerId);
    if (!ownsAll) return;

    const maxHouses = (tile.rents?.length || 1) - 1;
    const currentHouses = prop.houses || 0;
    if (currentHouses >= maxHouses || p.money < tile.houseCost) return;

p.money -= tile.houseCost;
prop.houses = currentHouses + 1;
addLog(room, [
  playerSeg(p),
  { text: ` "${tile.name}" shahrida uy qurdi (${prop.houses}/${maxHouses}).` },
]);

    p.money -= tile.houseCost;
    prop.houses = currentHouses + 1;
    addLog(room, [
      playerSeg(p),
      { text: ` "${tile.name}" shahrida uy qurdi (${prop.houses}/4).` },
    ]);
    broadcastRoom(code);
  });

  // 11. Выход из тюрьмы за штраф или карту
  socket.on('leave_jail', ({ code, playerId, useCard }) => {
    const room = rooms.get(code);
    if (!room) return;
    const p = room.players[room.turnIndex];
    if (!p || p.id !== playerId || !p.inJail) return;

    if (useCard && p.jailFreeCards > 0) {
      p.jailFreeCards -= 1;
      p.inJail = false;
      p.jailTurns = 0;
      addLog(room, [playerSeg(p), { text: ' maxsus karta bilan qamoqdan chiqdi!' }]);
      broadcastRoom(code);
    } else if (!useCard && p.money >= BOARD_CONFIG.jailFine) {
      p.money -= BOARD_CONFIG.jailFine;
      p.inJail = false;
      p.jailTurns = 0;
      addLog(room, [
        playerSeg(p),
        { text: ` ${BOARD_CONFIG.jailFine}$ jarima to‘lab qamoqdan chiqdi!` },
      ]);
      broadcastRoom(code);
    }
  });

  // 12. Передача хода (нельзя передать, если баланс в минусе)
  socket.on('end_turn', ({ code, playerId }) => {
    const room = rooms.get(code);
    if (!room) return;
    const current = room.players[room.turnIndex];
    if (!current || current.id !== playerId || current.money < 0) return;
    advanceTurn(room);
    broadcastRoom(code);
  });

  // 13. Торговля (включая обнуление долга кредитором)
  socket.on('send_trade', ({ code, trade }) => {
    const room = rooms.get(code);
    if (!room) return;
    const sender = room.players.find((p) => p.id === trade.fromId);
    room.pendingTrade = trade;
    if (sender) {
      addLog(room, [playerSeg(sender), { text: ' savdo taklifini yubordi.' }]);
    }
    broadcastRoom(code);
  });

  socket.on('respond_trade', ({ code, playerId, accept }) => {
    const room = rooms.get(code);
    const trade = room?.pendingTrade;
    if (!trade || trade.toId !== playerId) return;

    const fromP = room.players.find((p) => p.id === trade.fromId);
    const toP = room.players.find((p) => p.id === trade.toId);

    if (!accept || !fromP || !toP) {
      room.pendingTrade = null;
      if (toP) addLog(room, [playerSeg(toP), { text: ' savdo taklifini rad etdi.' }]);
      return broadcastRoom(code);
    }

    fromP.money = fromP.money - trade.offerMoney + trade.requestMoney;
    toP.money = toP.money + trade.offerMoney - trade.requestMoney;

    // Если кредитор обнулил долг должника в рамках сделки
    if (trade.forgiveDebt) {
      if (toP.money < 0 && toP.owedToId === fromP.id) {
        toP.money = 0;
        toP.owedToId = null;
      } else if (fromP.money < 0 && fromP.owedToId === toP.id) {
        fromP.money = 0;
        fromP.owedToId = null;
      }
    }

    if (fromP.money >= 0) fromP.owedToId = null;
    if (toP.money >= 0) toP.owedToId = null;

    if (trade.offerJailCard && fromP.jailFreeCards > 0) {
      fromP.jailFreeCards -= 1;
      toP.jailFreeCards = (toP.jailFreeCards || 0) + 1;
    }
    if (trade.requestJailCard && toP.jailFreeCards > 0) {
      toP.jailFreeCards -= 1;
      fromP.jailFreeCards = (fromP.jailFreeCards || 0) + 1;
    }

    trade.offerTiles.forEach((tid) => {
      if (room.properties[tid]) room.properties[tid].ownerId = toP.id;
    });
    trade.requestTiles.forEach((tid) => {
      if (room.properties[tid]) room.properties[tid].ownerId = fromP.id;
    });

    room.pendingTrade = null;
    addLog(room, [
      playerSeg(fromP),
      { text: ' va ' },
      playerSeg(toP),
      { text: ' o‘rtasida almashinuv amalga oshdi!' },
    ]);
    broadcastRoom(code);
  });
});

const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`UzMonopoly server running on port ${PORT}`);
});
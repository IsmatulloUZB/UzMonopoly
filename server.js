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

// Хранилище комнат в оперативной памяти сервера
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

const broadcastRoom = (roomCode) => {
  const room = rooms.get(roomCode);
  if (room) {
    io.to(roomCode).emit('room_update', room);
  }
};

io.on('connection', (socket) => {
  // 1. Создание новой комнаты
  socket.on('create_room', ({ playerId, nickname, password }, callback) => {
    if (!nickname?.trim()) {
      return callback({ error: 'Iltimos, ismingizni (nik) kiriting!' });
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
      properties: {},
      pendingTrade: null,
      logs: [`${newPlayer.name} yangi xona yaratdi (${code}).`],
    };

    rooms.set(code, room);
    socket.join(code);
    callback({ room });
  });

  // 2. Вход в существующую комнату
  socket.on('join_room', ({ playerId, nickname, code, password }, callback) => {
    if (!nickname?.trim()) {
      return callback({ error: 'Iltimos, ismingizni (nik) kiriting!' });
    }
    const cleanCode = (code || '').toUpperCase().trim();
    const room = rooms.get(cleanCode);

    if (!room) {
      return callback({ error: 'Bunday kodli xona topilmadi!' });
    }
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

    const colorObj =
      BOARD_CONFIG.playerColors[room.players.length % BOARD_CONFIG.playerColors.length];
    const joinedPlayer = {
      id: playerId,
      socketId: socket.id,
      name: nickname.trim(),
      money: BOARD_CONFIG.startingMoney,
      position: 0,
      color: colorObj.hex,
      inJail: false,
      jailTurns: 0,
      jailFreeCards: 0,
      bankrupt: false,
    };

    room.players.push(joinedPlayer);
    room.logs.push(`${joinedPlayer.name} xonaga qo‘shildi.`);
    socket.join(cleanCode);
    broadcastRoom(cleanCode);
    callback({ room });
  });

  // 3. Запуск игры хостом
  socket.on('start_game', ({ code, playerId }) => {
    const room = rooms.get(code);
    if (!room || room.hostId !== playerId || room.players.length < 2) return;
    room.status = 'playing';
    room.logs.push('O‘yin boshlandi! Omad!');
    broadcastRoom(code);
  });

  // 4. Бросок кубиков
  socket.on('roll_dice', ({ code, playerId }) => {
    const room = rooms.get(code);
    if (!room || room.status !== 'playing' || room.hasRolled) return;

    const p = room.players[room.turnIndex];
    if (!p || p.id !== playerId) return;

    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    const steps = d1 + d2;
    const isDouble = d1 === d2;

    room.dice = [d1, d2];
    room.logs.push(`${p.name} tosh tashladi: ${d1} + ${d2} = ${steps}.`);

    // Проверка тюрьмы
    if (p.inJail) {
      if (isDouble) {
        p.inJail = false;
        p.jailTurns = 0;
        room.logs.push(`${p.name} dubl tashlab qamoqdan chiqdi!`);
      } else if (p.jailTurns >= 2) {
        p.money -= BOARD_CONFIG.jailFine;
        p.inJail = false;
        p.jailTurns = 0;
        room.logs.push(`${p.name} ${BOARD_CONFIG.jailFine}$ jarima to‘lab qamoqdan chiqdi.`);
      } else {
        p.jailTurns += 1;
        room.hasRolled = true;
        room.logs.push(`${p.name} qamoqda qoldi.`);
        return broadcastRoom(code);
      }
    }

    // Движение по часовой стрелке
    const oldPos = p.position;
    const totalTiles = BOARD_CONFIG.tiles.length;
    const newPos = (oldPos + steps) % totalTiles;

    if (oldPos + steps >= totalTiles) {
      p.money += BOARD_CONFIG.passGoReward;
      room.logs.push(`${p.name} BOSH katagidan o‘tdi (+${BOARD_CONFIG.passGoReward}$).`);
    }
    p.position = newPos;

    const landedTile = BOARD_CONFIG.tiles[newPos];
    room.logs.push(`${p.name} "${landedTile.name}" katagiga tushdi.`);

    if (landedTile.type === 'tax') {
      p.money -= landedTile.amount;
      room.logs.push(`${p.name} ${landedTile.amount}$ soliq to‘ladi.`);
    } else if (landedTile.type === 'gotojail') {
      const jailIdx = BOARD_CONFIG.tiles.findIndex((t) => t.type === 'jail');
      p.position = jailIdx !== -1 ? jailIdx : 6;
      p.inJail = true;
      p.jailTurns = 0;
      room.logs.push(`${p.name} qamoqxonaga jo‘natildi!`);
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
      }
      room.logs.push(`Omad kartasi: ${ev.text}`);
    } else if (landedTile.type === 'city' || landedTile.type === 'station') {
      const prop = room.properties[landedTile.id];
      if (prop && prop.ownerId !== p.id) {
        const owner = room.players.find((pl) => pl.id === prop.ownerId);
        if (owner && !owner.bankrupt) {
          const rentToPay = landedTile.rent * (1 + (prop.houses || 0));
          p.money -= rentToPay;
          owner.money += rentToPay;
          room.logs.push(`${p.name} ijara haqi sifatida ${owner.name}ga ${rentToPay}$ to‘ladi.`);
        }
      }
    }

    if (p.money < 0) {
      p.bankrupt = true;
      room.logs.push(`${p.name} bankrot bo‘ldi!`);
    }

    room.hasRolled = !isDouble || p.inJail;
    if (room.logs.length > 40) room.logs = room.logs.slice(-40);
    broadcastRoom(code);
  });

  // 5. Покупка текущей клетки
  socket.on('buy_tile', ({ code, playerId }) => {
    const room = rooms.get(code);
    if (!room) return;
    const p = room.players[room.turnIndex];
    if (!p || p.id !== playerId) return;

    const tile = BOARD_CONFIG.tiles[p.position];
    if ((tile.type !== 'city' && tile.type !== 'station') || room.properties[tile.id]) return;
    if (p.money < tile.price) return;

    p.money -= tile.price;
    room.properties[tile.id] = { ownerId: p.id, houses: 0 };
    room.logs.push(`${p.name} "${tile.name}" shahrini ${tile.price}$ ga sotib oldi!`);
    broadcastRoom(code);
  });

  // 6. Строительство дома
  socket.on('build_house', ({ code, playerId, tileId }) => {
    const room = rooms.get(code);
    if (!room) return;
    const tile = BOARD_CONFIG.tiles.find((t) => t.id === tileId);
    const prop = room.properties[tileId];
    const p = room.players.find((pl) => pl.id === playerId);

    if (!tile || tile.type !== 'city' || !prop || prop.ownerId !== playerId || !p) return;
    const currentHouses = prop.houses || 0;
    if (currentHouses >= 4 || p.money < tile.houseCost) return;

    p.money -= tile.houseCost;
    prop.houses = currentHouses + 1;
    room.logs.push(`${p.name} "${tile.name}" shahrida uy qurdi (${prop.houses}/4).`);
    broadcastRoom(code);
  });

  // 7. Выход из тюрьмы (штраф или карта)
  socket.on('leave_jail', ({ code, playerId, useCard }) => {
    const room = rooms.get(code);
    if (!room) return;
    const p = room.players[room.turnIndex];
    if (!p || p.id !== playerId || !p.inJail) return;

    if (useCard && p.jailFreeCards > 0) {
      p.jailFreeCards -= 1;
      p.inJail = false;
      p.jailTurns = 0;
      room.logs.push(`${p.name} maxsus karta bilan qamoqdan chiqdi!`);
      broadcastRoom(code);
    } else if (!useCard && p.money >= BOARD_CONFIG.jailFine) {
      p.money -= BOARD_CONFIG.jailFine;
      p.inJail = false;
      p.jailTurns = 0;
      room.logs.push(`${p.name} ${BOARD_CONFIG.jailFine}$ to‘lab qamoqdan chiqdi!`);
      broadcastRoom(code);
    }
  });

  // 8. Передача хода
  socket.on('end_turn', ({ code, playerId }) => {
    const room = rooms.get(code);
    if (!room) return;
    const current = room.players[room.turnIndex];
    if (!current || current.id !== playerId) return;

    const activePlayers = room.players.filter((p) => !p.bankrupt);
    if (activePlayers.length <= 1) {
      room.status = 'finished';
      room.logs.push(`O‘yin tugadi! G‘olib: ${activePlayers[0]?.name || 'Noma’lum'}!`);
      return broadcastRoom(code);
    }

    let nextIdx = (room.turnIndex + 1) % room.players.length;
    while (room.players[nextIdx].bankrupt) {
      nextIdx = (nextIdx + 1) % room.players.length;
    }

    room.turnIndex = nextIdx;
    room.hasRolled = false;
    room.logs.push(`Navbat: ${room.players[nextIdx].name}.`);
    broadcastRoom(code);
  });

  // 9. Отправка предложения обмена
  socket.on('send_trade', ({ code, trade }) => {
    const room = rooms.get(code);
    if (!room) return;
    const sender = room.players.find((p) => p.id === trade.fromId);
    room.pendingTrade = trade;
    room.logs.push(`${sender?.name || 'O‘yinchi'} savdo taklifini yubordi.`);
    broadcastRoom(code);
  });

  // 10. Ответ на предложение обмена
  socket.on('respond_trade', ({ code, playerId, accept }) => {
    const room = rooms.get(code);
    const trade = room?.pendingTrade;
    if (!trade || trade.toId !== playerId) return;

    const fromP = room.players.find((p) => p.id === trade.fromId);
    const toP = room.players.find((p) => p.id === trade.toId);

    if (!accept || !fromP || !toP) {
      room.pendingTrade = null;
      room.logs.push(`${toP?.name || 'O‘yinchi'} savdo taklifini rad etdi.`);
      return broadcastRoom(code);
    }

    fromP.money = fromP.money - trade.offerMoney + trade.requestMoney;
    toP.money = toP.money + trade.offerMoney - trade.requestMoney;

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
    room.logs.push(`${fromP.name} va ${toP.name} o‘rtasida almashinuv amalga oshdi!`);
    broadcastRoom(code);
  });
});

// Раздача собранного React-приложения (для Render.com)
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`UzMonopoly server running on port ${PORT}`);
});



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

// Отправка всплывающего индикатора изменения денег рядом с клеткой
const emitMoneyEffect = (roomCode, tileId, amount) => {
  if (!amount) return;
  io.to(roomCode).emit('money_effect', {
    id: Date.now() + Math.random(),
    tileId,
    amount,
  });
};

// Проверка: есть ли хотя бы 1 дом в стране (цветовой группе) данного города
const hasHousesInCountry = (room, tile) => {
  if (!tile || tile.type !== 'city' || !tile.group) return false;
  return BOARD_CONFIG.tiles.some(
    (t) => t.type === 'city' && t.group === tile.group && (room.properties[t.id]?.houses || 0) > 0
  );
};

const eliminatePlayer = (room, player) => {
  player.bankrupt = true;
  player.money = 0;
  player.owedToId = null;
  player.skipTurns = 0;
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
    room.winnerId = active[0]?.id || null;
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

  let nextIdx = room.turnIndex;
  let guard = 0;
  const maxSteps = room.players.length * 2;

  while (guard < maxSteps) {
    nextIdx = (nextIdx + 1) % room.players.length;
    guard++;
    const candidate = room.players[nextIdx];
    if (candidate.bankrupt) continue;

    // Если игрок попал на Vacation (Dam olish) — он пропускает 1 ход
    if ((candidate.skipTurns || 0) > 0) {
      candidate.skipTurns -= 1;
      addLog(room, [
        playerSeg(candidate),
        { text: ' dam olishda bo‘lgani uchun bu navbatini o‘tkazib yubordi.' },
      ]);
      continue;
    }

    room.turnIndex = nextIdx;
    room.hasRolled = false;
    room.doublesCount = 0;
    addLog(room, [{ text: 'Navbat: ' }, playerSeg(candidate)]);
    return;
  }
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
      skipTurns: 0,
      bankrupt: false,
      owedToId: null,
    };

    const room = {
      code,
      password: (password || '').trim(),
      hostId: playerId,
      winnerId: null,
      status: 'waiting',
      players: [newPlayer],
      turnIndex: 0,
      dice: [1, 1],
      hasRolled: false,
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
      skipTurns: 0,
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
    addLog(room, 'O‘yin boshlandi! Omad!');
    broadcastRoom(code);
  });

  // 4. Выход игрока из комнаты
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
    const active = room.players.filter((p) => !p.bankrupt).sort((a, b) => b.money - a.money);
    room.winnerId = active[0]?.id || null;
    addLog(room, 'Xona egasi o‘yinni yakunladi.');
    broadcastRoom(code);
  });

  // 7. Добровольное банкротство
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

    // 1. Если игрок в тюрьме — любой бросок (удачный или неудачный) завершает его ход
    if (p.inJail) {
      if (isDouble) {
        p.inJail = false;
        p.jailTurns = 0;
        addLog(room, [playerSeg(p), { text: ' dubl tashlab qamoqdan chiqdi!' }]);
      } else {
        p.jailTurns += 1;
        if (p.jailTurns >= 3) {
          p.inJail = false;
          p.jailTurns = 0;
          addLog(room, [
            playerSeg(p),
            { text: ' 3 ta urinishdan so‘ng qamoqdan ozod bo‘ldi.' },
          ]);
        } else {
          addLog(room, [
            playerSeg(p),
            { text: ` qamoqda qoldi (${p.jailTurns}/3 urinish).` },
          ]);
        }
      }
      advanceTurn(room);
      return broadcastRoom(code);
    }

    // 2. Проверка на 3 дубля подряд
    if (isDouble) {
      room.doublesCount = (room.doublesCount || 0) + 1;
      if (room.doublesCount >= 3) {
        const jailIdx = BOARD_CONFIG.tiles.findIndex((t) => t.type === 'jail');
        p.position = jailIdx !== -1 ? jailIdx : 10;
        p.inJail = true;
        p.jailTurns = 0;
        room.hasRolled = true;
        room.doublesCount = 0;
        addLog(room, [
          playerSeg(p),
          { text: ' ketma-ket 3 marta dubl tashlab qamoqqa tushdi!' },
        ]);
        return broadcastRoom(code);
      }
    } else {
      room.doublesCount = 0;
    }

    // 3. Движение по часовой стрелке
    const oldPos = p.position;
    const totalTiles = BOARD_CONFIG.tiles.length;
    const newPos = (oldPos + steps) % totalTiles;

    if (newPos === 0) {
      p.money += BOARD_CONFIG.landStartReward;
      emitMoneyEffect(code, 0, BOARD_CONFIG.landStartReward);
      addLog(room, [
        playerSeg(p),
        { text: ` to‘g‘ri START katagiga tushdi (+${BOARD_CONFIG.landStartReward}$)!` },
      ]);
    } else if (oldPos + steps >= totalTiles) {
      p.money += BOARD_CONFIG.passStartReward;
      emitMoneyEffect(code, 0, BOARD_CONFIG.passStartReward);
      addLog(room, [
        playerSeg(p),
        { text: ` START katagidan o‘tdi (+${BOARD_CONFIG.passStartReward}$).` },
      ]);
    }

    p.position = newPos;
    const landedTile = BOARD_CONFIG.tiles[newPos];
    addLog(room, [playerSeg(p), { text: ` "${landedTile.name}" katagiga tushdi.` }]);

    if (landedTile.type === 'parking') {
      p.skipTurns = 1;
      addLog(room, [
        playerSeg(p),
        { text: ' dam olish katagiga tushdi va keyingi 1 navbatini o‘tkazib yuboradi.' },
      ]);
    } else if (landedTile.type === 'tax') {
      p.money -= landedTile.amount;
      p.owedToId = p.money < 0 ? 'bank' : null;
      emitMoneyEffect(code, newPos, -landedTile.amount);
      addLog(room, [playerSeg(p), { text: ` ${landedTile.amount}$ soliq to‘ladi.` }]);
    } else if (landedTile.type === 'tax_percent') {
      const taxAmount = p.money > 0 ? Math.round((p.money * landedTile.percent) / 100) : 0;
      p.money -= taxAmount;
      p.owedToId = p.money < 0 ? 'bank' : null;
      emitMoneyEffect(code, newPos, -taxAmount);
      addLog(room, [
        playerSeg(p),
        { text: ` ${landedTile.percent}% soliq (${taxAmount}$) to‘ladi.` },
      ]);
    } else if (landedTile.type === 'gotojail') {
      const jailIdx = BOARD_CONFIG.tiles.findIndex((t) => t.type === 'jail');
      p.position = jailIdx !== -1 ? jailIdx : 10;
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
        emitMoneyEffect(code, newPos, ev.delta);
        if (p.money < 0) p.owedToId = 'bank';
      }
      addLog(room, [{ text: `Omad kartasi: ${ev.text}` }]);
    } else if (
      landedTile.type === 'city' ||
      landedTile.type === 'station' ||
      landedTile.type === 'company'
    ) {
      const prop = room.properties[landedTile.id];
      if (prop && prop.ownerId !== p.id) {
        const owner = room.players.find((pl) => pl.id === prop.ownerId);
        if (owner && !owner.bankrupt) {
          if (owner.inJail) {
            addLog(room, [
              playerSeg(owner),
              { text: ' qamoqda bo‘lgani uchun ijara haqi olmadi.' },
            ]);
          } else {
            let rentToPay = 0;
            let detailText = '';

            if (landedTile.type === 'city') {
              const houses = prop.houses || 0;
              rentToPay = landedTile.rents[houses] ?? landedTile.rents[0];
            } else if (landedTile.type === 'station') {
              const ownedStationsCount = BOARD_CONFIG.tiles.filter(
                (t) => t.type === 'station' && room.properties[t.id]?.ownerId === owner.id
              ).length;
              const stationIdx = Math.max(
                0,
                Math.min(ownedStationsCount - 1, BOARD_CONFIG.stationRents.length - 1)
              );
              rentToPay = BOARD_CONFIG.stationRents[stationIdx];
            } else if (landedTile.type === 'company') {
              const multipliers = BOARD_CONFIG.companyMultipliers || [4, 10];
              const ownedCompaniesCount = BOARD_CONFIG.tiles.filter(
                (t) => t.type === 'company' && room.properties[t.id]?.ownerId === owner.id
              ).length;
              const compIdx = Math.max(
                0,
                Math.min(ownedCompaniesCount - 1, multipliers.length - 1)
              );
              const mult = multipliers[compIdx];
              rentToPay = steps * mult;
              detailText = ` (${steps} qadam × ${mult}$)`;
            }

            p.money -= rentToPay;
            owner.money += rentToPay;
            emitMoneyEffect(code, newPos, -rentToPay);
            if (p.money < 0) {
              p.owedToId = owner.id;
            }
            addLog(room, [
              playerSeg(p),
              { text: ' ijara haqi sifatida ' },
              playerSeg(owner),
              { text: `ga ${rentToPay}$${detailText} to‘ladi.` },
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
        { text: ' manfiy balansga tushdi! Mulk soting, savdo qiling yoki bankrot tugmasini bosing.' },
      ]);
    }

    // При дубле (если игрок не попал в тюрьму) даём право бросить кости ещё раз
    room.hasRolled = !isDouble || p.inJail;
    broadcastRoom(code);
  });

  // 9. Покупка клетки (после обычного броска или после дубля в текущий ход)
  socket.on('buy_tile', ({ code, playerId }) => {
    const room = rooms.get(code);
    if (!room || room.status !== 'playing' || (!room.hasRolled && (room.doublesCount || 0) === 0)) return;
    const p = room.players[room.turnIndex];
    if (!p || p.id !== playerId || p.money < 0) return;

    const tile = BOARD_CONFIG.tiles[p.position];
    if (
      (tile.type !== 'city' && tile.type !== 'station' && tile.type !== 'company') ||
      room.properties[tile.id]
    )
      return;
    if (p.money < tile.price) return;

    p.money -= tile.price;
    room.properties[tile.id] = { ownerId: p.id, houses: 0 };
    emitMoneyEffect(code, p.position, -tile.price);
    addLog(room, [
      playerSeg(p),
      { text: ` "${tile.name}" mulkini ${tile.price}$ ga sotib oldi!` },
    ]);
    broadcastRoom(code);
  });

  // 10. Строительство дома (только в свой ход и равномерно по всей стране)
  socket.on('build_house', ({ code, playerId, tileId }) => {
    const room = rooms.get(code);
    if (!room || room.status !== 'playing') return;
    const currentTurnPlayer = room.players[room.turnIndex];
    if (!currentTurnPlayer || currentTurnPlayer.id !== playerId) return;

    const tile = BOARD_CONFIG.tiles.find((t) => t.id === tileId);
    const prop = room.properties[tileId];
    const p = room.players.find((pl) => pl.id === playerId);

    if (!tile || tile.type !== 'city' || !prop || prop.ownerId !== playerId || !p) return;

    const countryCities = BOARD_CONFIG.tiles.filter(
      (t) => t.type === 'city' && t.group === tile.group
    );
    const ownsAll = countryCities.every((c) => room.properties[c.id]?.ownerId === playerId);
    if (!ownsAll) return;

    // Равномерная застройка: строить можно только на городах с минимальным кол-вом домов в стране
    const minHousesInCountry = Math.min(
      ...countryCities.map((c) => room.properties[c.id]?.houses || 0)
    );
    const currentHouses = prop.houses || 0;
    if (currentHouses !== minHousesInCountry) return;

    const maxHouses = (tile.rents?.length || 1) - 1;
    if (currentHouses >= maxHouses || p.money < tile.houseCost) return;

    p.money -= tile.houseCost;
    prop.houses = currentHouses + 1;
    addLog(room, [
      playerSeg(p),
      { text: ` "${tile.name}" shahrida uy qurdi (${prop.houses}/${maxHouses}).` },
    ]);
    broadcastRoom(code);
  });

  // 11. Удаление (продажа) дома за 50% цены (только в свой ход и равномерно по стране)
  socket.on('sell_house', ({ code, playerId, tileId }) => {
    const room = rooms.get(code);
    if (!room || room.status !== 'playing') return;
    const currentTurnPlayer = room.players[room.turnIndex];
    if (!currentTurnPlayer || currentTurnPlayer.id !== playerId) return;

    const tile = BOARD_CONFIG.tiles.find((t) => t.id === tileId);
    const prop = room.properties[tileId];
    const p = room.players.find((pl) => pl.id === playerId);

    if (!tile || tile.type !== 'city' || !prop || prop.ownerId !== playerId || !p) return;

    const currentHouses = prop.houses || 0;
    if (currentHouses <= 0) return;

    // Равномерный снос: сносить можно только с городов с максимальным кол-вом домов в стране
    const countryCities = BOARD_CONFIG.tiles.filter(
      (t) => t.type === 'city' && t.group === tile.group
    );
    const maxHousesInCountry = Math.max(
      ...countryCities.map((c) => room.properties[c.id]?.houses || 0)
    );
    if (currentHouses !== maxHousesInCountry) return;

    const refund = Math.floor(tile.houseCost / 2);
    prop.houses -= 1;
    p.money += refund;
    if (p.money >= 0) p.owedToId = null;

    const maxHouses = (tile.rents?.length || 1) - 1;
    addLog(room, [
      playerSeg(p),
      { text: ` "${tile.name}" shahridagi uyni ${refund}$ ga sotdi (${prop.houses}/${maxHouses}).` },
    ]);
    broadcastRoom(code);
  });

  // 12. Удаление (продажа банку) города/станции/компании за 50% (только в свой ход)
  socket.on('sell_tile', ({ code, playerId, tileId }) => {
    const room = rooms.get(code);
    if (!room || room.status !== 'playing') return;
    const currentTurnPlayer = room.players[room.turnIndex];
    if (!currentTurnPlayer || currentTurnPlayer.id !== playerId) return;

    const tile = BOARD_CONFIG.tiles.find((t) => t.id === tileId);
    const prop = room.properties[tileId];
    const p = room.players.find((pl) => pl.id === playerId);

    if (!tile || !prop || prop.ownerId !== playerId || !p) return;
    if (hasHousesInCountry(room, tile)) return;

    const refund = Math.floor(tile.price / 2);
    delete room.properties[tileId];
    p.money += refund;
    if (p.money >= 0) p.owedToId = null;

    addLog(room, [
      playerSeg(p),
      { text: ` "${tile.name}" mulkini bankka ${refund}$ ga topshirdi.` },
    ]);
    broadcastRoom(code);
  });

  // 13. Выход из тюрьмы за штраф или карту (ход сразу передаётся дальше)
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
      advanceTurn(room);
      broadcastRoom(code);
    } else if (!useCard && p.money >= BOARD_CONFIG.jailFine) {
      p.money -= BOARD_CONFIG.jailFine;
      p.inJail = false;
      p.jailTurns = 0;
      emitMoneyEffect(code, p.position, -BOARD_CONFIG.jailFine);
      addLog(room, [
        playerSeg(p),
        { text: ` ${BOARD_CONFIG.jailFine}$ jarima to‘lab qamoqdan chiqdi!` },
      ]);
      advanceTurn(room);
      broadcastRoom(code);
    }
  });

  // 14. Передача хода
  socket.on('end_turn', ({ code, playerId }) => {
    const room = rooms.get(code);
    if (!room) return;
    const current = room.players[room.turnIndex];
    if (!current || current.id !== playerId || current.money < 0) return;
    advanceTurn(room);
    broadcastRoom(code);
  });

  // 15. Торговля (доступна в любой момент, независимо от очереди)
  socket.on('send_trade', ({ code, trade }) => {
    const room = rooms.get(code);
    if (!room) return;

    const allTradedTileIds = [...(trade.offerTiles || []), ...(trade.requestTiles || [])];
    const blocked = allTradedTileIds.some((tid) => {
      const t = BOARD_CONFIG.tiles.find((x) => x.id === Number(tid));
      return hasHousesInCountry(room, t);
    });
    if (blocked) return;

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

    const allTradedTileIds = [...(trade.offerTiles || []), ...(trade.requestTiles || [])];
    const blocked = allTradedTileIds.some((tid) => {
      const t = BOARD_CONFIG.tiles.find((x) => x.id === Number(tid));
      return hasHousesInCountry(room, t);
    });
    if (blocked) {
      room.pendingTrade = null;
      return broadcastRoom(code);
    }

    fromP.money = fromP.money - trade.offerMoney + trade.requestMoney;
    toP.money = toP.money + trade.offerMoney - trade.requestMoney;

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
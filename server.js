
const http = require('http');
const fs = require('fs');
const path = require('path');
const dgram = require('dgram');
const dns = require('dns').promises;
const { URL } = require('url');

const PORT = 3000;

function queryServer(host, port) {
  return new Promise(async (resolve, reject) => {
    let address;

    try {
      address = (await dns.lookup(host, { family: 4 })).address;
    } catch {
      return reject(new Error('Не удалось найти сервер'));
    }

    const parts = address.split('.').map(Number);
    if (parts.length !== 4) return reject(new Error('Неверный IP'));

    const socket = dgram.createSocket('udp4');
    const started = Date.now();

    const packet = Buffer.alloc(11);
    packet.write('SAMP', 0, 'ascii');
    parts.forEach((n, i) => packet.writeUInt8(n, 4 + i));
    packet.writeUInt16LE(port, 8);
    packet.writeUInt8('i'.charCodeAt(0), 10);

    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('Сервер не ответил. Проверь IP и порт.'));
    }, 4000);

    socket.once('error', err => {
      clearTimeout(timer);
      socket.close();
      reject(err);
    });

    socket.once('message', async msg => {
      clearTimeout(timer);
      const ping = Date.now() - started;
      socket.close();

      try {
        if (msg.length < 15 || msg.toString('ascii', 0, 4) !== 'SAMP') {
          throw new Error('Неверный ответ сервера');
        }

        let offset = 11;
        const password = msg.readUInt8(offset++);
        const players = msg.readUInt16LE(offset);
        offset += 2;
        const maxPlayers = msg.readUInt16LE(offset);
        offset += 2;

        function readString() {
          const end = msg.indexOf(0, offset);
          if (end === -1) throw new Error('Повреждённый ответ');
          const value = msg.toString('utf8', offset, end);
          offset = end + 1;
          return value;
        }

        const hostname = readString();
        const mode = readString();
        const language = readString();

        resolve({
          hostname,
          mode,
          language,
          players,
          maxPlayers,
          password: !!password,
          ping,
          playerList: []
        });
      } catch (err) {
        reject(err);
      }
    });

    socket.send(packet, port, address, err => {
      if (err) {
        clearTimeout(timer);
        socket.close();
        reject(err);
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/api/server') {
    const host = url.searchParams.get('host');
    const port = Number(url.searchParams.get('port'));

    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: 'Неверный адрес или порт' }));
    }

    try {
      const data = await queryServer(host, port);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  const file = path.join(__dirname, 'index.html');

  fs.readFile(file, (err, content) => {
    if (err) {
      res.writeHead(500);
      return res.end('Не найден index.html');
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(content);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`SA-MP MOBILE WEB: http://localhost:${PORT}`);
});

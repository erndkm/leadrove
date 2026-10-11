import { createServer } from 'node:http';
import { chromium } from 'playwright';

// Route handlers supply approved bytes. Anything that escapes interception
// (including a popup, redirect, or browser background request) has no network path.
export async function launchIsolatedBrowser() {
  const proxy = createServer((_request, response) => { response.writeHead(403, { Connection: 'close' }); response.end(); });
  proxy.on('connect', (_request, socket) => socket.destroy());
  const sockets = new Set();
  proxy.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  await new Promise((resolve, reject) => { proxy.once('error', reject); proxy.listen(0, '127.0.0.1', resolve); });
  const close = () => { for (const socket of sockets) socket.destroy(); proxy.close(); };
  try {
    const browser = await chromium.launch({
      headless: true, chromiumSandbox: true, timeout: 20000,
      proxy: { server: `http://127.0.0.1:${proxy.address().port}` },
      args: ['--proxy-bypass-list=<-loopback>', '--disable-quic', '--dns-prefetch-disable', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp'],
    });
    browser.once('disconnected', close);
    return browser;
  } catch (error) { close(); throw error; }
}

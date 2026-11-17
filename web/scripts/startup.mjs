import { createConnection } from 'node:net';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { projectRoot } from './build-core.mjs';

export function openBrowser(address) {
  const command = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const browser = spawn(command, [address], {windowsHide:true, detached:true, stdio:'ignore'});
  browser.on('error', error => console.error(`未能自动打开浏览器：${error.message}`)); browser.unref();
}

export async function checkExisting(port, host) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('端口须为 0–65535 的整数。');
  if (port === 0) return false;
  const occupied = await new Promise(resolveProbe => {
    const socket = createConnection({port,host});
    const finish = value => { socket.destroy(); resolveProbe(value); };
    socket.once('connect', () => finish(true)); socket.once('error', () => finish(false)); socket.setTimeout(1000, () => finish(false));
  });
  if (!occupied) return false;
  const address = `http://${host.includes(':') ? `[${host}]` : host}:${port}/`;
  let health;
  try { const response = await fetch(`${address}api/health`, {signal:AbortSignal.timeout(2000)}); if(response.ok) health = await response.json(); } catch {}
  const expected = resolve(process.env.YINGCHANG_DATA_DIR || join(projectRoot, 'data'));
  const normalize = value => process.platform === 'win32' ? resolve(value).toLowerCase() : resolve(value);
  if (health?.engine === 'cpp' && health.protocol === 1 && typeof health.dataDirectory === 'string' && normalize(health.dataDirectory) === normalize(expected)) {
    console.log(`映场已在运行，复用现有服务：${address}`); return true;
  }
  throw new Error(`端口 ${port} 已被其他服务占用。请使用 --port 指定其他端口，或关闭占用程序后重试。`);
}

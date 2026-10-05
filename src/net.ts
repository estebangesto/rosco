import os from "os";
import dgram from "dgram";
import { AddressInfo } from "net";

const VIRTUAL_IF = /^(docker|veth|br-|virbr|vmnet|vboxnet|tailscale|tun|tap|wg|ppp|zt)/i;

function isUsableIp(ip: string): boolean {
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return false;
  if (ip.startsWith("127.") || ip.startsWith("169.254.")) return false;
  return true;
}

function rank(ip: string): number {
  if (ip.startsWith("192.168.")) return 0;
  if (ip.startsWith("10.")) return 1;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 2;
  return 3;
}

/** IP de origen que usaría el sistema para salir a internet (truco UDP). */
function defaultRouteIp(): string | null {
  let sock: dgram.Socket | null = null;
  try {
    sock = dgram.createSocket("udp4");
    sock.unref(); // nunca retener el event loop
    // connect() no envía nada: solo hace que el kernel elija la IP de origen.
    sock.connect(80, "8.8.8.8");
    const addr = (sock.address() as AddressInfo).address;
    return isUsableIp(addr) ? addr : null;
  } catch {
    return null;
  } finally {
    try {
      sock?.close();
    } catch {
      /* noop */
    }
  }
}

/**
 * Mejor candidata a "IP de la LAN" visible para otros dispositivos:
 * 1) la IP de la ruta por defecto (truco UDP),
 * 2) interfaces físicas ordenadas: 192.168.x, 10.x, 172.16-31.x, resto.
 * Se ignoran interfaces virtuales (docker, veth, vmnet, vpn, ...) y
 * link-local, que suelen ser la causa de links/QR que no funcionan.
 */
export function getLanIp(): string {
  const candidates: string[] = [];
  const viaDefault = defaultRouteIp();
  if (viaDefault) candidates.push(viaDefault);

  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) {
    if (VIRTUAL_IF.test(name)) continue;
    for (const info of ifs[name] ?? []) {
      if (info.family !== "IPv4" || info.internal) continue;
      if (!isUsableIp(info.address)) continue;
      if (!candidates.includes(info.address)) candidates.push(info.address);
    }
  }
  // Sin filtrar por nombre no quedó nada útil: aceptar cualquier IPv4 no interna.
  if (!candidates.length) {
    for (const infos of Object.values(ifs)) {
      for (const info of infos ?? []) {
        if (info.family === "IPv4" && !info.internal && isUsableIp(info.address)) {
          candidates.push(info.address);
        }
      }
    }
  }
  candidates.sort((a, b) => rank(a) - rank(b));
  return candidates[0] ?? "127.0.0.1";
}

export function baseUrl(): string {
  const override = (process.env.PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  if (override) return override;
  const port = Number(process.env.PORT || 3000);
  return `http://${getLanIp()}:${port}`;
}

/**
 * Base para links/QR a partir del request que crea o consulta la partida.
 * Si el moderador abrió el admin con la IP de la LAN (el flujo normal),
 * el header Host ya trae el host correcto, más confiable que cualquier
 * autodetección hecha dentro del contenedor.
 */
export function requestBaseUrl(hostHeader: string | undefined, protocol: string): string {
  const override = (process.env.PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  if (override) return override;
  const host = (hostHeader || "").split(",")[0].trim();
  const bare = host.split(":")[0].toLowerCase();
  if (host && bare && bare !== "localhost" && bare !== "127.0.0.1" && bare !== "::1") {
    const proto = protocol === "https" ? "https" : "http";
    return `${proto}://${host}`;
  }
  return baseUrl();
}

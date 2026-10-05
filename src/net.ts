import os from "os";

/** Primera IPv4 no interna (para que los QR apunten a la LAN). */
export function getLanIp(): string {
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const info of ifs[name] ?? []) {
      if (info.family === "IPv4" && !info.internal) return info.address;
    }
  }
  return "127.0.0.1";
}

export function baseUrl(): string {
  const port = Number(process.env.PORT || 3000);
  return `http://${getLanIp()}:${port}`;
}

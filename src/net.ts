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
  // Dentro de Docker, las interfaces visibles son las del contenedor
  // (ej. 172.x de la red bridge), no la LAN del host: en ese caso
  // hay que fijar PUBLIC_BASE_URL, ej. http://192.168.1.50:3000
  const override = (process.env.PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  if (override) return override;
  const port = Number(process.env.PORT || 3000);
  return `http://${getLanIp()}:${port}`;
}

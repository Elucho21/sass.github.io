# Elevate Bot

Bot de Discord para gestionar los torneos de trading **Elevate** de Impulse World.

---

## Requisitos

- Node.js 18 o superior
- npm

---

## Instalación

```bash
cd elevate-bot
npm install
```

---

## Configuración del .env

Copiá `.env.example` a `.env` y completá los valores:

| Variable | Descripción |
|---|---|
| `DISCORD_TOKEN` | Token del bot (Portal de Discord) |
| `DISCORD_CLIENT_ID` | Application ID del bot |
| `GUILD_ID` | ID del servidor de Discord |
| `ADMIN_ROLE_ID` | ID del rol con acceso a comandos de admin |
| `CHANNEL_TABLA` | ID del canal donde se publica la tabla |
| `CHANNEL_ASCENSOS_LOGROS` | ID del canal de ascensos y logros |
| `CHANNEL_BOT_LOGS` | ID del canal de logs del bot (opcional) |
| `ROLE_ROOKIE` … `ROLE_LEGEND` | IDs de los roles de nivel |
| `ROLE_CAMPEON_NIGHT/DAY/MONTH` | IDs de los roles de campeón por modalidad |
| `ROLE_LOGRO_TOP1` … `ROLE_LOGRO_PNL30` | IDs de los roles de logro individuales |
| `DASHBOARD_PORT` | Puerto del dashboard web (default: 3000) |
| `DASHBOARD_TOKEN` | Token secreto para acceder al dashboard |
| `DB_PATH` | Ruta del archivo SQLite (default: `./data/elevate.db`) |

---

## Iniciar el bot

```bash
node src/bot/index.js
```

---

## Registrar comandos

Hacer esto **UNA SOLA VEZ** o cada vez que agregues nuevos comandos:

```bash
node src/bot/deploy-commands.js
```

---

## Iniciar el dashboard

```bash
node src/dashboard/server.js
```

Accedé en `http://localhost:3000`. Requiere el `DASHBOARD_TOKEN` como Bearer token en cada request.

---

## Ejecutar tests

```bash
npm test
```

---

## Formato de CSV de resultados

Usado con `/cargar-resultados` o `POST /api/upload-results`:

```csv
correo,equidad_actual,rank
trader1@example.com,115000,1
trader2@example.com,108000,2
trader3@example.com,97000,3
```

- `correo`: correo registrado en Impulse World
- `equidad_actual`: balance final de la cuenta
- `rank`: posición final en el torneo

---

## Formato de CSV de vinculación masiva

Usado con `/vincular-masivo` o `POST /api/upload-links`:

```csv
correo,discord_username
trader1@example.com,username_discord
trader2@example.com,otro_usuario
```

---

## Flujo completo de un torneo

1. **Admin** crea el torneo: `/nueva-ronda nombre:"Elevate Night" edicion:20 modalidad:Night`
2. **Admin** configura canales (una sola vez): `/set-canal-tabla #tabla` y `/set-canal-ascensos #ascensos`
3. **Admin** activa el torneo: `/activar` — publica la tabla vacía y la pinnea
4. **Traders** vinculan su correo: `/vincular trader@ejemplo.com`
5. **Admin** carga resultados periódicamente: `/cargar-resultados archivo.csv`
6. La tabla se actualiza automáticamente en el canal configurado
7. **Admin** cierra el torneo al finalizar: `/cerrar-torneo`
   - Calcula ELO para todos los traders vinculados
   - Verifica y asigna logros
   - Publica embeds de ascensos y logros en #ascensos
   - Rota el rol Campeón de la modalidad
   - Publica embed de resultados finales

---

## Tabla de logros y ELO

### Logros por Top 10 acumulado (no repetibles)

| Logro | Umbral | Tier | ELO ganado |
|---|---|---|---|
| 🏅 Primera vez en Top 10 | 1 vez | Pro | +20 |
| 🥈 5 veces en Top 10 | 5 veces | Pro | +20 |
| 🥇 10 veces en Top 10 | 10 veces | Pro | +20 |
| 💎 25 veces en Top 10 | 25 veces | Elite | +35 |
| 👑 50 veces en Top 10 | 50 veces | Master | +60 |
| 🔱 100 veces en Top 10 | 100 veces | Legend | +90 |

### Logros por PnL en un torneo (repetibles)

| Logro | Umbral | Tier | ELO ganado |
|---|---|---|---|
| 📈 +10% en un torneo | ≥10% | Pro | +20 |
| 📊 +15% en un torneo | ≥15% | Elite | +35 |
| 🚀 +20% en un torneo | ≥20% | Master | +60 |
| ⚡ +30% en un torneo | ≥30% | Legend | +90 |

### Niveles ELO

| Nivel | Rango ELO | Factor K |
|---|---|---|
| 🟤 Rookie | 0 – 1299 | 40 |
| 🟢 Trader | 1300 – 1488 | 35 |
| 🔵 Pro | 1489 – 1753 | 43 |
| 🟣 Elite | 1754 – 2097 | 43 |
| 🟡 Master | 2098 – 2573 | 27 |
| 🔴 Legend | 2574+ | 27 |

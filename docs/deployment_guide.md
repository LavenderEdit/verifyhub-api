# Guía de Despliegue, Configuración y Respaldo - VerifyHub API

Esta guía contiene las instrucciones necesarias para desplegar VerifyHub API en entornos de staging y producción.

---

## 1. Guía de Variables de Entorno (.env)

Asegúrate de configurar las siguientes variables de entorno en producción:

| Variable | Descripción | Recomendación / Ejemplo |
| :--- | :--- | :--- |
| `NODE_ENV` | Entorno de ejecución | `production` |
| `PORT` | Puerto de escucha | `3000` |
| `DATABASE_URL` | URL de conexión de Postgres | `postgresql://user:pass@host:5432/verifyhub_db?sslmode=require` |
| `REDIS_URL` | URL de conexión de Redis | `redis://host:6379/0` |
| `JWT_ACCESS_SECRET` | Llave secreta para tokens JWT cortos | Cadena aleatoria hexadecimal de 64 caracteres |
| `JWT_REFRESH_SECRET` | Llave secreta para tokens de refresco | Cadena aleatoria hexadecimal de 64 caracteres |
| `ENCRYPTION_MASTER_KEY` | Llave maestra para cifrar secretos con AES-256-GCM | Debe ser un string seguro de 64-128 caracteres |
| `API_KEY_PEPPER` | Clave secreta (pepper) para hashear API Keys | Cadena de 64 caracteres hex |
| `WWEBJS_SESSION_PATH` | Ruta para almacenar las sesiones de WhatsApp | `/usr/src/app/wwebjs_sessions` (persistido en volumen) |
| `WWEBJS_CHROMIUM_EXECUTABLE_PATH` | Ejecutable de Chromium del sistema en contenedores | `/usr/bin/chromium-browser` |

---

## 2. Configuración de Canales

### A. Canal Correo SMTP
1. Crea un conector SMTP usando `POST /v1/connectors/smtp`.
2. Especifica el host, puerto, seguridad y credenciales.
3. Las credenciales se cifrarán automáticamente en la base de datos PostgreSQL usando AES-256-GCM.
4. Invoca `POST /v1/connectors/smtp/:id/test` para comprobar que VerifyHub puede realizar el handshake con el servidor de correo.

### B. Canal WhatsApp Web (wwebjs)
1. Crea un conector usando `POST /v1/connectors/whatsapp`. La sesión se inicializará automáticamente en segundo plano.
2. Consulta el estado usando `GET /v1/connectors/whatsapp/:id/status`. Cuando el estado sea `QR_READY`, la respuesta incluirá una cadena `qrCode` en formato de texto.
3. Renderiza el QR en tu dashboard o terminal y escanéalo desde la app de WhatsApp de tu dispositivo (Dispositivos Vinculados).
4. El estado del conector cambiará a `AUTHENTICATED` y finalmente a `READY` una vez sincronizada la sesión.

---

## 3. Depuración de whatsapp-web.js (Troubleshooting)

Al ejecutar en Docker, Puppeteer puede fallar al arrancar Chromium debido a dependencias del sistema operativo o permisos de sandbox:

1. **Error: `Puppeteer failed to launch`**:
   - Asegúrate de que el contenedor Docker no esté corriendo como root, pero tenga los paquetes de Chromium instalados. Nuestro `Dockerfile` multi-stage instala las librerías necesarias.
   - En Linux/Docker, los argumentos `--no-sandbox` y `--disable-setuid-sandbox` están habilitados por defecto en el `WhatsappSessionManager` para evitar problemas de permisos.
2. **Error: `Page crashed` o `Out of Memory`**:
   - Agrega el argumento `--disable-dev-shm-usage` (ya incluido en el gestor de sesiones de VerifyHub) para que Puppeteer use `/tmp` en lugar de la memoria compartida limitada de Docker.
3. **Persistencia de Sesiones**:
   - Mapea un volumen Docker a la ruta configurada en `WWEBJS_SESSION_PATH` para evitar tener que re-escanear el QR cada vez que reinicies el contenedor.

---

## 4. Política y Scripts de Respaldo (Backups)

### A. Copia de Seguridad de Base de Datos (PostgreSQL)
Ejecuta el siguiente comando diariamente vía cron para exportar la base de datos:
```bash
docker exec -t verifyhub-db pg_dumpall -c -U verifyhub_user > /backups/postgres/db_backup_$(date +%F).sql
```

### B. Copia de Seguridad de Sesiones de WhatsApp
Respalda las carpetas de autenticación en caliente. Dado que Puppeteer escribe archivos de sesión de Chrome, realiza el respaldo empaquetando el volumen de sesiones:
```bash
tar -czf /backups/wwebjs/sessions_$(date +%F).tar.gz ./wwebjs_sessions
```

---

## 5. Checklist de Producción

* [ ] Cambiar todas las contraseñas por defecto y claves secretas en `.env`.
* [ ] Asegurar conexión SSL/TLS en PostgreSQL en producción.
* [ ] Configurar un volumen persistente para `./wwebjs_sessions` en el orquestador (Docker Compose / Kubernetes).
* [ ] Proteger el endpoint de Swagger `/docs` o deshabilitarlo si la API es puramente interna.
* [ ] Configurar límites de recursos (CPU y memoria) en el contenedor API/Worker para evitar fugas de memoria por subprocesos de Puppeteer.

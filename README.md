## ElectroStar

Portal del gremio de electricistas construido con Next.js 16 y React 19. La API persiste las entidades como archivos JSON dentro de una carpeta de Google Drive.

## Configuración

Copiá `.env.example` a `.env.local` y configurá:

- `GOOGLE_DRIVE_FILE_ID`: ID de la carpeta de Google Drive compartida con la cuenta de servicio. El sistema crea y actualiza `usuarios.json` y `menu.json` en esa carpeta.
- `GOOGLE_CLIENT_EMAIL` y `GOOGLE_PRIVATE_KEY`: credenciales de la cuenta de servicio. La clave privada puede tener saltos de línea escapados como `\\n`.
- `SESSION_SECRET`: secreto aleatorio de al menos 32 bytes para firmar JWT de sesión HS256 en cookies HttpOnly. No reutilices el valor de desarrollo en producción.
- `NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES`: minutos de inactividad antes de cerrar la sesión; el valor local predeterminado es `3`.
- Las variables `MOCK_LOGIN_*` inicializan el primer usuario Admin únicamente cuando `usuarios.json` todavía no existe. Su contraseña se guarda como hash bcrypt.

La cuenta de servicio necesita acceso de edición a la carpeta. Si Google Drive no está configurado, el entorno de desarrollo utiliza `.local-data/`; en producción la API falla de forma explícita y no usa almacenamiento efímero.

Los JWT tienen una vigencia deslizante de 12 horas y se renuevan al validar peticiones autenticadas cuando resta menos de la mitad de ese plazo. La aplicación también valida la sesión periódicamente mientras permanece abierta.

## Desarrollo

```bash
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000). El primer acceso local usa `MOCK_LOGIN_USERNAME` y `MOCK_LOGIN_PASSWORD`.

## API

- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session`
- `GET /api/menu`
- `GET /api/users`, `POST /api/users`, `PATCH /api/users/:idusuario`, `DELETE /api/users/:idusuario` (solo perfil `Admin`)

Los registros de `usuarios.json` tienen `idusuario`, `usuario`, `password` (hash bcrypt) y `perfil` (`Admin` o `Operario`). Las respuestas de usuario nunca incluyen `password`.

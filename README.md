# ElectroStar

Portal de gestión para un gremio de electricistas. La aplicación incluye acceso por perfiles, catálogo de productos y servicios, presupuestos, clientes, órdenes de trabajo y agenda.

## Tecnologías

- Next.js 16 y React 19
- TypeScript
- Tailwind CSS 4
- Google Drive para persistir entidades JSON en producción
- Archivos JSON locales en `.local-data/` para desarrollo sin Drive

## Requisitos

- Node.js compatible con Next.js 16
- npm
- Para usar Google Drive: una cuenta de servicio de Google con acceso de edición a una carpeta de Drive

## Configuración

Creá `.env.local` en la raíz del proyecto. No se incluye un `.env.example` en el repositorio.

```env
SESSION_SECRET=un-secreto-aleatorio-de-al-menos-32-bytes
NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES=3

# Opcional en desarrollo; obligatorio fuera de NODE_ENV=development
GOOGLE_DRIVE_FILE_ID=id-de-la-carpeta-de-drive
GOOGLE_CLIENT_EMAIL=cuenta-de-servicio@proyecto.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

- `SESSION_SECRET`: secreto utilizado para firmar los JWT de sesión con HS256. Debe tener al menos 32 bytes. Usá un valor seguro y distinto en producción.
- `NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES`: minutos de inactividad antes del cierre automático. El valor predeterminado es `3`; valores no numéricos o menores que 1 también utilizan ese valor.
- `GOOGLE_DRIVE_FILE_ID`: ID de la carpeta de Drive, no el ID de un archivo.
- `GOOGLE_CLIENT_EMAIL` y `GOOGLE_PRIVATE_KEY`: credenciales de la cuenta de servicio. Configurá las tres variables de Drive en conjunto. Los saltos de línea de la clave privada pueden representarse como `\n`.

En desarrollo, si no se configura Google Drive, la aplicación lee y escribe en `.local-data/`. En otros entornos Drive es obligatorio: la aplicación informa el error y no recurre a almacenamiento efímero.

### Usuario administrador inicial

La API de administración requiere una sesión con perfil `Admin`. El código actual no implementa variables `MOCK_LOGIN_*` ni crea automáticamente un usuario inicial. Antes de usar el portal, debe existir un registro administrador válido en `usuarios.json`, creado mediante un proceso de aprovisionamiento autorizado y con la contraseña almacenada como hash bcrypt.

## Desarrollo y validaciones

```bash
npm install
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000).

```bash
npm run lint
npm run build
npm start
```

`npm run start` sirve la compilación de producción generada por `npm run build`.

## Inicio de sesión y permisos

- Las contraseñas se validan contra hashes bcrypt; las respuestas de usuario no exponen el hash.
- Los perfiles disponibles son `Admin` y `Operario`.
- El JWT se guarda en una cookie HttpOnly, SameSite Lax y con una duración deslizante de 12 horas. Las peticiones autenticadas renuevan la cookie cuando queda menos de la mitad de su vigencia.
- La validación consulta una caché en memoria de usuarios con vencimiento de 5 segundos. Los cambios de usuarios hechos por la API invalidan la caché en esa instancia; las demás instancias reflejan el cambio al vencer el plazo.
- La interfaz vuelve a validar la sesión periódicamente y cierra la sesión tras el tiempo de inactividad configurado.
- Cerrar sesión desde la interfaz solicita confirmación.
- El login incluye una animación de circuito durante la validación, con estados visuales diferenciados para acceso aprobado y credenciales rechazadas. La animación respeta la preferencia del sistema por movimiento reducido.
- Los modales comparten un estilo visual; sus encabezados distinguen formularios/mensajes estándar (azul), consultas y advertencias (amarillo), errores (rojo) y éxitos (verde).

## Funcionalidades

### Productos y servicios

El perfil `Admin` puede crear, consultar y editar productos y servicios. Antes de borrar un producto, la aplicación consulta sus referencias y muestra los presupuestos y órdenes de trabajo que lo utilizan. Si existe alguna referencia, el borrado se bloquea tanto en la interfaz como en la API.

La pantalla permite seleccionar un archivo para importar, pero el formato de importación todavía no está implementado: `POST /api/products/import` responde `501` y no modifica los datos.

### Presupuestos

El perfil `Admin` puede crear, consultar, editar, borrar y exportar presupuestos en PDF. Un presupuesto contiene cliente, descripción, fecha, productos, cantidades, valores y total calculado a partir del catálogo.

Estados disponibles:

- `borrador`
- `enviado`
- `aceptado`
- `rechazado`

La fecha de vigencia es opcional; al vencer, los presupuestos en borrador o enviados se muestran como vencidos. Aceptar un presupuesto crea una orden de trabajo con sus productos como materiales. Una vez aceptado, el presupuesto no puede editarse ni borrarse y queda como referencia de la orden.

### Clientes e historial

Los clientes se registran con nombre, apellido y teléfono, incluyendo al crear un presupuesto. La sección de clientes —solo para `Admin`— reúne el historial de presupuestos y órdenes de trabajo asociados a cada cliente.

### Órdenes de trabajo

Al aceptar un presupuesto se genera una orden asociada al cliente y al presupuesto de origen, con sus materiales. El perfil `Admin` puede asignarla a un usuario `Operario`, definir las tareas, la dirección, la fecha programada y el estado.

Estados de una orden: `pendiente`, `programada`, `en_curso`, `completada` y `cancelada`. El `Operario` ve solamente las órdenes asignadas a su usuario y puede avanzar su estado siguiendo las transiciones habilitadas por la API.

### Agenda

Los usuarios autenticados pueden consultar, crear, editar y borrar actividades con descripción, fecha, hora y duración.

### Administración de menús

El perfil `Admin` dispone de la opción **Menús** dentro del submenú **Administración**. Desde el árbol puede crear, editar y eliminar nodos, asignarles perfiles y vincularlos con las secciones disponibles de la aplicación. Los nodos se pueden reordenar o anidar mediante arrastrar y soltar. El acceso a la pantalla de administración y su API está restringido en el servidor al perfil `Admin`; los destinos de las opciones se limitan a secciones existentes.

### Usuarios del sistema

El ABM de usuarios permite registrar y modificar nombre, apellido, usuario de acceso y perfil. Las cuentas antiguas sin nombre y apellido siguen siendo válidas y se muestran temporalmente con su usuario de acceso hasta completar esos datos. Al editar, la contraseña es opcional; al cambiarla o modificar el perfil se revocan las sesiones anteriores.

## API

Las rutas de administración requieren una sesión `Admin` y responden `403` si el perfil no está autorizado. Las rutas que requieren inicio de sesión responden `401` si la sesión no es válida.

| Método y ruta | Acceso | Descripción |
|---|---|---|
| `POST /api/auth/login` | Público | Inicia sesión con usuario y contraseña. |
| `POST /api/auth/logout` | Sesión | Cierra la sesión. |
| `GET /api/auth/session` | Sesión | Valida y renueva la sesión cuando corresponde. |
| `GET /api/dashboard` | Sesión | Devuelve métricas agregadas y los próximos elementos visibles para el perfil. |
| `GET /api/menu` | Sesión | Devuelve el menú permitido para el perfil. |
| `PUT /api/menu` | Admin | Valida y guarda el árbol, los perfiles y destinos del menú. |
| `GET /api/users` | Admin | Lista usuarios y perfil, sin incluir sus hashes de contraseña. |
| `POST /api/users` | Admin | Crea un usuario con nombre, apellido y contraseña. |
| `PATCH /api/users/:idusuario` | Admin | Modifica nombre, apellido, usuario y perfil; la contraseña es opcional. |
| `DELETE /api/users/:idusuario` | Admin | Elimina un usuario. |
| `GET /api/products` | Admin | Lista productos y servicios. |
| `POST /api/products` | Admin | Crea un producto o servicio. |
| `GET /api/products/:idproducto` | Admin | Consulta los presupuestos y órdenes que referencian un producto. |
| `PATCH /api/products/:idproducto` | Admin | Modifica un producto o servicio. |
| `DELETE /api/products/:idproducto` | Admin | Elimina solo si no tiene referencias. |
| `POST /api/products/import` | Admin | Endpoint reservado; devuelve `501` mientras no se defina el formato. |
| `GET /api/clients` | Admin | Lista clientes. |
| `POST /api/clients` | Admin | Crea un cliente. |
| `GET /api/budgets` | Admin | Lista presupuestos. |
| `POST /api/budgets` | Admin | Crea un presupuesto. |
| `PATCH /api/budgets/:idpresupuesto` | Admin | Modifica un presupuesto no aceptado. |
| `DELETE /api/budgets/:idpresupuesto` | Admin | Elimina un presupuesto solo si no tiene una orden asociada. |
| `GET /api/budgets/:idpresupuesto/export` | Admin | Descarga el presupuesto como PDF. |
| `GET /api/work-orders` | Sesión | Admin lista todas; Operario solo las asignadas a su usuario. Completa en lote órdenes faltantes de presupuestos aceptados. |
| `PATCH /api/work-orders/:id` | Sesión | Admin configura la orden; Operario actualiza el estado de una orden asignada. |
| `GET /api/calendar` | Sesión | Lista actividades de agenda. |
| `POST /api/calendar` | Sesión | Crea una actividad. |
| `PUT /api/calendar/:id` | Sesión | Modifica una actividad. |
| `DELETE /api/calendar/:id` | Sesión | Elimina una actividad. |

## Persistencia

Cada entidad se guarda como un archivo JSON. En desarrollo sin Google Drive, los archivos locales se escriben en `.local-data/`; con Drive configurado, se guardan en la carpeta indicada por `GOOGLE_DRIVE_FILE_ID`.

| Archivo | Contenido |
|---|---|
| `usuarios.json` | Usuarios, nombre, apellido y hashes bcrypt de contraseña. |
| `menu.json` | Elementos y estructura del menú. |
| `productos.json` | Catálogo de productos y servicios. |
| `clientes.json` | Datos de clientes. |
| `presupuestos.json` | Presupuestos y copia de los valores cotizados. |
| `ordenes-trabajo.json` | Órdenes, asignación, estado y materiales. |
| `calendario.json` | Actividades de agenda. |

Al leer `menu.json`, la API conserva la configuración existente y garantiza la rama protegida **Administración → Menús**. Los archivos JSON son adecuados para un volumen y concurrencia acotados; al crecer el uso, conviene migrar a una base de datos transaccional y establecer copias de seguridad.

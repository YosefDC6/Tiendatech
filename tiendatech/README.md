# TiendaTech CRM

Tienda en línea de electrónica y cómputo (laptops, PCs, componentes y
periféricos) con panel de administración, CRM de clientes, panel de
cliente y un chatbot de recomendaciones basado en presupuesto, uso e
inventario disponible.

Rehecha a partir del proyecto original de perfumería, con la misma
arquitectura (Node/Express + PostgreSQL) pedida para la Etapa 1 (CRM)
del proyecto: front-end, back-end con API REST, base de datos y
autenticación con roles.

## Estructura

```
tiendatech/
├── server.js              # API REST (Express)
├── db.config.js           # credenciales de conexión a PostgreSQL
├── db/
│   └── database.sql       # TODO en un archivo: tablas, triggers, datos
│                          #   de ejemplo y contraseñas (bcrypt vía pgcrypto)
└── public/                # front-end estático
    ├── index.html          # catálogo: búsqueda/filtros por URL, orden, favoritos, alta al carrito
    ├── carrito.html        # carrito + checkout (direcciones guardadas, envío, IVA)
    ├── cuenta.html         # hub del cliente: resumen, pedidos, favoritos, direcciones,
    │                       #   perfil, seguridad (cambiar contraseña), preferencias
    ├── ayuda.html          # centro de ayuda / FAQ + formulario de soporte (→ CRM)
    ├── cliente-panel.html  # redirección a cuenta.html (compatibilidad)
    ├── login.html / registro.html   # con ?next=, mostrar/ocultar contraseña
    ├── css/style.css
    ├── js/api.js, layout.js, chatbot.js, toast.js
    └── admin/
        ├── login.html
        ├── dashboard.html   # métricas CRM (gráficas, clientes en riesgo, más vendidos)
        ├── clientes.html    # listado, etapa CRM, historial de interacciones
        ├── productos.html   # inventario: alta/edición/restock
        ├── pedidos.html     # seguimiento, cambio de estado y detalle de la orden
        ├── chatbot.html     # analítica del chatbot (qué se busca, presupuestos, sin-stock)
        └── usuarios.html    # equipo interno (admin/vendedor) + "mi actividad"
```

## 1. Requisitos

- Node.js 18+
- PostgreSQL 14+

## 2. Instalación

```bash
npm install
```

## 3. Base de datos

1. Crea la base de datos:
   ```sql
   CREATE DATABASE tiendatech;
   ```
2. Edita `db.config.js` con tu usuario/contraseña de PostgreSQL.
3. Carga **todo** con un solo archivo (esquema + triggers + datos +
   contraseñas hasheadas con bcrypt vía `pgcrypto`):
   ```bash
   psql -U postgres -d tiendatech -f db/database.sql
   ```
   No hace falta ningún script de Node aparte. El archivo se puede
   volver a ejecutar: borra todo y lo recrea desde cero.

   Cuentas de prueba que quedan cargadas:

   | Rol       | Correo                         | Contraseña   |
   |-----------|--------------------------------|--------------|
   | Admin     | admin@tiendatech.mx            | admin123     |
   | Vendedor  | laura.vendedor@tiendatech.mx   | vendedor123  |
   | Cliente   | mariana@correo.com             | demo123      |
   | Cliente   | diego@correo.com               | demo123      |
   | Cliente   | sofia@correo.com               | demo123      |
   | Cliente   | carlos@correo.com              | demo123      |

## 4. Correr el proyecto

```bash
npm start
```

- Tienda: http://localhost:3000
- Acceso interno (admin/vendedor): http://localhost:3000/admin/login.html

## Módulo CRM (lo que pide la Etapa 1)

- **Gestión de clientes**: alta desde registro público, listado con
  búsqueda y filtro por etapa, edición de etapa CRM
  (`Prospecto → Activo → Frecuente → Inactivo`).
- **Interacciones**: se registran manualmente desde el panel de
  clientes (llamada, correo, reunión, soporte) y automáticamente
  cuando alguien usa el chatbot (`tipo = chat`).
- **Clasificación y seguimiento**: cada cliente pasa a `Activo`
  automáticamente al confirmar su primera compra.
- **Indicadores**: `/admin/dashboard.html` muestra total de clientes,
  activos/inactivos, interacciones del mes, clientes en riesgo
  (30+ días sin contacto) y gráficas de etapa/tipo de interacción.
- **Roles y autenticación**: login separado para clientes
  (`/api/auth/login-cliente`) y para equipo interno
  (`/api/auth/login-usuario`, roles `admin`/`vendedor`), con
  contraseñas hasheadas con bcrypt. Todas las rutas `/api/admin/*`
  exigen el token del equipo interno (header `Authorization: Bearer
  <token>`, que el front manda automáticamente); crear usuarios
  internos requiere además rol `admin`.
- **"Mi actividad"**: `/api/usuarios/:id/actividad` devuelve las
  interacciones registradas por ese vendedor/admin (visible en
  `/admin/usuarios.html`).
- **Analítica del chatbot** (`/admin/chatbot.html`): consultas por
  uso y por rango de presupuesto, y cuántas búsquedas se quedaron
  **sin recomendación** (señal de restock o de catálogo faltante).
- **Autoservicio del cliente** (`/cuenta.html`): edita sus datos
  (`PUT /api/clientes/:id`) y cancela pedidos aún no procesados
  (`PUT /api/pedidos/:id/cancelar`, que devuelve el stock y registra
  el movimiento de inventario).
- **Soporte del cliente**: el formulario de `/ayuda.html`
  (`POST /api/clientes/:id/soporte`) crea una interacción CRM
  `tipo = soporte`, así que las dudas de los clientes caen en el
  mismo historial que ve el equipo interno.

## Navegación y cuenta del cliente

- **Navbar** con buscador (lleva a `/index.html?busqueda=`), barra de
  categorías (`?categoria=`), menú de cuenta desplegable y menú lateral
  en móvil.
- **Catálogo** (`/index.html`): los filtros viven en la URL (se pueden
  compartir y funciona el botón "atrás"), con orden por precio/nombre,
  corazón de favorito y alta directa al carrito desde la tarjeta.
- **Hub de cuenta** (`/cuenta.html`, secciones por `#hash`):
  - `#resumen` – etapa CRM, nº de pedidos, gasto total, favoritos.
  - `#pedidos` – historial con barra de seguimiento, detalle y cancelar.
  - `#favoritos` – `GET/POST/DELETE /api/clientes/:id/favoritos`.
  - `#direcciones` – CRUD en `/api/clientes/:id/direcciones` (una
    predeterminada), reutilizadas en el checkout.
  - `#perfil` – datos personales.
  - `#seguridad` – `PUT /api/clientes/:id/password` (verifica la actual).
  - `#preferencias` – `PUT /api/clientes/:id/preferencias` (JSONB:
    boletín, ofertas, aviso de estado de pedidos, stock de favoritos).
- **Checkout**: elige una dirección guardada o escribe otra; el total
  incluye IVA 16% y **envío** ($199, gratis desde $10,000; se guarda en
  `pedidos.envio`).
- **UI**: notificaciones tipo *toast* y diálogos de confirmación con
  estilo (`js/toast.js`) en lugar de `alert()`/`confirm()`.

## Chatbot de recomendaciones

El widget pregunta **uso → categoría → presupuesto** (o acepta texto
libre en cualquier momento) y llama a:

`POST /api/chatbot/recomendar`, que recibe `{ uso, presupuesto,
categoria, cliente_id, mensaje }` y:

1. Filtra productos **activos y con stock disponible**.
2. Descarta los que exceden el presupuesto.
3. Da puntaje extra a los que coinciden con el uso buscado
   (`gaming`, `oficina`, `diseno`, `programacion`, `estudiante`,
   `streaming`, `servidor`) y a los más cercanos al presupuesto.
4. Devuelve hasta 5 sugerencias ordenadas por relevancia.
5. Guarda la consulta en `chatbot_consultas` y, si hay un cliente
   logueado, también la registra como interacción CRM tipo `chat`
   (para que aparezca en su historial e influya en sus métricas).

El widget (botón flotante en todas las páginas de la tienda) guía al
usuario con preguntas rápidas de uso y presupuesto, y también acepta
texto libre.

## Notas para producción

- Cambia `db.config.js` y usa variables de entorno reales.
- El token de sesión es simplificado (Base64) y sin expiración,
  pensado para el alcance del proyecto escolar. Ya hay un middleware
  (`requireUsuario` / `requireAdmin` en `server.js`) que verifica el
  token contra la tabla `usuarios` en cada ruta `/api/admin/*`. Para
  producción real conviene cambiarlo por JWT firmado con expiración.
- Las imágenes de producto son URLs externas de ejemplo; para un
  entorno real conviene subirlas a almacenamiento propio (S3, Cloud
  Storage, etc.).

-- =========================================================
--  TiendaTech CRM - Base de datos completa (PostgreSQL)
--  Tienda de electrónica / cómputo (laptops, PCs, componentes,
--  periféricos) con CRM, ventas, inventario y chatbot.
--
--  ARCHIVO ÚNICO: esquema + datos de ejemplo + contraseñas.
--  Las contraseñas de prueba se generan aquí mismo con
--  bcrypt vía pgcrypto (crypt + gen_salt('bf')), así que NO
--  hace falta correr ningún script de Node aparte.
--
--  Uso:
--     CREATE DATABASE tiendatech;
--     psql -U postgres -d tiendatech -f db/database.sql
--
--  Se puede volver a ejecutar: primero borra todo y recrea.
-- =========================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------
-- LIMPIEZA (para poder re-ejecutar el archivo)
-- ---------------------------------------------------------
DROP TABLE IF EXISTS ticket_mensajes         CASCADE;
DROP TABLE IF EXISTS tickets                 CASCADE;
DROP TABLE IF EXISTS resenas                 CASCADE;
DROP TABLE IF EXISTS movimientos_puntos      CASCADE;
DROP TABLE IF EXISTS favoritos               CASCADE;
DROP TABLE IF EXISTS metodos_pago            CASCADE;
DROP TABLE IF EXISTS direcciones             CASCADE;
DROP TABLE IF EXISTS chatbot_consultas       CASCADE;
DROP TABLE IF EXISTS movimientos_inventario  CASCADE;
DROP TABLE IF EXISTS pedido_items            CASCADE;
DROP TABLE IF EXISTS pedidos                 CASCADE;
DROP TABLE IF EXISTS carrito_items           CASCADE;
DROP TABLE IF EXISTS metricas_clientes       CASCADE;
DROP TABLE IF EXISTS interacciones           CASCADE;
DROP TABLE IF EXISTS clientes                CASCADE;
DROP TABLE IF EXISTS productos               CASCADE;
DROP TABLE IF EXISTS categorias              CASCADE;
DROP TABLE IF EXISTS proveedores             CASCADE;
DROP TABLE IF EXISTS usuarios                CASCADE;

DROP FUNCTION IF EXISTS actualizar_fecha()                 CASCADE;
DROP FUNCTION IF EXISTS actualizar_metricas_interaccion()  CASCADE;
DROP FUNCTION IF EXISTS actualizar_metricas_compra()       CASCADE;


-- =========================================================
-- 1. ESQUEMA
-- =========================================================

-- ---------------------------------------------------------
-- USUARIOS INTERNOS (admin / vendedor)
-- ---------------------------------------------------------
CREATE TABLE usuarios (
    id                  SERIAL PRIMARY KEY,
    nombre              VARCHAR(150) NOT NULL,
    email               VARCHAR(150) UNIQUE NOT NULL,
    password_hash       VARCHAR(200) NOT NULL,
    telefono            VARCHAR(30),
    -- Roles internos. Para agregar uno nuevo: añádelo aquí y en
    -- ROLES_INTERNOS (server.js) y PERMISOS (admin/js/admin-layout.js).
    rol                 VARCHAR(20) NOT NULL DEFAULT 'vendedor'
                         CHECK (rol IN ('admin','vendedor','soporte','almacen')),
    activo              BOOLEAN DEFAULT TRUE,
    ultimo_login        TIMESTAMP,
    fecha_creacion      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------
-- PROVEEDORES
-- ---------------------------------------------------------
CREATE TABLE proveedores (
    id             SERIAL PRIMARY KEY,
    nombre         VARCHAR(150) NOT NULL,
    contacto       VARCHAR(150),
    email          VARCHAR(150),
    telefono       VARCHAR(30),
    activo         BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------
-- CATEGORÍAS DE PRODUCTO
-- ---------------------------------------------------------
CREATE TABLE categorias (
    id     SERIAL PRIMARY KEY,
    nombre VARCHAR(80) UNIQUE NOT NULL,   -- Laptops, PC de escritorio, Componentes, Periféricos, Monitores, Accesorios
    icono  VARCHAR(10)
);

-- ---------------------------------------------------------
-- PRODUCTOS (equipo de cómputo)
-- ---------------------------------------------------------
CREATE TABLE productos (
    id                  SERIAL PRIMARY KEY,
    nombre              VARCHAR(180) NOT NULL,
    descripcion         TEXT,
    categoria_id        INTEGER REFERENCES categorias(id),
    marca               VARCHAR(80),
    precio              NUMERIC(10,2) NOT NULL CHECK (precio >= 0),
    stock               INTEGER DEFAULT 0 CHECK (stock >= 0),
    stock_minimo        INTEGER DEFAULT 5,
    -- especificaciones técnicas
    procesador          VARCHAR(120),
    ram_gb              INTEGER,
    almacenamiento      VARCHAR(80),   -- p.ej. "512GB SSD NVMe"
    tarjeta_grafica     VARCHAR(120),
    pantalla            VARCHAR(80),
    -- etiquetas de uso, usadas por el chatbot de recomendaciones
    uso_recomendado     TEXT[] DEFAULT '{}',  -- {gaming,oficina,diseno,programacion,estudiante,streaming,servidor}
    imagen_url          TEXT,
    proveedor_id        INTEGER REFERENCES proveedores(id),
    vendedor_id         INTEGER REFERENCES usuarios(id),
    activo              BOOLEAN DEFAULT TRUE,
    restock             VARCHAR(10) DEFAULT 'push' CHECK (restock IN ('push','pull')),
    fecha_creacion      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_productos_categoria ON productos(categoria_id);
CREATE INDEX idx_productos_uso ON productos USING GIN (uso_recomendado);

-- ---------------------------------------------------------
-- CLIENTES  (front de tienda + CRM)
-- ---------------------------------------------------------
CREATE TABLE clientes (
    id                  SERIAL PRIMARY KEY,
    nombre              VARCHAR(150) NOT NULL,
    correo              VARCHAR(150) UNIQUE NOT NULL,
    password            VARCHAR(200) NOT NULL,
    telefono            VARCHAR(30),
    empresa             VARCHAR(150),
    direccion           VARCHAR(200),
    ciudad              VARCHAR(100),
    estado              VARCHAR(100),
    codigo_postal       VARCHAR(15),
    fecha_nacimiento    DATE,
    genero              VARCHAR(20),
    estado_cliente      VARCHAR(20) DEFAULT 'activo' CHECK (estado_cliente IN ('activo','inactivo')),
    etapa_crm           VARCHAR(20) DEFAULT 'Prospecto'
                         CHECK (etapa_crm IN ('Prospecto','Activo','Frecuente','Inactivo')),
    -- preferencias del cliente en su cuenta (notificaciones, tema, etc.)
    preferencias        JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- saldo de puntos de recompensas (Club TiendaTech)
    puntos              INTEGER NOT NULL DEFAULT 0,
    -- código del socio para el QR de la tarjeta virtual (tienda física)
    codigo_socio        VARCHAR(14) UNIQUE,
    fecha_registro      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ultimo_login        TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------
-- INTERACCIONES CRM (historial centralizado por cliente)
-- ---------------------------------------------------------
CREATE TABLE interacciones (
    id           SERIAL PRIMARY KEY,
    cliente_id   INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    usuario_id   INTEGER REFERENCES usuarios(id),
    tipo         VARCHAR(20) NOT NULL CHECK (tipo IN ('llamada','correo','reunion','chat','soporte')),
    descripcion  TEXT NOT NULL,
    fecha        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_interacciones_cliente ON interacciones(cliente_id);

-- ---------------------------------------------------------
-- MÉTRICAS DE CLIENTE (para el dashboard CRM)
-- ---------------------------------------------------------
CREATE TABLE metricas_clientes (
    cliente_id             INTEGER PRIMARY KEY REFERENCES clientes(id) ON DELETE CASCADE,
    total_interacciones    INTEGER DEFAULT 0,
    total_compras          INTEGER DEFAULT 0,
    valor_total_compras    NUMERIC(12,2) DEFAULT 0,
    ticket_promedio        NUMERIC(12,2) DEFAULT 0,
    ultima_interaccion     TIMESTAMP,
    dias_sin_contacto      INTEGER DEFAULT 0
);

-- ---------------------------------------------------------
-- CARRITO (persistente por cliente, simple)
-- ---------------------------------------------------------
CREATE TABLE carrito_items (
    id              SERIAL PRIMARY KEY,
    cliente_id      INTEGER REFERENCES clientes(id) ON DELETE CASCADE,
    producto_id     INTEGER REFERENCES productos(id) ON DELETE CASCADE,
    cantidad        INTEGER NOT NULL CHECK (cantidad > 0),
    fecha_agregado  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------
-- PEDIDOS
-- ---------------------------------------------------------
CREATE TABLE pedidos (
    id                    SERIAL PRIMARY KEY,
    numero_orden          VARCHAR(40) UNIQUE NOT NULL,
    cliente_id            INTEGER REFERENCES clientes(id),
    vendedor_id           INTEGER REFERENCES usuarios(id),
    subtotal              NUMERIC(12,2) NOT NULL DEFAULT 0,
    impuestos             NUMERIC(12,2) NOT NULL DEFAULT 0,
    envio                 NUMERIC(12,2) NOT NULL DEFAULT 0,
    descuento             NUMERIC(12,2) NOT NULL DEFAULT 0,
    total                 NUMERIC(12,2) NOT NULL DEFAULT 0,
    estado                VARCHAR(20) DEFAULT 'pendiente'
                           CHECK (estado IN ('pendiente','confirmado','procesando','enviado','entregado','cancelado')),
    metodo_pago           VARCHAR(60),
    direccion_envio       VARCHAR(200),
    notas                 TEXT,
    numero_guia           VARCHAR(50),
    transportista         VARCHAR(100),
    fecha_pedido          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_confirmacion    TIMESTAMP,
    fecha_envio           TIMESTAMP,
    fecha_entrega         TIMESTAMP,
    fecha_actualizacion   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pedido_items (
    id                SERIAL PRIMARY KEY,
    pedido_id         INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    producto_id       INTEGER REFERENCES productos(id),
    cantidad          INTEGER NOT NULL CHECK (cantidad > 0),
    precio_unitario   NUMERIC(10,2) NOT NULL,
    subtotal          NUMERIC(12,2) NOT NULL
);

-- ---------------------------------------------------------
-- MOVIMIENTOS DE INVENTARIO
-- ---------------------------------------------------------
CREATE TABLE movimientos_inventario (
    id           SERIAL PRIMARY KEY,
    producto_id  INTEGER REFERENCES productos(id) ON DELETE SET NULL,
    tipo         VARCHAR(20) NOT NULL DEFAULT 'entrada' CHECK (tipo IN ('entrada','salida')),
    cantidad     INTEGER NOT NULL,
    motivo       TEXT,
    fecha        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------
-- CHATBOT: historial de consultas de recomendación
-- (permite ver en el admin qué está buscando la gente:
--  presupuesto, uso, y si hubo stock para recomendar)
-- ---------------------------------------------------------
CREATE TABLE chatbot_consultas (
    id              SERIAL PRIMARY KEY,
    cliente_id      INTEGER REFERENCES clientes(id),
    presupuesto     NUMERIC(10,2),
    uso             VARCHAR(30),
    categoria       VARCHAR(50),
    mensaje         TEXT,
    productos_sugeridos INTEGER[],
    fecha           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------
-- DIRECCIONES guardadas del cliente (para el checkout)
-- ---------------------------------------------------------
CREATE TABLE direcciones (
    id             SERIAL PRIMARY KEY,
    cliente_id     INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    alias          VARCHAR(50),            -- "Casa", "Oficina"
    destinatario   VARCHAR(150),
    calle          VARCHAR(200) NOT NULL,  -- calle, número, colonia
    ciudad         VARCHAR(100),
    estado         VARCHAR(100),
    codigo_postal  VARCHAR(15),
    telefono       VARCHAR(30),
    referencias    TEXT,
    predeterminada BOOLEAN DEFAULT FALSE,
    fecha          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_direcciones_cliente ON direcciones(cliente_id);

-- ---------------------------------------------------------
-- MÉTODOS DE PAGO DEL CLIENTE
--   Nunca se guarda el número completo ni el CVV: solo la
--   marca, los últimos 4 dígitos y la fecha de expiración.
-- ---------------------------------------------------------
CREATE TABLE metodos_pago (
    id             SERIAL PRIMARY KEY,
    cliente_id     INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    tipo           VARCHAR(15) NOT NULL DEFAULT 'tarjeta'
                    CHECK (tipo IN ('tarjeta','transferencia','efectivo')),
    marca          VARCHAR(20),            -- visa / mastercard / amex / otra
    ultimos4       VARCHAR(4),
    titular        VARCHAR(120),
    expira_mes     INTEGER CHECK (expira_mes BETWEEN 1 AND 12),
    expira_anio    INTEGER,
    predeterminada BOOLEAN DEFAULT FALSE,
    fecha          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_metodos_pago_cliente ON metodos_pago(cliente_id);

-- ---------------------------------------------------------
-- FAVORITOS / lista de deseos
-- ---------------------------------------------------------
CREATE TABLE favoritos (
    id           SERIAL PRIMARY KEY,
    cliente_id   INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    producto_id  INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    fecha        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (cliente_id, producto_id)
);

CREATE INDEX idx_favoritos_cliente ON favoritos(cliente_id);

-- ---------------------------------------------------------
-- RECOMPENSAS: historial de puntos (Club TiendaTech)
-- Se ganan al confirmar un pedido y se pueden canjear como
-- descuento en el siguiente. 100 puntos = $10.
-- ---------------------------------------------------------
CREATE TABLE movimientos_puntos (
    id          SERIAL PRIMARY KEY,
    cliente_id  INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    tipo        VARCHAR(12) NOT NULL CHECK (tipo IN ('ganado','canjeado','ajuste')),
    puntos      INTEGER NOT NULL,          -- + al ganar, - al canjear
    motivo      TEXT,
    pedido_id   INTEGER REFERENCES pedidos(id) ON DELETE SET NULL,
    fecha       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_movpuntos_cliente ON movimientos_puntos(cliente_id);

-- ---------------------------------------------------------
-- RESEÑAS de producto (el CRM las muestra como "Evaluaciones")
-- ---------------------------------------------------------
CREATE TABLE resenas (
    id           SERIAL PRIMARY KEY,
    cliente_id   INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    producto_id  INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    calificacion INTEGER NOT NULL CHECK (calificacion BETWEEN 1 AND 5),
    comentario   TEXT,
    fecha        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (cliente_id, producto_id)
);
CREATE INDEX idx_resenas_producto ON resenas(producto_id);
CREATE INDEX idx_resenas_cliente  ON resenas(cliente_id);

-- ---------------------------------------------------------
-- TICKETS DE SOPORTE (cliente <-> equipo, con hilo de mensajes)
-- ---------------------------------------------------------
CREATE TABLE tickets (
    id                  SERIAL PRIMARY KEY,
    folio               VARCHAR(20) UNIQUE NOT NULL,
    cliente_id          INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    asunto              VARCHAR(160) NOT NULL,
    categoria           VARCHAR(40) NOT NULL DEFAULT 'general',
    prioridad           VARCHAR(10) NOT NULL DEFAULT 'media' CHECK (prioridad IN ('baja','media','alta')),
    estado              VARCHAR(15) NOT NULL DEFAULT 'abierto'
                         CHECK (estado IN ('abierto','en_proceso','resuelto','cerrado')),
    pedido_id           INTEGER REFERENCES pedidos(id) ON DELETE SET NULL,
    asignado_a          INTEGER REFERENCES usuarios(id),
    fecha_creacion      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_tickets_cliente ON tickets(cliente_id);
CREATE INDEX idx_tickets_estado  ON tickets(estado);

CREATE TABLE ticket_mensajes (
    id          SERIAL PRIMARY KEY,
    ticket_id   INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    autor       VARCHAR(10) NOT NULL CHECK (autor IN ('cliente','equipo')),
    usuario_id  INTEGER REFERENCES usuarios(id),
    mensaje     TEXT NOT NULL,
    fecha       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_ticketmsg_ticket ON ticket_mensajes(ticket_id);

-- =========================================================
-- TRIGGER: actualizar fecha_actualizacion automáticamente
-- =========================================================
CREATE OR REPLACE FUNCTION actualizar_fecha() RETURNS TRIGGER AS $$
BEGIN
    NEW.fecha_actualizacion = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_productos_fecha BEFORE UPDATE ON productos
    FOR EACH ROW EXECUTE FUNCTION actualizar_fecha();
CREATE TRIGGER trg_clientes_fecha BEFORE UPDATE ON clientes
    FOR EACH ROW EXECUTE FUNCTION actualizar_fecha();
CREATE TRIGGER trg_pedidos_fecha BEFORE UPDATE ON pedidos
    FOR EACH ROW EXECUTE FUNCTION actualizar_fecha();
CREATE TRIGGER trg_usuarios_fecha BEFORE UPDATE ON usuarios
    FOR EACH ROW EXECUTE FUNCTION actualizar_fecha();
CREATE TRIGGER trg_tickets_fecha BEFORE UPDATE ON tickets
    FOR EACH ROW EXECUTE FUNCTION actualizar_fecha();

-- =========================================================
-- TRIGGER: mantener metricas_clientes al registrar interacción
-- =========================================================
CREATE OR REPLACE FUNCTION actualizar_metricas_interaccion() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO metricas_clientes (cliente_id, total_interacciones, ultima_interaccion, dias_sin_contacto)
    VALUES (NEW.cliente_id, 1, NEW.fecha, 0)
    ON CONFLICT (cliente_id) DO UPDATE
        SET total_interacciones = metricas_clientes.total_interacciones + 1,
            ultima_interaccion  = NEW.fecha,
            dias_sin_contacto   = 0;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_interaccion_metricas AFTER INSERT ON interacciones
    FOR EACH ROW EXECUTE FUNCTION actualizar_metricas_interaccion();

-- =========================================================
-- TRIGGER: mantener metricas_clientes al confirmar un pedido
-- =========================================================
CREATE OR REPLACE FUNCTION actualizar_metricas_compra() RETURNS TRIGGER AS $$
BEGIN
    -- Solo cuenta la PRIMERA vez que el pedido entra a un estado "pagado".
    -- Así los cambios de estado posteriores (confirmado -> enviado -> ...)
    -- no vuelven a sumar. Los pedidos creados por la tienda ya nacen
    -- 'confirmado' y actualizan métricas desde server.js (INSERT no dispara
    -- este trigger AFTER UPDATE).
    IF NEW.estado IN ('confirmado','procesando','enviado','entregado')
       AND (OLD.estado IS NULL OR OLD.estado NOT IN ('confirmado','procesando','enviado','entregado')) THEN
        INSERT INTO metricas_clientes (cliente_id, total_compras, valor_total_compras, ticket_promedio)
        VALUES (NEW.cliente_id, 1, NEW.total, NEW.total)
        ON CONFLICT (cliente_id) DO UPDATE
            SET total_compras       = metricas_clientes.total_compras + 1,
                valor_total_compras = metricas_clientes.valor_total_compras + NEW.total,
                ticket_promedio     = (metricas_clientes.valor_total_compras + NEW.total)
                                      / (metricas_clientes.total_compras + 1);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pedido_metricas AFTER UPDATE ON pedidos
    FOR EACH ROW EXECUTE FUNCTION actualizar_metricas_compra();


-- =========================================================
-- 2. DATOS DE EJEMPLO
-- =========================================================

-- El front asigna un ícono SVG por nombre de categoría (icons.js); la
-- columna 'icono' se deja vacía.
INSERT INTO categorias (nombre, icono) VALUES
 ('Laptops', ''),
 ('PC de Escritorio', ''),
 ('Componentes', ''),
 ('Periféricos', ''),
 ('Monitores', ''),
 ('Accesorios', '');

-- Usuarios internos. La contraseña se hashea aquí mismo con bcrypt
-- (pgcrypto). Credenciales de acceso:
--   admin@tiendatech.mx          -> admin123     (rol admin)
--   laura.vendedor@tiendatech.mx -> vendedor123  (rol vendedor)
INSERT INTO usuarios (nombre, email, password_hash, telefono, rol, activo) VALUES
 ('Admin TiendaTech', 'admin@tiendatech.mx',
  crypt('admin123', gen_salt('bf', 10)), '555-000-0001', 'admin', true),
 ('Laura Méndez', 'laura.vendedor@tiendatech.mx',
  crypt('vendedor123', gen_salt('bf', 10)), '555-000-0002', 'vendedor', true),
 ('Rubén Soto', 'ruben.soporte@tiendatech.mx',
  crypt('soporte123', gen_salt('bf', 10)), '555-000-0003', 'soporte', true),
 ('Paola Nieto', 'paola.almacen@tiendatech.mx',
  crypt('almacen123', gen_salt('bf', 10)), '555-000-0004', 'almacen', true);

INSERT INTO proveedores (nombre, contacto, email, telefono) VALUES
 ('DistriTech MX', 'Marco Aurelio', 'ventas@distritech.mx', '555-100-2000'),
 ('CompuMayoreo', 'Ana Ibarra', 'contacto@compumayoreo.mx', '555-100-3000'),
 ('ImportPC', 'Jorge Salinas', 'jorge@importpc.mx', '555-100-4000');

-- ---------------------------------------------------------
-- PRODUCTOS: laptops, PCs, componentes y periféricos reales
-- ---------------------------------------------------------
INSERT INTO productos
 (nombre, descripcion, categoria_id, marca, precio, stock, stock_minimo,
  procesador, ram_gb, almacenamiento, tarjeta_grafica, pantalla,
  uso_recomendado, imagen_url, proveedor_id, activo, restock)
VALUES
 ('Laptop ThinkPad E14', 'Laptop empresarial ligera, ideal para oficina y productividad diaria.',
  1, 'Lenovo', 14999.00, 18, 5, 'Intel Core i5-1335U', 16, '512GB SSD NVMe', 'Intel Iris Xe (integrada)', '14" FHD IPS',
  '{oficina,estudiante,programacion}', NULL, 1, true, 'push'),

 ('Laptop Gamer Legion 5', 'Laptop gamer con gráficos dedicados para juegos AAA a alta tasa de refresco.',
  1, 'Lenovo', 27999.00, 9, 4, 'AMD Ryzen 7 7735HS', 16, '1TB SSD NVMe', 'NVIDIA RTX 4060 8GB', '15.6" FHD 165Hz',
  '{gaming,streaming}', NULL, 2, true, 'push'),

 ('MacBook Air M2', 'Laptop ultradelgada, gran autonomía, ideal para diseño y movilidad.',
  1, 'Apple', 27999.00, 7, 3, 'Apple M2', 8, '256GB SSD', 'GPU integrada 8-core', '13.6" Liquid Retina',
  '{diseno,oficina,estudiante}', NULL, 3, true, 'pull'),

 ('Laptop ASUS VivoBook 15', 'Laptop versátil de entrada, ideal para estudiantes y trámites básicos.',
  1, 'ASUS', 9999.00, 25, 8, 'Intel Core i3-1215U', 8, '256GB SSD NVMe', 'Intel UHD (integrada)', '15.6" FHD',
  '{estudiante,oficina}', NULL, 2, true, 'push'),

 ('Laptop Dell XPS 15', 'Laptop premium para creadores de contenido y edición profesional.',
  1, 'Dell', 39999.00, 5, 3, 'Intel Core i7-13700H', 32, '1TB SSD NVMe', 'NVIDIA RTX 4050 6GB', '15.6" OLED 3.5K',
  '{diseno,programacion,gaming}', NULL, 1, true, 'pull'),

 ('PC Escritorio Oficina Pro', 'Equipo de escritorio compacto para trabajo de oficina y trámites.',
  2, 'HP', 8999.00, 14, 5, 'Intel Core i3-12100', 8, '256GB SSD', 'Intel UHD 730 (integrada)', 'N/A (sin monitor)',
  '{oficina,estudiante}', NULL, 2, true, 'push'),

 ('PC Gamer RTX 4070', 'Torre gamer de alto desempeño para juegos en 1440p y creación de contenido.',
  2, 'ArmadoTech', 34999.00, 6, 3, 'AMD Ryzen 7 7700X', 32, '2TB SSD NVMe', 'NVIDIA RTX 4070 12GB', 'N/A (sin monitor)',
  '{gaming,streaming,diseno}', NULL, 3, true, 'pull'),

 ('PC Workstation Diseño', 'Estación de trabajo para renderizado 3D, edición de video y CAD.',
  2, 'ArmadoTech', 54999.00, 3, 2, 'Intel Core i9-13900', 64, '2TB SSD NVMe + 4TB HDD', 'NVIDIA RTX 4080 16GB', 'N/A (sin monitor)',
  '{diseno,servidor,programacion}', NULL, 1, true, 'pull'),

 ('PC Servidor Mini Torre', 'Equipo confiable para servidor doméstico o de pequeña oficina, bajo consumo.',
  2, 'HP', 12999.00, 8, 4, 'Intel Xeon E-2314', 16, '1TB SSD + 4TB HDD', 'Intel UHD P750', 'N/A (sin monitor)',
  '{servidor,oficina}', NULL, 2, true, 'push'),

 ('Tarjeta Gráfica RTX 4060 Ti', 'GPU dedicada de gama media-alta para gaming en 1440p y trabajo creativo.',
  3, 'ASUS', 8499.00, 20, 6, NULL, NULL, NULL, 'NVIDIA RTX 4060 Ti 8GB', NULL,
  '{gaming,diseno,streaming}', NULL, 2, true, 'push'),

 ('Procesador AMD Ryzen 5 7600', 'CPU de 6 núcleos, gran relación precio-rendimiento para gaming y multitarea.',
  3, 'AMD', 4299.00, 30, 8, 'AMD Ryzen 5 7600 (6C/12T)', NULL, NULL, NULL, NULL,
  '{gaming,oficina,programacion}', NULL, 1, true, 'push'),

 ('Memoria RAM Kingston Fury 32GB (2x16)', 'Kit de memoria DDR5 de alto rendimiento para gaming y multitarea pesada.',
  3, 'Kingston', 2199.00, 40, 10, NULL, 32, NULL, NULL, NULL,
  '{gaming,diseno,programacion}', NULL, 3, true, 'push'),

 ('SSD NVMe Samsung 980 1TB', 'Unidad de estado sólido ultrarrápida para sistema operativo y juegos.',
  3, 'Samsung', 1699.00, 45, 10, NULL, NULL, '1TB SSD NVMe', NULL, NULL,
  '{gaming,oficina,estudiante,programacion,diseno}', NULL, 2, true, 'push'),

 ('Fuente de Poder 650W 80+ Bronze', 'Fuente confiable y eficiente para equipos gamer de gama media.',
  3, 'EVGA', 1499.00, 22, 6, NULL, NULL, NULL, NULL, NULL,
  '{gaming,oficina}', NULL, 1, true, 'push'),

 ('Monitor Gamer 27" 165Hz', 'Monitor curvo QHD con alta tasa de refresco para gaming competitivo.',
  5, 'Samsung', 5999.00, 16, 5, NULL, NULL, NULL, NULL, '27" QHD 165Hz Curvo',
  '{gaming,streaming,diseno}', NULL, 3, true, 'push'),

 ('Monitor Oficina 24" IPS', 'Monitor Full HD con panel IPS, ideal para productividad y estudio.',
  5, 'LG', 2799.00, 28, 8, NULL, NULL, NULL, NULL, '24" FHD IPS',
  '{oficina,estudiante,programacion}', NULL, 2, true, 'push'),

 ('Teclado Mecánico RGB', 'Teclado mecánico switches rojos con retroiluminación RGB personalizable.',
  4, 'Logitech', 1299.00, 35, 10, NULL, NULL, NULL, NULL, NULL,
  '{gaming,streaming}', NULL, 3, true, 'push'),

 ('Mouse Inalámbrico Ergonómico', 'Mouse silencioso e inalámbrico, ideal para largas jornadas de oficina.',
  4, 'Logitech', 599.00, 50, 15, NULL, NULL, NULL, NULL, NULL,
  '{oficina,estudiante,programacion}', NULL, 2, true, 'push'),

 ('Audífonos Gamer 7.1 Surround', 'Audífonos con sonido envolvente y micrófono retráctil para gaming.',
  6, 'HyperX', 1399.00, 24, 8, NULL, NULL, NULL, NULL, NULL,
  '{gaming,streaming}', NULL, 1, true, 'push'),

 ('Webcam Full HD 1080p', 'Webcam con enfoque automático, ideal para streaming y videollamadas.',
  6, 'Logitech', 999.00, 3, 5, NULL, NULL, NULL, NULL, NULL,
  '{streaming,oficina}', NULL, 3, true, 'pull');

-- ---------------------------------------------------------
-- CLIENTES DE PRUEBA  (contraseña "demo123" para los 4,
-- hasheada aquí mismo con bcrypt / pgcrypto)
-- ---------------------------------------------------------
INSERT INTO clientes (nombre, correo, password, telefono, empresa, ciudad, estado, estado_cliente, etapa_crm, fecha_registro) VALUES
 ('Mariana Torres', 'mariana@correo.com', crypt('demo123', gen_salt('bf', 10)), '555-123-4567', 'Estudio Creativo MT', 'Aguascalientes', 'Aguascalientes', 'activo', 'Frecuente', CURRENT_TIMESTAMP - INTERVAL '120 days'),
 ('Diego Ramírez', 'diego@correo.com', crypt('demo123', gen_salt('bf', 10)), '555-987-6543', NULL, 'León', 'Guanajuato', 'activo', 'Activo', CURRENT_TIMESTAMP - INTERVAL '60 days'),
 ('Sofía Herrera', 'sofia@correo.com', crypt('demo123', gen_salt('bf', 10)), '555-456-7890', 'Herrera Diseño', 'Querétaro', 'Querétaro', 'activo', 'Prospecto', CURRENT_TIMESTAMP - INTERVAL '10 days'),
 ('Carlos Fuentes', 'carlos@correo.com', crypt('demo123', gen_salt('bf', 10)), '555-321-6547', NULL, 'CDMX', 'CDMX', 'activo', 'Inactivo', CURRENT_TIMESTAMP - INTERVAL '200 days');

INSERT INTO interacciones (cliente_id, usuario_id, tipo, descripcion, fecha) VALUES
 (1, 1, 'llamada', 'Se discutieron opciones de laptop para edición de video.', CURRENT_TIMESTAMP - INTERVAL '2 days'),
 (1, 1, 'correo', 'Envío de cotización PC Workstation Diseño.', CURRENT_TIMESTAMP - INTERVAL '5 days'),
 (2, 2, 'chat', 'Consultó por el chatbot una laptop gamer con presupuesto de $28,000.', CURRENT_TIMESTAMP - INTERVAL '1 days'),
 (3, 2, 'reunion', 'Reunión inicial para conocer necesidades de cómputo de la agencia.', CURRENT_TIMESTAMP - INTERVAL '9 days');

-- Direcciones y favoritos de ejemplo
INSERT INTO direcciones (cliente_id, alias, destinatario, calle, ciudad, estado, codigo_postal, telefono, predeterminada) VALUES
 (1, 'Casa', 'Mariana Torres', 'Av. Universidad 123, Col. Centro', 'Aguascalientes', 'Aguascalientes', '20000', '555-123-4567', true),
 (2, 'Casa', 'Diego Ramírez', 'Blvd. López Mateos 456, Col. Jardines', 'León', 'Guanajuato', '37000', '555-987-6543', true);

INSERT INTO favoritos (cliente_id, producto_id) VALUES
 (1, 3), (1, 5), (1, 15), (2, 2), (2, 7);

-- Código de socio (va en el QR de la tarjeta virtual)
UPDATE clientes SET codigo_socio = 'TTMX-7K2M9Q' WHERE id = 1;
UPDATE clientes SET codigo_socio = 'TTMX-4A1P8R' WHERE id = 2;
UPDATE clientes SET codigo_socio = 'TTMX-3H6D2L' WHERE id = 3;
UPDATE clientes SET codigo_socio = 'TTMX-9W5C7T' WHERE id = 4;

-- Métodos de pago guardados (solo marca + últimos 4, nunca el número completo)
INSERT INTO metodos_pago (cliente_id, tipo, marca, ultimos4, titular, expira_mes, expira_anio, predeterminada) VALUES
 (1, 'tarjeta', 'visa',       '4821', 'Mariana Torres', 7, 2028, true),
 (1, 'tarjeta', 'mastercard', '1099', 'Mariana Torres', 3, 2027, false),
 (2, 'tarjeta', 'visa',       '5540', 'Diego Ramírez',  11, 2026, true);

-- ---------------------------------------------------------
-- PEDIDOS de ejemplo (historial real de compras).
-- Se insertan con estado final; el trigger de métricas solo
-- corre en UPDATE, así que las métricas se cuadran a mano
-- justo debajo con los mismos totales.
-- ---------------------------------------------------------
INSERT INTO pedidos
 (numero_orden, cliente_id, subtotal, impuestos, envio, descuento, total, estado, metodo_pago, direccion_envio,
  numero_guia, transportista, fecha_pedido, fecha_confirmacion, fecha_envio, fecha_entrega) VALUES
 ('ORD-24051', 1, 54999.00, 8799.84,   0.00,   0.00, 63798.84, 'entregado', 'Tarjeta Visa ****4821', 'Av. Universidad 123, Col. Centro, Aguascalientes',
   'TT240510042', 'Estafeta', CURRENT_TIMESTAMP - INTERVAL '58 days', CURRENT_TIMESTAMP - INTERVAL '58 days', CURRENT_TIMESTAMP - INTERVAL '57 days', CURRENT_TIMESTAMP - INTERVAL '55 days'),
 ('ORD-24188', 1, 27999.00, 4479.84,   0.00,   0.00, 32478.84, 'entregado', 'Tarjeta Visa ****4821', 'Av. Universidad 123, Col. Centro, Aguascalientes',
   'TT241880115', 'DHL', CURRENT_TIMESTAMP - INTERVAL '30 days', CURRENT_TIMESTAMP - INTERVAL '30 days', CURRENT_TIMESTAMP - INTERVAL '29 days', CURRENT_TIMESTAMP - INTERVAL '27 days'),
 ('ORD-24263', 1,  7897.00, 1263.52, 199.00, 440.00,  8919.52, 'entregado', 'Tarjeta Visa ****4821', 'Av. Universidad 123, Col. Centro, Aguascalientes',
   'TT242630087', 'Estafeta', CURRENT_TIMESTAMP - INTERVAL '8 days', CURRENT_TIMESTAMP - INTERVAL '8 days', CURRENT_TIMESTAMP - INTERVAL '7 days', CURRENT_TIMESTAMP - INTERVAL '5 days'),
 ('ORD-24120', 2, 27999.00, 4479.84,   0.00,   0.00, 32478.84, 'entregado', 'Transferencia SPEI', 'Blvd. López Mateos 456, Col. Jardines, León',
   'TT241200231', 'DHL', CURRENT_TIMESTAMP - INTERVAL '15 days', CURRENT_TIMESTAMP - INTERVAL '15 days', CURRENT_TIMESTAMP - INTERVAL '14 days', CURRENT_TIMESTAMP - INTERVAL '12 days'),
 ('ORD-24310', 2, 34999.00, 5599.84,   0.00,   0.00, 40598.84, 'enviado', 'Tarjeta Visa ****5540', 'Blvd. López Mateos 456, Col. Jardines, León',
   'TT243100199', 'Estafeta', CURRENT_TIMESTAMP - INTERVAL '3 days', CURRENT_TIMESTAMP - INTERVAL '3 days', CURRENT_TIMESTAMP - INTERVAL '2 days', NULL),
 ('ORD-24225', 4,  9999.00, 1599.84, 199.00,   0.00, 11797.84, 'entregado', 'Tarjeta de crédito', 'Zona Centro, Querétaro',
   'TT242250164', 'Fedex', CURRENT_TIMESTAMP - INTERVAL '20 days', CURRENT_TIMESTAMP - INTERVAL '20 days', CURRENT_TIMESTAMP - INTERVAL '19 days', CURRENT_TIMESTAMP - INTERVAL '17 days');

INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario, subtotal) VALUES
 ((SELECT id FROM pedidos WHERE numero_orden = 'ORD-24051'), 8, 1, 54999.00, 54999.00),
 ((SELECT id FROM pedidos WHERE numero_orden = 'ORD-24188'), 3, 1, 27999.00, 27999.00),
 ((SELECT id FROM pedidos WHERE numero_orden = 'ORD-24263'), 15, 1, 5999.00, 5999.00),
 ((SELECT id FROM pedidos WHERE numero_orden = 'ORD-24263'), 17, 1, 1299.00, 1299.00),
 ((SELECT id FROM pedidos WHERE numero_orden = 'ORD-24263'), 18, 1,  599.00,  599.00),
 ((SELECT id FROM pedidos WHERE numero_orden = 'ORD-24120'), 2, 1, 27999.00, 27999.00),
 ((SELECT id FROM pedidos WHERE numero_orden = 'ORD-24310'), 7, 1, 34999.00, 34999.00),
 ((SELECT id FROM pedidos WHERE numero_orden = 'ORD-24225'), 4, 1,  9999.00,  9999.00);

-- ---------------------------------------------------------
-- MÉTRICAS iniciales — cuadradas con los pedidos de arriba
-- (para que el dashboard y los niveles del Club se vean
--  con datos desde el arranque)
-- ---------------------------------------------------------
INSERT INTO metricas_clientes (cliente_id, total_compras, valor_total_compras, ticket_promedio) VALUES
 (1, 3, 105197.20, 35065.73),
 (2, 2,  73077.68, 36538.84),
 (3, 0,        0,        0),
 (4, 1,  11797.84, 11797.84)
ON CONFLICT (cliente_id) DO UPDATE
    SET total_compras       = EXCLUDED.total_compras,
        valor_total_compras = EXCLUDED.valor_total_compras,
        ticket_promedio     = EXCLUDED.ticket_promedio;

-- Puntos del Club (100 puntos = $10). El saldo de cada cliente
-- es la suma de sus movimientos.
UPDATE clientes SET puntos = 1240 WHERE id = 1;
UPDATE clientes SET puntos = 755  WHERE id = 2;
UPDATE clientes SET puntos = 117  WHERE id = 4;
INSERT INTO movimientos_puntos (cliente_id, tipo, puntos, motivo, pedido_id, fecha) VALUES
 (1, 'ganado',   980, 'Compra ORD-24051 · PC Workstation Diseño',   (SELECT id FROM pedidos WHERE numero_orden = 'ORD-24051'), CURRENT_TIMESTAMP - INTERVAL '55 days'),
 (1, 'ganado',   700, 'Compra ORD-24188 · MacBook Air M2',          (SELECT id FROM pedidos WHERE numero_orden = 'ORD-24188'), CURRENT_TIMESTAMP - INTERVAL '27 days'),
 (1, 'canjeado', -440, 'Descuento aplicado en ORD-24263',           (SELECT id FROM pedidos WHERE numero_orden = 'ORD-24263'), CURRENT_TIMESTAMP - INTERVAL '8 days'),
 (2, 'ganado',   350, 'Compra ORD-24120 · Laptop Gamer Legion 5',   (SELECT id FROM pedidos WHERE numero_orden = 'ORD-24120'), CURRENT_TIMESTAMP - INTERVAL '12 days'),
 (2, 'ganado',   405, 'Compra ORD-24310 · PC Gamer RTX 4070',       (SELECT id FROM pedidos WHERE numero_orden = 'ORD-24310'), CURRENT_TIMESTAMP - INTERVAL '2 days'),
 (4, 'ganado',   117, 'Compra ORD-24225 · Laptop ASUS VivoBook 15', (SELECT id FROM pedidos WHERE numero_orden = 'ORD-24225'), CURRENT_TIMESTAMP - INTERVAL '17 days');

-- Reseñas / Evaluaciones
INSERT INTO resenas (cliente_id, producto_id, calificacion, comentario, fecha) VALUES
 (1, 3, 5, 'Excelente para diseño, la batería dura todo el día.', CURRENT_TIMESTAMP - INTERVAL '18 days'),
 (1, 15, 4, 'Muy buen monitor, aunque el soporte es algo simple.', CURRENT_TIMESTAMP - INTERVAL '10 days'),
 (2, 2, 5, 'Corre todo a tope, llegó bien empacada.',              CURRENT_TIMESTAMP - INTERVAL '12 days');

-- Ticket de soporte de ejemplo
INSERT INTO tickets (folio, cliente_id, asunto, categoria, prioridad, estado) VALUES
 ('TK-1001', 1, 'Falta un cable en el pedido', 'pedido', 'media', 'en_proceso');
INSERT INTO ticket_mensajes (ticket_id, autor, usuario_id, mensaje, fecha) VALUES
 (1, 'cliente', NULL, 'Recibí la laptop pero el cargador no venía en la caja.', CURRENT_TIMESTAMP - INTERVAL '3 days'),
 (1, 'equipo',  1,    'Gracias por avisar, ya programamos el envío del cargador. Llega en 2 días.', CURRENT_TIMESTAMP - INTERVAL '2 days');

-- =========================================================
--  Listo. Credenciales de prueba:
--    admin@tiendatech.mx          / admin123
--    laura.vendedor@tiendatech.mx / vendedor123
--    mariana@correo.com           / demo123   (y diego / sofia / carlos)
-- =========================================================

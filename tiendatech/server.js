// =========================================================
//  TiendaTech CRM - Backend (Express + PostgreSQL)
// =========================================================
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const path = require('path');
const { Pool } = require('pg');
const dbConfig = require('./db.config.js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool(dbConfig);

// Solo se registran errores reales del servidor en la consola; nada
// decorativo. El cliente nunca ve mensajes de consola: la UI usa toasts.

const asyncRoute = (fn) => (req, res) => fn(req, res).catch((err) => {
    console.error(req.method, req.originalUrl, '->', err.message);
    res.status(500).json({ error: 'Error del servidor', detalle: err.message });
});

// =========================================================
// MIDDLEWARE DE AUTENTICACIÓN (equipo interno)
// El token es el Base64 "usuario:<id>:<timestamp>" que emite
// /api/auth/login-usuario. Se envía en el header Authorization.
// =========================================================
async function requireUsuario(req, res, next) {
    try {
        const header = req.headers.authorization || '';
        const token = header.startsWith('Bearer ') ? header.slice(7) : null;
        if (!token) return res.status(401).json({ message: 'Sesión no encontrada. Inicia sesión de nuevo.' });

        const decoded = Buffer.from(token, 'base64').toString('utf8'); // "usuario:<id>:<ts>"
        const [tipo, id] = decoded.split(':');
        if (tipo !== 'usuario' || !id) return res.status(401).json({ message: 'Token inválido' });

        const result = await pool.query('SELECT id, nombre, email, rol, activo FROM usuarios WHERE id = $1', [id]);
        if (result.rows.length === 0 || !result.rows[0].activo) {
            return res.status(403).json({ message: 'Cuenta inactiva o inexistente' });
        }
        req.usuario = result.rows[0];
        next();
    } catch (e) {
        return res.status(401).json({ message: 'No autenticado' });
    }
}

function requireAdmin(req, res, next) {
    if (!req.usuario || req.usuario.rol !== 'admin') {
        return res.status(403).json({ message: 'Esta acción requiere rol de administrador' });
    }
    next();
}

// =========================================================
// MIDDLEWARE DE AUTENTICACIÓN (cliente / tienda)
// Token Base64 "cliente:<id>:<timestamp>" que emiten
// login-cliente y registro-cliente. Obliga a iniciar sesión
// para el carrito, los pedidos y el perfil.
// =========================================================
async function requireCliente(req, res, next) {
    try {
        const header = req.headers.authorization || '';
        const token = header.startsWith('Bearer ') ? header.slice(7) : null;
        if (!token) return res.status(401).json({ message: 'Inicia sesión para continuar' });

        const decoded = Buffer.from(token, 'base64').toString('utf8'); // "cliente:<id>:<ts>"
        const [tipo, id] = decoded.split(':');
        if (tipo !== 'cliente' || !id) return res.status(401).json({ message: 'Sesión no válida' });

        const r = await pool.query(
            "SELECT id, nombre, correo FROM clientes WHERE id = $1 AND estado_cliente = 'activo'",
            [id]
        );
        if (r.rows.length === 0) return res.status(401).json({ message: 'Sesión no válida' });
        req.cliente = r.rows[0];
        next();
    } catch (e) {
        return res.status(401).json({ message: 'Inicia sesión para continuar' });
    }
}

// El :id de la ruta debe ser el propio cliente autenticado.
function mismoCliente(req, res, next) {
    if (String(req.cliente.id) !== String(req.params.id)) {
        return res.status(403).json({ message: 'No puedes ver ni modificar datos de otra cuenta' });
    }
    next();
}

// =========================================================
// CLUB TIENDATECH (recompensas por puntos)
//   - Se gana: floor(subtotal / 20) * multiplicador del nivel
//   - Se canjea: 100 puntos = $10  (VALOR_PUNTO = 0.10)
//   - Nivel: el mayor entre el que dan las compras totales ($)
//     y el que dan la frecuencia (número de compras).
// =========================================================
const VALOR_PUNTO = 0.10;
const NIVELES = [
    { clave: 'bronce',  nombre: 'Bronce',  multiplicador: 1.0,  minGasto: 0,      minCompras: 0 },
    { clave: 'plata',   nombre: 'Plata',   multiplicador: 1.15, minGasto: 15000,  minCompras: 2 },
    { clave: 'oro',     nombre: 'Oro',     multiplicador: 1.3,  minGasto: 50000,  minCompras: 5 },
    { clave: 'platino', nombre: 'Platino', multiplicador: 1.6,  minGasto: 120000, minCompras: 10 },
];
function nivelRecompensas(valorTotal = 0, totalCompras = 0) {
    let idx = 0;
    for (let i = 0; i < NIVELES.length; i++) {
        if (Number(valorTotal) >= NIVELES[i].minGasto || Number(totalCompras) >= NIVELES[i].minCompras) idx = i;
    }
    const actual = NIVELES[idx];
    const siguiente = NIVELES[idx + 1] || null;
    return { indice: idx, actual, siguiente };
}

// Código único de socio para el QR de la tarjeta virtual (formato TTMX-XXXXXX).
function generarCodigoSocio() {
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin I/O/0/1 para que sea legible
    let s = '';
    for (let i = 0; i < 6; i++) s += abc[Math.floor(Math.random() * abc.length)];
    return 'TTMX-' + s;
}

// Detecta la marca de una tarjeta por su número (solo para guardar la marca;
// el número completo y el CVV NUNCA se almacenan).
function marcaTarjeta(numero) {
    const n = String(numero || '').replace(/\D/g, '');
    if (/^4/.test(n)) return 'visa';
    if (/^(5[1-5]|2[2-7])/.test(n)) return 'mastercard';
    if (/^3[47]/.test(n)) return 'amex';
    return 'otra';
}
async function estadoRecompensas(clienteId) {
    const c = await pool.query('SELECT puntos FROM clientes WHERE id = $1', [clienteId]);
    if (c.rows.length === 0) return null;
    const m = await pool.query(
        'SELECT COALESCE(valor_total_compras,0) AS gasto, COALESCE(total_compras,0) AS compras FROM metricas_clientes WHERE cliente_id = $1',
        [clienteId]
    );
    const gasto = Number(m.rows[0]?.gasto || 0);
    const compras = Number(m.rows[0]?.compras || 0);
    const { actual, siguiente } = nivelRecompensas(gasto, compras);
    let progreso = 1;
    if (siguiente) {
        const porGasto = Math.min(1, gasto / siguiente.minGasto);
        const porCompras = Math.min(1, compras / siguiente.minCompras);
        progreso = Math.max(porGasto, porCompras);
    }
    return {
        puntos: c.rows[0].puntos,
        valor_en_dinero: Math.round(c.rows[0].puntos * VALOR_PUNTO * 100) / 100,
        valor_punto: VALOR_PUNTO,
        gasto_total: gasto,
        compras_total: compras,
        nivel: actual,
        siguiente_nivel: siguiente,
        progreso: Math.round(progreso * 100),
        niveles: NIVELES,
    };
}

// =========================================================
// AUTENTICACIÓN
// =========================================================

// Login de cliente (tienda)
app.post('/api/auth/login-cliente', asyncRoute(async (req, res) => {
    const { correo, password } = req.body;
    if (!correo || !password) return res.status(400).json({ message: 'Correo y contraseña son requeridos' });

    const result = await pool.query(
        `SELECT * FROM clientes WHERE correo = $1 AND estado_cliente = 'activo'`,
        [correo]
    );
    if (result.rows.length === 0) return res.status(401).json({ message: 'Correo o contraseña incorrectos' });

    const cliente = result.rows[0];
    const valido = await bcrypt.compare(password, cliente.password).catch(() => false);
    if (!valido) return res.status(401).json({ message: 'Correo o contraseña incorrectos' });

    await pool.query('UPDATE clientes SET ultimo_login = CURRENT_TIMESTAMP WHERE id = $1', [cliente.id]);
    delete cliente.password;
    const token = Buffer.from(`cliente:${cliente.id}:${Date.now()}`).toString('base64');
    res.json({ success: true, cliente, token });
}));

// Registro de cliente
app.post('/api/auth/registro-cliente', asyncRoute(async (req, res) => {
    const { nombre, correo, password, telefono, empresa, ciudad, estado, direccion, codigo_postal } = req.body;
    if (!nombre || !correo || !password) return res.status(400).json({ message: 'Nombre, correo y contraseña son obligatorios' });
    if (password.length < 6) return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' });

    const existe = await pool.query('SELECT id FROM clientes WHERE correo = $1', [correo]);
    if (existe.rows.length > 0) return res.status(400).json({ message: 'Este correo ya está registrado' });

    const hash = await bcrypt.hash(password, 10);

    // Código de socio único (reintenta si choca con uno existente)
    let codigoSocio;
    for (let intento = 0; intento < 5; intento++) {
        codigoSocio = generarCodigoSocio();
        const dup = await pool.query('SELECT 1 FROM clientes WHERE codigo_socio = $1', [codigoSocio]);
        if (dup.rows.length === 0) break;
    }

    const result = await pool.query(
        `INSERT INTO clientes (nombre, correo, password, telefono, empresa, ciudad, estado, direccion, codigo_postal, codigo_socio, estado_cliente, etapa_crm)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'activo','Prospecto')
         RETURNING id, nombre, correo, telefono, empresa, ciudad, estado, codigo_socio, etapa_crm, fecha_registro`,
        [nombre, correo, hash, telefono, empresa, ciudad, estado, direccion, codigo_postal, codigoSocio]
    );
    const cliente = result.rows[0];
    await pool.query('INSERT INTO metricas_clientes (cliente_id) VALUES ($1)', [cliente.id]);

    const token = Buffer.from(`cliente:${cliente.id}:${Date.now()}`).toString('base64');
    res.status(201).json({ success: true, cliente, token });
}));

// Login de usuario interno (admin / vendedor)
app.post('/api/auth/login-usuario', asyncRoute(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email y contraseña son requeridos' });

    const result = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(401).json({ message: 'Credenciales incorrectas' });

    const usuario = result.rows[0];
    if (!usuario.activo) return res.status(403).json({ message: 'Cuenta inactiva' });

    const valido = await bcrypt.compare(password, usuario.password_hash).catch(() => false);
    if (!valido) return res.status(401).json({ message: 'Credenciales incorrectas' });

    await pool.query('UPDATE usuarios SET ultimo_login = CURRENT_TIMESTAMP WHERE id = $1', [usuario.id]);
    delete usuario.password_hash;
    const token = Buffer.from(`usuario:${usuario.id}:${Date.now()}`).toString('base64');
    res.json({ success: true, usuario, token });
}));

// =========================================================
// CATEGORÍAS Y PRODUCTOS (catálogo público)
// =========================================================

app.get('/api/categorias', asyncRoute(async (req, res) => {
    const result = await pool.query('SELECT * FROM categorias ORDER BY id ASC');
    res.json(result.rows);
}));

// Catálogo con filtros: categoria, uso, precio_min, precio_max, busqueda
app.get('/api/productos', asyncRoute(async (req, res) => {
    const { categoria, uso, precio_min, precio_max, busqueda, marca } = req.query;
    const cond = ['p.activo = true'];
    const values = [];
    let i = 1;

    if (categoria) { cond.push(`c.nombre = $${i++}`); values.push(categoria); }
    if (uso) { cond.push(`$${i++} = ANY(p.uso_recomendado)`); values.push(uso); }
    if (marca) { cond.push(`p.marca ILIKE $${i++}`); values.push(`%${marca}%`); }
    if (precio_min) { cond.push(`p.precio >= $${i++}`); values.push(precio_min); }
    if (precio_max) { cond.push(`p.precio <= $${i++}`); values.push(precio_max); }
    if (busqueda) { cond.push(`(p.nombre ILIKE $${i} OR p.descripcion ILIKE $${i} OR p.marca ILIKE $${i})`); values.push(`%${busqueda}%`); i++; }

    const query = `
        SELECT p.*, c.nombre AS categoria_nombre, c.icono AS categoria_icono
        FROM productos p LEFT JOIN categorias c ON p.categoria_id = c.id
        WHERE ${cond.join(' AND ')}
        ORDER BY p.nombre ASC
    `;
    const result = await pool.query(query, values);
    res.json(result.rows);
}));

app.get('/api/productos/:id', asyncRoute(async (req, res) => {
    const result = await pool.query(
        `SELECT p.*, c.nombre AS categoria_nombre FROM productos p
         LEFT JOIN categorias c ON p.categoria_id = c.id WHERE p.id = $1`,
        [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Producto no encontrado' });
    res.json(result.rows[0]);
}));

// Reseñas públicas de un producto (promedio + lista)
app.get('/api/productos/:id/resenas', asyncRoute(async (req, res) => {
    const stats = await pool.query(
        'SELECT ROUND(AVG(calificacion), 1) AS promedio, COUNT(*)::int AS total FROM resenas WHERE producto_id = $1',
        [req.params.id]
    );
    const lista = await pool.query(
        `SELECT re.calificacion, re.comentario, re.fecha, c.nombre AS cliente_nombre
         FROM resenas re JOIN clientes c ON re.cliente_id = c.id
         WHERE re.producto_id = $1 ORDER BY re.fecha DESC LIMIT 30`,
        [req.params.id]
    );
    res.json({
        promedio: Number(stats.rows[0].promedio) || 0,
        total: stats.rows[0].total,
        resenas: lista.rows,
    });
}));

// =========================================================
// CHATBOT DE RECOMENDACIONES
// Reglas: filtra por presupuesto + uso + categoría + stock,
// y ordena por relevancia (coincidencia de uso, cercanía al
// presupuesto, disponibilidad).
// =========================================================
app.post('/api/chatbot/recomendar', asyncRoute(async (req, res) => {
    const { presupuesto, uso, categoria, cliente_id, mensaje } = req.body;

    const cond = ['p.activo = true', 'p.stock > 0'];
    const values = [];
    let i = 1;

    if (presupuesto) { cond.push(`p.precio <= $${i++}`); values.push(presupuesto); }
    if (categoria) { cond.push(`c.nombre = $${i++}`); values.push(categoria); }

    const query = `
        SELECT p.*, c.nombre AS categoria_nombre
        FROM productos p LEFT JOIN categorias c ON p.categoria_id = c.id
        WHERE ${cond.join(' AND ')}
        ORDER BY p.precio DESC
    `;
    const result = await pool.query(query, values);

    // Puntaje: +3 si coincide el uso, + cercanía al presupuesto, +1 si hay buen stock
    let productos = result.rows.map((p) => {
        let score = 0;
        if (uso && p.uso_recomendado && p.uso_recomendado.includes(uso)) score += 3;
        if (presupuesto) {
            const cercania = 1 - Math.abs(presupuesto - p.precio) / presupuesto;
            score += Math.max(cercania, 0) * 2;
        }
        if (p.stock > p.stock_minimo) score += 0.5;
        return { ...p, score };
    });

    productos.sort((a, b) => b.score - a.score);
    const sugerencias = productos.slice(0, 5);

    // Mensaje conversacional simple según lo encontrado
    let respuesta;
    if (sugerencias.length === 0) {
        respuesta = presupuesto
            ? `No encontré equipo${categoria ? ` de ${categoria.toLowerCase()}` : ''} disponible con ese presupuesto (hasta $${Number(presupuesto).toLocaleString('es-MX')}). ¿Quieres que busque un rango más amplio?`
            : 'No encontré productos disponibles con esos criterios. ¿Puedes darme más detalles?';
    } else {
        respuesta = `Con base en ${uso ? `el uso que buscas (${uso})` : 'lo que me cuentas'}${presupuesto ? ` y un presupuesto de hasta $${Number(presupuesto).toLocaleString('es-MX')}` : ''}, esto es lo que más te conviene:`;
    }

    try {
        await pool.query(
            `INSERT INTO chatbot_consultas (cliente_id, presupuesto, uso, categoria, mensaje, productos_sugeridos)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [cliente_id || null, presupuesto || null, uso || null, categoria || null, mensaje || null, sugerencias.map((s) => s.id)]
        );
        // Si hay cliente logueado, esto también cuenta como una interacción CRM
        if (cliente_id) {
            await pool.query(
                `INSERT INTO interacciones (cliente_id, tipo, descripcion) VALUES ($1, 'chat', $2)`,
                [cliente_id, `Consulta al chatbot: ${mensaje || `uso=${uso || 'N/A'}, presupuesto=${presupuesto || 'N/A'}`}`]
            );
        }
    } catch (e) {
        // Registrar la consulta es opcional; si falla no se interrumpe la respuesta.
    }

    res.json({ respuesta, sugerencias });
}));

// =========================================================
// CARRITO  (requiere sesión de cliente)
// =========================================================
app.use('/api/carrito', requireCliente);

app.get('/api/carrito/:clienteId', asyncRoute(async (req, res) => {
    const clienteId = req.cliente.id; // el de la sesión, no el de la URL
    const result = await pool.query(
        `SELECT ci.id, ci.cantidad, p.id AS producto_id, p.nombre, p.precio, p.imagen_url, p.stock
         FROM carrito_items ci JOIN productos p ON ci.producto_id = p.id
         WHERE ci.cliente_id = $1 ORDER BY ci.fecha_agregado DESC`,
        [clienteId]
    );
    res.json(result.rows);
}));

app.post('/api/carrito', asyncRoute(async (req, res) => {
    const cliente_id = req.cliente.id;
    const { producto_id, cantidad = 1 } = req.body;
    const existente = await pool.query(
        'SELECT id, cantidad FROM carrito_items WHERE cliente_id = $1 AND producto_id = $2',
        [cliente_id, producto_id]
    );
    if (existente.rows.length > 0) {
        const nuevaCantidad = existente.rows[0].cantidad + cantidad;
        await pool.query('UPDATE carrito_items SET cantidad = $1 WHERE id = $2', [nuevaCantidad, existente.rows[0].id]);
    } else {
        await pool.query('INSERT INTO carrito_items (cliente_id, producto_id, cantidad) VALUES ($1,$2,$3)', [cliente_id, producto_id, cantidad]);
    }
    res.status(201).json({ message: 'Agregado al carrito' });
}));

app.put('/api/carrito/:id', asyncRoute(async (req, res) => {
    const { cantidad } = req.body;
    const r = await pool.query(
        'UPDATE carrito_items SET cantidad = $1 WHERE id = $2 AND cliente_id = $3 RETURNING id',
        [cantidad, req.params.id, req.cliente.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: 'Ítem no encontrado en tu carrito' });
    res.json({ message: 'Carrito actualizado' });
}));

app.delete('/api/carrito', asyncRoute(async (req, res) => {
    await pool.query('DELETE FROM carrito_items WHERE cliente_id = $1', [req.cliente.id]);
    res.json({ message: 'Carrito vaciado' });
}));

app.delete('/api/carrito/:id', asyncRoute(async (req, res) => {
    await pool.query('DELETE FROM carrito_items WHERE id = $1 AND cliente_id = $2', [req.params.id, req.cliente.id]);
    res.json({ message: 'Producto eliminado del carrito' });
}));

// =========================================================
// PEDIDOS (checkout + seguimiento)
// =========================================================

app.post('/api/pedidos', requireCliente, asyncRoute(async (req, res) => {
    const cliente_id = req.cliente.id;
    const { items, metodo_pago, direccion_envio, notas } = req.body;
    let puntos_canjear = Math.max(0, Math.floor(Number(req.body.puntos_canjear) || 0));
    if (!items || items.length === 0) {
        return res.status(400).json({ message: 'El carrito no tiene productos' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        let subtotal = 0;
        const detalles = [];

        for (const item of items) {
            const prod = await client.query('SELECT precio, stock, nombre FROM productos WHERE id = $1 FOR UPDATE', [item.producto_id]);
            if (prod.rows.length === 0) throw new Error(`Producto ${item.producto_id} no encontrado`);
            const p = prod.rows[0];
            if (p.stock < item.cantidad) throw new Error(`Stock insuficiente para "${p.nombre}" (disponible: ${p.stock})`);

            const lineaSubtotal = p.precio * item.cantidad;
            subtotal += Number(lineaSubtotal);
            detalles.push({ producto_id: item.producto_id, cantidad: item.cantidad, precio_unitario: p.precio, subtotal: lineaSubtotal });

            await client.query('UPDATE productos SET stock = stock - $1 WHERE id = $2', [item.cantidad, item.producto_id]);
            await client.query(
                `INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, motivo) VALUES ($1,'salida',$2,'Venta en línea')`,
                [item.producto_id, item.cantidad]
            );
        }

        const impuestos = Math.round(subtotal * 0.16 * 100) / 100;
        const envio = subtotal >= 10000 ? 0 : 199;

        // ---- Club: canje de puntos como descuento ----
        let descuento = 0;
        if (puntos_canjear > 0) {
            const cli = await client.query('SELECT puntos FROM clientes WHERE id = $1 FOR UPDATE', [cliente_id]);
            const saldo = cli.rows[0].puntos;
            puntos_canjear = Math.min(puntos_canjear, saldo);
            puntos_canjear = puntos_canjear - (puntos_canjear % 100);          // solo múltiplos de 100
            descuento = Math.min(puntos_canjear * VALOR_PUNTO, subtotal);      // nunca deja el subtotal en negativo
            puntos_canjear = Math.round(descuento / VALOR_PUNTO);
        }

        const total = Math.round((subtotal + impuestos + envio - descuento) * 100) / 100;
        const numero_orden = 'ORD-' + Date.now();

        const pedido = await client.query(
            `INSERT INTO pedidos (numero_orden, cliente_id, subtotal, impuestos, envio, descuento, total, estado, metodo_pago, direccion_envio, notas)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'confirmado',$8,$9,$10) RETURNING *`,
            [numero_orden, cliente_id, subtotal, impuestos, envio, descuento, total, metodo_pago, direccion_envio, notas]
        );
        const pedidoId = pedido.rows[0].id;

        for (const d of detalles) {
            await client.query(
                `INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario, subtotal) VALUES ($1,$2,$3,$4,$5)`,
                [pedidoId, d.producto_id, d.cantidad, d.precio_unitario, d.subtotal]
            );
        }

        // ---- Club: aplicar canje y otorgar puntos por la compra ----
        const m = await client.query(
            'SELECT COALESCE(valor_total_compras,0) AS gasto, COALESCE(total_compras,0) AS compras FROM metricas_clientes WHERE cliente_id = $1',
            [cliente_id]
        );
        const { actual: nivel } = nivelRecompensas(m.rows[0]?.gasto || 0, m.rows[0]?.compras || 0);
        const puntos_ganados = Math.floor((subtotal / 20) * nivel.multiplicador);

        if (puntos_canjear > 0) {
            await client.query('UPDATE clientes SET puntos = puntos - $1 WHERE id = $2', [puntos_canjear, cliente_id]);
            await client.query(
                `INSERT INTO movimientos_puntos (cliente_id, tipo, puntos, motivo, pedido_id) VALUES ($1,'canjeado',$2,$3,$4)`,
                [cliente_id, -puntos_canjear, `Descuento en ${numero_orden}`, pedidoId]
            );
        }
        if (puntos_ganados > 0) {
            await client.query('UPDATE clientes SET puntos = puntos + $1 WHERE id = $2', [puntos_ganados, cliente_id]);
            await client.query(
                `INSERT INTO movimientos_puntos (cliente_id, tipo, puntos, motivo, pedido_id) VALUES ($1,'ganado',$2,$3,$4)`,
                [cliente_id, puntos_ganados, `Compra ${numero_orden} (nivel ${nivel.nombre})`, pedidoId]
            );
        }

        // ---- Métricas del cliente: el pedido nace 'confirmado' vía INSERT,
        //      así que el trigger AFTER UPDATE no corre. Se actualiza aquí
        //      para que suba el nivel del Club, el total gastado y el conteo
        //      de compras. (Se cuenta por 'total', igual que el trigger.)
        await client.query(
            `INSERT INTO metricas_clientes (cliente_id, total_compras, valor_total_compras, ticket_promedio)
             VALUES ($1, 1, $2, $2)
             ON CONFLICT (cliente_id) DO UPDATE SET
                 total_compras       = metricas_clientes.total_compras + 1,
                 valor_total_compras = metricas_clientes.valor_total_compras + $2,
                 ticket_promedio     = (metricas_clientes.valor_total_compras + $2)
                                       / (metricas_clientes.total_compras + 1)`,
            [cliente_id, total]
        );

        await client.query('DELETE FROM carrito_items WHERE cliente_id = $1', [cliente_id]);
        await client.query('COMMIT');

        // Etapa CRM: si es su primera compra pasa a Activo
        await pool.query(
            `UPDATE clientes SET etapa_crm = CASE WHEN etapa_crm = 'Prospecto' THEN 'Activo' ELSE etapa_crm END WHERE id = $1`,
            [cliente_id]
        );

        res.status(201).json({ ...pedido.rows[0], puntos_ganados, puntos_canjeados: puntos_canjear });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(400).json({ message: error.message });
    } finally {
        client.release();
    }
}));

app.get('/api/pedidos/cliente/:clienteId', requireCliente, asyncRoute(async (req, res) => {
    const result = await pool.query(
        `SELECT p.*, STRING_AGG(pr.nombre, ', ') AS productos
         FROM pedidos p LEFT JOIN pedido_items pi ON p.id = pi.pedido_id
         LEFT JOIN productos pr ON pi.producto_id = pr.id
         WHERE p.cliente_id = $1 GROUP BY p.id ORDER BY p.fecha_pedido DESC`,
        [req.cliente.id]
    );
    res.json(result.rows);
}));

app.get('/api/pedidos/:id/detalle', asyncRoute(async (req, res) => {
    const pedido = await pool.query('SELECT * FROM pedidos WHERE id = $1', [req.params.id]);
    if (pedido.rows.length === 0) return res.status(404).json({ message: 'Pedido no encontrado' });
    const items = await pool.query(
        `SELECT pi.*, p.nombre, p.imagen_url FROM pedido_items pi JOIN productos p ON pi.producto_id = p.id WHERE pi.pedido_id = $1`,
        [req.params.id]
    );
    res.json({ ...pedido.rows[0], items: items.rows });
}));

// =========================================================
// PERFIL DE CLIENTE (tienda) — cada quien solo ve/edita lo suyo
// =========================================================
app.use('/api/clientes/:id', requireCliente, mismoCliente);

app.get('/api/clientes/:id', asyncRoute(async (req, res) => {
    const result = await pool.query(
        `SELECT id, nombre, correo, telefono, empresa, direccion, ciudad, estado, codigo_postal,
                etapa_crm, preferencias, puntos, codigo_socio, fecha_registro
         FROM clientes WHERE id = $1`,
        [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Cliente no encontrado' });

    const cliente = result.rows[0];
    // Backfill: cuentas creadas antes de existir el código de socio.
    if (!cliente.codigo_socio) {
        for (let i = 0; i < 5; i++) {
            const cs = generarCodigoSocio();
            try {
                await pool.query('UPDATE clientes SET codigo_socio = $1 WHERE id = $2', [cs, cliente.id]);
                cliente.codigo_socio = cs;
                break;
            } catch (e) { /* choque de único: reintenta */ }
        }
    }
    res.json(cliente);
}));

// Estado del Club (puntos, nivel, progreso, historial)
app.get('/api/clientes/:id/recompensas', asyncRoute(async (req, res) => {
    const estado = await estadoRecompensas(req.params.id);
    if (!estado) return res.status(404).json({ message: 'Cliente no encontrado' });
    const mov = await pool.query(
        `SELECT tipo, puntos, motivo, fecha FROM movimientos_puntos
         WHERE cliente_id = $1 ORDER BY fecha DESC LIMIT 50`,
        [req.params.id]
    );
    res.json({ ...estado, movimientos: mov.rows });
}));

app.put('/api/clientes/:id', asyncRoute(async (req, res) => {
    const { nombre, telefono, empresa, direccion, ciudad, estado, codigo_postal } = req.body;
    const result = await pool.query(
        `UPDATE clientes SET
            nombre        = COALESCE($1, nombre),
            telefono      = COALESCE($2, telefono),
            empresa       = COALESCE($3, empresa),
            direccion     = COALESCE($4, direccion),
            ciudad        = COALESCE($5, ciudad),
            estado        = COALESCE($6, estado),
            codigo_postal = COALESCE($7, codigo_postal)
         WHERE id = $8
         RETURNING id, nombre, correo, telefono, empresa, direccion, ciudad, estado, codigo_postal, etapa_crm`,
        [nombre, telefono, empresa, direccion, ciudad, estado, codigo_postal, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Cliente no encontrado' });
    res.json({ message: 'Datos actualizados', cliente: result.rows[0] });
}));

// Cambiar contraseña (verifica la actual)
app.put('/api/clientes/:id/password', asyncRoute(async (req, res) => {
    const { actual, nueva } = req.body;
    if (!actual || !nueva) return res.status(400).json({ message: 'Contraseña actual y nueva son requeridas' });
    if (nueva.length < 6) return res.status(400).json({ message: 'La nueva contraseña debe tener al menos 6 caracteres' });

    const result = await pool.query('SELECT password FROM clientes WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Cliente no encontrado' });

    const valido = await bcrypt.compare(actual, result.rows[0].password).catch(() => false);
    if (!valido) return res.status(401).json({ message: 'La contraseña actual no es correcta' });

    const hash = await bcrypt.hash(nueva, 10);
    await pool.query('UPDATE clientes SET password = $1 WHERE id = $2', [hash, req.params.id]);
    res.json({ message: 'Contraseña actualizada' });
}));

// Preferencias de la cuenta (notificaciones, boletín, etc.)
app.put('/api/clientes/:id/preferencias', asyncRoute(async (req, res) => {
    const prefs = req.body && typeof req.body === 'object' ? req.body : {};
    const result = await pool.query(
        `UPDATE clientes SET preferencias = $1::jsonb WHERE id = $2 RETURNING preferencias`,
        [JSON.stringify(prefs), req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Cliente no encontrado' });
    res.json({ message: 'Preferencias guardadas', preferencias: result.rows[0].preferencias });
}));

// =========================================================
// TICKETS DE SOPORTE (cliente)
// =========================================================
app.get('/api/clientes/:id/tickets', asyncRoute(async (req, res) => {
    const r = await pool.query(
        `SELECT t.*, (SELECT COUNT(*) FROM ticket_mensajes m WHERE m.ticket_id = t.id) AS mensajes
         FROM tickets t WHERE t.cliente_id = $1 ORDER BY t.fecha_actualizacion DESC`,
        [req.params.id]
    );
    res.json(r.rows);
}));

app.post('/api/clientes/:id/tickets', asyncRoute(async (req, res) => {
    const { asunto, categoria, descripcion, prioridad, pedido_id } = req.body;
    if (!asunto || !descripcion) return res.status(400).json({ message: 'Asunto y descripción son requeridos' });

    const ins = await pool.query(
        `INSERT INTO tickets (folio, cliente_id, asunto, categoria, prioridad, pedido_id)
         VALUES ('TMP-' || substr(gen_random_uuid()::text, 1, 12), $1,$2,$3,$4,$5) RETURNING id`,
        [req.params.id, asunto.slice(0, 160), (categoria || 'general').slice(0, 40),
            ['baja', 'media', 'alta'].includes(prioridad) ? prioridad : 'media', pedido_id || null]
    );
    const t = await pool.query(
        "UPDATE tickets SET folio = 'TK-' || (1000 + id) WHERE id = $1 RETURNING *",
        [ins.rows[0].id]
    );
    const folio = t.rows[0].folio;
    await pool.query(
        `INSERT INTO ticket_mensajes (ticket_id, autor, mensaje) VALUES ($1, 'cliente', $2)`,
        [t.rows[0].id, descripcion]
    );
    // También queda como interacción CRM
    await pool.query(
        `INSERT INTO interacciones (cliente_id, tipo, descripcion) VALUES ($1, 'soporte', $2)`,
        [req.params.id, `Ticket ${folio}: ${asunto}`]
    );
    res.status(201).json({ message: 'Ticket creado', ticket: t.rows[0] });
}));

app.get('/api/clientes/:id/tickets/:ticketId', asyncRoute(async (req, res) => {
    const t = await pool.query('SELECT * FROM tickets WHERE id = $1 AND cliente_id = $2', [req.params.ticketId, req.params.id]);
    if (t.rows.length === 0) return res.status(404).json({ message: 'Ticket no encontrado' });
    const msgs = await pool.query(
        `SELECT m.*, u.nombre AS usuario_nombre FROM ticket_mensajes m
         LEFT JOIN usuarios u ON m.usuario_id = u.id
         WHERE m.ticket_id = $1 ORDER BY m.fecha ASC`,
        [req.params.ticketId]
    );
    res.json({ ...t.rows[0], mensajes: msgs.rows });
}));

app.post('/api/clientes/:id/tickets/:ticketId/mensajes', asyncRoute(async (req, res) => {
    const { mensaje } = req.body;
    if (!mensaje) return res.status(400).json({ message: 'El mensaje es requerido' });
    const t = await pool.query('SELECT id, estado FROM tickets WHERE id = $1 AND cliente_id = $2', [req.params.ticketId, req.params.id]);
    if (t.rows.length === 0) return res.status(404).json({ message: 'Ticket no encontrado' });

    await pool.query(
        `INSERT INTO ticket_mensajes (ticket_id, autor, mensaje) VALUES ($1, 'cliente', $2)`,
        [req.params.ticketId, mensaje]
    );
    // Si estaba resuelto/cerrado, se reabre
    if (['resuelto', 'cerrado'].includes(t.rows[0].estado)) {
        await pool.query("UPDATE tickets SET estado = 'abierto' WHERE id = $1", [req.params.ticketId]);
    } else {
        await pool.query("UPDATE tickets SET fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = $1", [req.params.ticketId]);
    }
    res.status(201).json({ message: 'Mensaje enviado' });
}));

// =========================================================
// RESEÑAS DE PRODUCTO (cliente)
// =========================================================
app.get('/api/clientes/:id/resenas', asyncRoute(async (req, res) => {
    const r = await pool.query(
        `SELECT re.*, p.nombre AS producto_nombre, p.imagen_url
         FROM resenas re JOIN productos p ON re.producto_id = p.id
         WHERE re.cliente_id = $1 ORDER BY re.fecha DESC`,
        [req.params.id]
    );
    res.json(r.rows);
}));

app.post('/api/clientes/:id/resenas', asyncRoute(async (req, res) => {
    const { producto_id, calificacion, comentario } = req.body;
    const cal = Math.round(Number(calificacion));
    if (!producto_id || !(cal >= 1 && cal <= 5)) {
        return res.status(400).json({ message: 'Producto y calificación (1 a 5) son requeridos' });
    }
    const r = await pool.query(
        `INSERT INTO resenas (cliente_id, producto_id, calificacion, comentario)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (cliente_id, producto_id)
         DO UPDATE SET calificacion = EXCLUDED.calificacion, comentario = EXCLUDED.comentario, fecha = CURRENT_TIMESTAMP
         RETURNING *`,
        [req.params.id, producto_id, cal, (comentario || '').slice(0, 800)]
    );
    res.status(201).json({ message: 'Reseña guardada', resena: r.rows[0] });
}));

app.delete('/api/clientes/:id/resenas/:productoId', asyncRoute(async (req, res) => {
    await pool.query('DELETE FROM resenas WHERE cliente_id = $1 AND producto_id = $2', [req.params.id, req.params.productoId]);
    res.json({ message: 'Reseña eliminada' });
}));

// =========================================================
// DIRECCIONES DEL CLIENTE
// =========================================================

app.get('/api/clientes/:id/direcciones', asyncRoute(async (req, res) => {
    const result = await pool.query(
        'SELECT * FROM direcciones WHERE cliente_id = $1 ORDER BY predeterminada DESC, id ASC',
        [req.params.id]
    );
    res.json(result.rows);
}));

app.post('/api/clientes/:id/direcciones', asyncRoute(async (req, res) => {
    const { alias, destinatario, calle, ciudad, estado, codigo_postal, telefono, referencias, predeterminada } = req.body;
    if (!calle) return res.status(400).json({ message: 'La calle y número son requeridos' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        if (predeterminada) {
            await client.query('UPDATE direcciones SET predeterminada = false WHERE cliente_id = $1', [req.params.id]);
        }
        const count = await client.query('SELECT COUNT(*)::int AS n FROM direcciones WHERE cliente_id = $1', [req.params.id]);
        const esPrimera = count.rows[0].n === 0;
        const result = await client.query(
            `INSERT INTO direcciones (cliente_id, alias, destinatario, calle, ciudad, estado, codigo_postal, telefono, referencias, predeterminada)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
            [req.params.id, alias || null, destinatario || null, calle, ciudad || null, estado || null,
                codigo_postal || null, telefono || null, referencias || null, predeterminada || esPrimera]
        );
        await client.query('COMMIT');
        res.status(201).json({ message: 'Dirección guardada', direccion: result.rows[0] });
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}));

app.put('/api/clientes/:id/direcciones/:dirId', asyncRoute(async (req, res) => {
    const { alias, destinatario, calle, ciudad, estado, codigo_postal, telefono, referencias, predeterminada } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        if (predeterminada) {
            await client.query('UPDATE direcciones SET predeterminada = false WHERE cliente_id = $1', [req.params.id]);
        }
        const result = await client.query(
            `UPDATE direcciones SET
                alias = COALESCE($1, alias), destinatario = COALESCE($2, destinatario),
                calle = COALESCE($3, calle), ciudad = COALESCE($4, ciudad),
                estado = COALESCE($5, estado), codigo_postal = COALESCE($6, codigo_postal),
                telefono = COALESCE($7, telefono), referencias = COALESCE($8, referencias),
                predeterminada = COALESCE($9, predeterminada)
             WHERE id = $10 AND cliente_id = $11 RETURNING *`,
            [alias, destinatario, calle, ciudad, estado, codigo_postal, telefono, referencias,
                predeterminada, req.params.dirId, req.params.id]
        );
        if (result.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Dirección no encontrada' }); }
        await client.query('COMMIT');
        res.json({ message: 'Dirección actualizada', direccion: result.rows[0] });
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}));

app.delete('/api/clientes/:id/direcciones/:dirId', asyncRoute(async (req, res) => {
    await pool.query('DELETE FROM direcciones WHERE id = $1 AND cliente_id = $2', [req.params.dirId, req.params.id]);
    res.json({ message: 'Dirección eliminada' });
}));

// =========================================================
// MÉTODOS DE PAGO DEL CLIENTE
//   Solo se guarda marca + últimos 4 + expiración. El número
//   completo y el CVV nunca tocan la base de datos.
// =========================================================
app.get('/api/clientes/:id/metodos-pago', asyncRoute(async (req, res) => {
    const result = await pool.query(
        'SELECT id, tipo, marca, ultimos4, titular, expira_mes, expira_anio, predeterminada, fecha FROM metodos_pago WHERE cliente_id = $1 ORDER BY predeterminada DESC, id ASC',
        [req.params.id]
    );
    res.json(result.rows);
}));

app.post('/api/clientes/:id/metodos-pago', asyncRoute(async (req, res) => {
    const { tipo = 'tarjeta', numero, titular, expira_mes, expira_anio, predeterminada } = req.body;
    let marca = null, ultimos4 = null, mes = null, anio = null;

    if (tipo === 'tarjeta') {
        const digits = String(numero || '').replace(/\D/g, '');
        if (digits.length < 13 || digits.length > 19) {
            return res.status(400).json({ message: 'El número de tarjeta no es válido' });
        }
        if (!titular) return res.status(400).json({ message: 'Falta el nombre del titular' });
        mes = Number(expira_mes); anio = Number(expira_anio);
        if (!(mes >= 1 && mes <= 12) || !(anio >= 2024 && anio <= 2100)) {
            return res.status(400).json({ message: 'La fecha de expiración no es válida' });
        }
        marca = marcaTarjeta(digits);
        ultimos4 = digits.slice(-4);
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const count = await client.query('SELECT COUNT(*)::int AS n FROM metodos_pago WHERE cliente_id = $1', [req.params.id]);
        const esPrimero = count.rows[0].n === 0;
        if (predeterminada || esPrimero) {
            await client.query('UPDATE metodos_pago SET predeterminada = false WHERE cliente_id = $1', [req.params.id]);
        }
        const result = await client.query(
            `INSERT INTO metodos_pago (cliente_id, tipo, marca, ultimos4, titular, expira_mes, expira_anio, predeterminada)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
            [req.params.id, tipo, marca, ultimos4, titular || null, mes, anio, predeterminada || esPrimero]
        );
        await client.query('COMMIT');
        res.status(201).json({ message: 'Método de pago guardado', metodo: result.rows[0] });
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}));

app.put('/api/clientes/:id/metodos-pago/:mpId', asyncRoute(async (req, res) => {
    const { titular, predeterminada } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        if (predeterminada) {
            await client.query('UPDATE metodos_pago SET predeterminada = false WHERE cliente_id = $1', [req.params.id]);
        }
        const result = await client.query(
            `UPDATE metodos_pago SET titular = COALESCE($1, titular), predeterminada = COALESCE($2, predeterminada)
             WHERE id = $3 AND cliente_id = $4 RETURNING *`,
            [titular ?? null, predeterminada ?? null, req.params.mpId, req.params.id]
        );
        if (result.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Método de pago no encontrado' }); }
        await client.query('COMMIT');
        res.json({ message: 'Método de pago actualizado', metodo: result.rows[0] });
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}));

app.delete('/api/clientes/:id/metodos-pago/:mpId', asyncRoute(async (req, res) => {
    await pool.query('DELETE FROM metodos_pago WHERE id = $1 AND cliente_id = $2', [req.params.mpId, req.params.id]);
    res.json({ message: 'Método de pago eliminado' });
}));

// =========================================================
// VERIFICACIÓN DE SOCIO (público) — lo usa el QR de la
// tarjeta virtual para que en tienda física puedan validar
// al socio y ver su nivel y puntos. No expone datos sensibles.
// =========================================================
app.get('/api/socio/:codigo', asyncRoute(async (req, res) => {
    const c = await pool.query(
        `SELECT id, nombre, etapa_crm, fecha_registro FROM clientes
         WHERE codigo_socio = $1 AND estado_cliente = 'activo'`,
        [req.params.codigo]
    );
    if (c.rows.length === 0) return res.status(404).json({ message: 'Socio no encontrado' });
    const rec = await estadoRecompensas(c.rows[0].id);
    res.json({
        codigo: req.params.codigo,
        nombre: c.rows[0].nombre,
        miembro_desde: c.rows[0].fecha_registro,
        nivel: rec.nivel,
        puntos: rec.puntos,
        valor_en_dinero: rec.valor_en_dinero,
    });
}));

// =========================================================
// FAVORITOS DEL CLIENTE
// =========================================================

app.get('/api/clientes/:id/favoritos', asyncRoute(async (req, res) => {
    const result = await pool.query(
        `SELECT f.id AS favorito_id, f.fecha AS fecha_agregado,
                p.*, c.nombre AS categoria_nombre
         FROM favoritos f
         JOIN productos p ON f.producto_id = p.id
         LEFT JOIN categorias c ON p.categoria_id = c.id
         WHERE f.cliente_id = $1 ORDER BY f.fecha DESC`,
        [req.params.id]
    );
    res.json(result.rows);
}));

app.post('/api/clientes/:id/favoritos', asyncRoute(async (req, res) => {
    const { producto_id } = req.body;
    if (!producto_id) return res.status(400).json({ message: 'producto_id es requerido' });
    await pool.query(
        `INSERT INTO favoritos (cliente_id, producto_id) VALUES ($1, $2)
         ON CONFLICT (cliente_id, producto_id) DO NOTHING`,
        [req.params.id, producto_id]
    );
    res.status(201).json({ message: 'Agregado a favoritos' });
}));

app.delete('/api/clientes/:id/favoritos/:productoId', asyncRoute(async (req, res) => {
    await pool.query('DELETE FROM favoritos WHERE cliente_id = $1 AND producto_id = $2', [req.params.id, req.params.productoId]);
    res.json({ message: 'Quitado de favoritos' });
}));

// Cancelar un pedido propio (solo si aún no se procesó) y devolver stock
app.put('/api/pedidos/:id/cancelar', requireCliente, asyncRoute(async (req, res) => {
    const cliente_id = req.cliente.id;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const pedidoRes = await client.query('SELECT * FROM pedidos WHERE id = $1 FOR UPDATE', [req.params.id]);
        if (pedidoRes.rows.length === 0) throw new Error('Pedido no encontrado');
        const pedido = pedidoRes.rows[0];

        if (Number(pedido.cliente_id) !== Number(cliente_id)) {
            throw new Error('No puedes cancelar este pedido');
        }
        if (!['pendiente', 'confirmado'].includes(pedido.estado)) {
            throw new Error('Este pedido ya está en preparación y no se puede cancelar en línea');
        }

        const items = await client.query('SELECT producto_id, cantidad FROM pedido_items WHERE pedido_id = $1', [req.params.id]);
        for (const it of items.rows) {
            await client.query('UPDATE productos SET stock = stock + $1 WHERE id = $2', [it.cantidad, it.producto_id]);
            await client.query(
                `INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, motivo) VALUES ($1,'entrada',$2,'Cancelación de pedido')`,
                [it.producto_id, it.cantidad]
            );
        }
        await client.query(`UPDATE pedidos SET estado = 'cancelado' WHERE id = $1`, [req.params.id]);
        await client.query('COMMIT');
        res.json({ message: 'Pedido cancelado y stock restaurado' });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(400).json({ message: error.message });
    } finally {
        client.release();
    }
}));

// =========================================================
// A PARTIR DE AQUÍ TODO /api/admin REQUIERE SESIÓN INTERNA
// =========================================================
app.use('/api/admin', requireUsuario);

// Identidad del usuario interno autenticado (para que el panel valide
// la sesión contra el servidor y no confíe solo en localStorage).
app.get('/api/admin/whoami', (req, res) => res.json(req.usuario));

// =========================================================
// ADMIN: CLIENTES / CRM
// =========================================================

app.get('/api/admin/clientes', asyncRoute(async (req, res) => {
    const { busqueda, etapa } = req.query;
    const cond = [];
    const values = [];
    let i = 1;
    if (busqueda) { cond.push(`(nombre ILIKE $${i} OR correo ILIKE $${i} OR empresa ILIKE $${i})`); values.push(`%${busqueda}%`); i++; }
    if (etapa && etapa !== 'Todas') { cond.push(`etapa_crm = $${i++}`); values.push(etapa); }
    const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';

    const result = await pool.query(
        `SELECT id, nombre, correo, telefono, empresa, ciudad, estado_cliente, etapa_crm, fecha_registro
         FROM clientes ${where} ORDER BY id ASC`,
        values
    );
    res.json(result.rows);
}));

app.get('/api/admin/clientes/:id', asyncRoute(async (req, res) => {
    const cliente = await pool.query(
        `SELECT id, nombre, correo, telefono, empresa, direccion, ciudad, estado, codigo_postal,
                estado_cliente, etapa_crm, puntos, codigo_socio, fecha_registro, ultimo_login
         FROM clientes WHERE id = $1`, [req.params.id]);
    if (cliente.rows.length === 0) return res.status(404).json({ message: 'Cliente no encontrado' });
    const metricas = await pool.query('SELECT * FROM metricas_clientes WHERE cliente_id = $1', [req.params.id]);
    const extra = await pool.query(`
        SELECT (SELECT COUNT(*) FROM pedidos      WHERE cliente_id = $1 AND estado <> 'cancelado') AS pedidos,
               (SELECT COUNT(*) FROM resenas      WHERE cliente_id = $1)                          AS resenas,
               (SELECT COUNT(*) FROM tickets      WHERE cliente_id = $1)                          AS tickets,
               (SELECT COUNT(*) FROM tickets      WHERE cliente_id = $1 AND estado IN ('abierto','en_proceso')) AS tickets_abiertos
    `, [req.params.id]);
    const nivel = nivelRecompensas(metricas.rows[0]?.valor_total_compras || 0, metricas.rows[0]?.total_compras || 0).actual;
    res.json({ ...cliente.rows[0], metricas: metricas.rows[0] || null, resumen: extra.rows[0], nivel });
}));

// Editar datos básicos de un cliente desde el CRM
app.put('/api/admin/clientes/:id', asyncRoute(async (req, res) => {
    const { nombre, telefono, empresa, ciudad, estado, estado_cliente } = req.body;
    const r = await pool.query(
        `UPDATE clientes SET
            nombre = COALESCE($1, nombre), telefono = COALESCE($2, telefono),
            empresa = COALESCE($3, empresa), ciudad = COALESCE($4, ciudad),
            estado = COALESCE($5, estado),
            estado_cliente = COALESCE($6, estado_cliente)
         WHERE id = $7 RETURNING id, nombre, correo, telefono, empresa, ciudad, estado, estado_cliente, etapa_crm`,
        [nombre, telefono, empresa, ciudad, estado,
            ['activo', 'inactivo'].includes(estado_cliente) ? estado_cliente : null, req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: 'Cliente no encontrado' });
    res.json({ message: 'Cliente actualizado', cliente: r.rows[0] });
}));

// Evaluaciones (reseñas) de un cliente
app.get('/api/admin/clientes/:id/resenas', asyncRoute(async (req, res) => {
    const r = await pool.query(
        `SELECT re.*, p.nombre AS producto_nombre FROM resenas re
         JOIN productos p ON re.producto_id = p.id
         WHERE re.cliente_id = $1 ORDER BY re.fecha DESC`,
        [req.params.id]
    );
    res.json(r.rows);
}));

// Movimientos de puntos de un cliente (Club)
app.get('/api/admin/clientes/:id/puntos', asyncRoute(async (req, res) => {
    const mov = await pool.query(
        'SELECT tipo, puntos, motivo, fecha FROM movimientos_puntos WHERE cliente_id = $1 ORDER BY fecha DESC LIMIT 50',
        [req.params.id]
    );
    const c = await pool.query('SELECT puntos FROM clientes WHERE id = $1', [req.params.id]);
    res.json({ saldo: c.rows[0]?.puntos ?? 0, movimientos: mov.rows });
}));

app.put('/api/admin/clientes/:id/etapa', asyncRoute(async (req, res) => {
    const { etapa_crm } = req.body;
    const validas = ['Prospecto', 'Activo', 'Frecuente', 'Inactivo'];
    if (!validas.includes(etapa_crm)) return res.status(400).json({ message: 'Etapa no válida' });
    const result = await pool.query('UPDATE clientes SET etapa_crm = $1 WHERE id = $2 RETURNING id, nombre, etapa_crm', [etapa_crm, req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Cliente no encontrado' });
    res.json({ message: 'Etapa actualizada', cliente: result.rows[0] });
}));

// Historial de interacciones de un cliente
app.get('/api/admin/clientes/:id/interacciones', asyncRoute(async (req, res) => {
    const result = await pool.query(
        `SELECT i.*, u.nombre AS usuario_nombre FROM interacciones i
         LEFT JOIN usuarios u ON i.usuario_id = u.id
         WHERE i.cliente_id = $1 ORDER BY i.fecha DESC`,
        [req.params.id]
    );
    res.json(result.rows);
}));

app.post('/api/admin/clientes/:id/interacciones', asyncRoute(async (req, res) => {
    const { tipo, descripcion, usuario_id } = req.body;
    if (!tipo || !descripcion) return res.status(400).json({ message: 'Tipo y descripción son requeridos' });
    const result = await pool.query(
        `INSERT INTO interacciones (cliente_id, usuario_id, tipo, descripcion) VALUES ($1,$2,$3,$4) RETURNING *`,
        [req.params.id, usuario_id || null, tipo, descripcion]
    );
    res.status(201).json(result.rows[0]);
}));

// =========================================================
// ADMIN: INTERACCIONES (vista global)
// =========================================================
app.get('/api/admin/interacciones', asyncRoute(async (req, res) => {
    const { tipo, cliente_id, desde, hasta, busqueda } = req.query;
    const cond = [];
    const values = [];
    let i = 1;
    if (tipo && tipo !== 'Todos') { cond.push(`i.tipo = $${i++}`); values.push(tipo); }
    if (cliente_id) { cond.push(`i.cliente_id = $${i++}`); values.push(cliente_id); }
    if (desde) { cond.push(`i.fecha >= $${i++}`); values.push(desde); }
    if (hasta) { cond.push(`i.fecha < ($${i++}::date + 1)`); values.push(hasta); }
    if (busqueda) { cond.push(`(i.descripcion ILIKE $${i} OR c.nombre ILIKE $${i})`); values.push(`%${busqueda}%`); i++; }
    const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
    const rows = await pool.query(
        `SELECT i.id, i.tipo, i.descripcion, i.fecha, i.cliente_id,
                c.nombre AS cliente_nombre, u.nombre AS usuario_nombre
         FROM interacciones i
         JOIN clientes c ON i.cliente_id = c.id
         LEFT JOIN usuarios u ON i.usuario_id = u.id
         ${where} ORDER BY i.fecha DESC LIMIT 300`,
        values
    );
    res.json(rows.rows);
}));

// Crear interacción eligiendo el cliente (flujo "Nueva interacción" global)
app.post('/api/admin/interacciones', asyncRoute(async (req, res) => {
    const { cliente_id, tipo, descripcion } = req.body;
    const tipos = ['llamada', 'correo', 'reunion', 'chat', 'soporte'];
    if (!cliente_id || !tipos.includes(tipo) || !descripcion) {
        return res.status(400).json({ message: 'Cliente, tipo válido y descripción son requeridos' });
    }
    const r = await pool.query(
        `INSERT INTO interacciones (cliente_id, usuario_id, tipo, descripcion) VALUES ($1,$2,$3,$4) RETURNING *`,
        [cliente_id, req.usuario.id, tipo, descripcion]
    );
    res.status(201).json({ message: 'Interacción registrada', interaccion: r.rows[0] });
}));

// =========================================================
// ADMIN: EVALUACIONES (todas las reseñas)
// =========================================================
app.get('/api/admin/resenas', asyncRoute(async (req, res) => {
    const { min } = req.query;
    const cond = [];
    const values = [];
    if (min) { cond.push(`re.calificacion >= $1`); values.push(min); }
    const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
    const rows = await pool.query(
        `SELECT re.id, re.calificacion, re.comentario, re.fecha,
                c.id AS cliente_id, c.nombre AS cliente_nombre,
                p.id AS producto_id, p.nombre AS producto_nombre
         FROM resenas re
         JOIN clientes c ON re.cliente_id = c.id
         JOIN productos p ON re.producto_id = p.id
         ${where} ORDER BY re.fecha DESC LIMIT 200`,
        values
    );
    const stats = await pool.query('SELECT ROUND(AVG(calificacion),2) AS promedio, COUNT(*)::int AS total FROM resenas');
    res.json({ promedio: Number(stats.rows[0].promedio) || 0, total: stats.rows[0].total, resenas: rows.rows });
}));

// =========================================================
// ADMIN: TICKETS DE SOPORTE
// =========================================================
app.get('/api/admin/tickets', asyncRoute(async (req, res) => {
    const { estado, prioridad } = req.query;
    const cond = [];
    const values = [];
    let i = 1;
    if (estado && estado !== 'Todos') { cond.push(`t.estado = $${i++}`); values.push(estado); }
    if (prioridad && prioridad !== 'Todas') { cond.push(`t.prioridad = $${i++}`); values.push(prioridad); }
    const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
    const rows = await pool.query(
        `SELECT t.*, c.nombre AS cliente_nombre, c.correo AS cliente_correo,
                (SELECT COUNT(*) FROM ticket_mensajes m WHERE m.ticket_id = t.id) AS mensajes,
                u.nombre AS asignado_nombre
         FROM tickets t
         JOIN clientes c ON t.cliente_id = c.id
         LEFT JOIN usuarios u ON t.asignado_a = u.id
         ${where}
         ORDER BY CASE t.estado WHEN 'abierto' THEN 0 WHEN 'en_proceso' THEN 1 ELSE 2 END,
                  CASE t.prioridad WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END,
                  t.fecha_actualizacion DESC`,
        values
    );
    const counts = await pool.query(`
        SELECT COUNT(*) FILTER (WHERE estado = 'abierto')    AS abiertos,
               COUNT(*) FILTER (WHERE estado = 'en_proceso') AS en_proceso,
               COUNT(*) FILTER (WHERE estado = 'resuelto')   AS resueltos,
               COUNT(*) FILTER (WHERE estado = 'cerrado')    AS cerrados
        FROM tickets`);
    res.json({ conteos: counts.rows[0], tickets: rows.rows });
}));

app.get('/api/admin/tickets/:id', asyncRoute(async (req, res) => {
    const t = await pool.query(
        `SELECT t.*, c.nombre AS cliente_nombre, c.correo AS cliente_correo, c.telefono AS cliente_telefono
         FROM tickets t JOIN clientes c ON t.cliente_id = c.id WHERE t.id = $1`,
        [req.params.id]
    );
    if (t.rows.length === 0) return res.status(404).json({ message: 'Ticket no encontrado' });
    const msgs = await pool.query(
        `SELECT m.*, u.nombre AS usuario_nombre FROM ticket_mensajes m
         LEFT JOIN usuarios u ON m.usuario_id = u.id
         WHERE m.ticket_id = $1 ORDER BY m.fecha ASC`,
        [req.params.id]
    );
    res.json({ ...t.rows[0], mensajes: msgs.rows });
}));

app.post('/api/admin/tickets/:id/mensajes', asyncRoute(async (req, res) => {
    const { mensaje } = req.body;
    if (!mensaje) return res.status(400).json({ message: 'El mensaje es requerido' });
    const t = await pool.query('SELECT id FROM tickets WHERE id = $1', [req.params.id]);
    if (t.rows.length === 0) return res.status(404).json({ message: 'Ticket no encontrado' });
    await pool.query(
        `INSERT INTO ticket_mensajes (ticket_id, autor, usuario_id, mensaje) VALUES ($1, 'equipo', $2, $3)`,
        [req.params.id, req.usuario.id, mensaje]
    );
    await pool.query(
        "UPDATE tickets SET fecha_actualizacion = CURRENT_TIMESTAMP, estado = CASE WHEN estado = 'abierto' THEN 'en_proceso' ELSE estado END WHERE id = $1",
        [req.params.id]
    );
    res.status(201).json({ message: 'Respuesta enviada' });
}));

app.put('/api/admin/tickets/:id', asyncRoute(async (req, res) => {
    const { estado, prioridad, asignado_a } = req.body;
    const est = ['abierto', 'en_proceso', 'resuelto', 'cerrado'];
    const pri = ['baja', 'media', 'alta'];
    const r = await pool.query(
        `UPDATE tickets SET
            estado    = COALESCE($1, estado),
            prioridad = COALESCE($2, prioridad),
            asignado_a = COALESCE($3, asignado_a)
         WHERE id = $4 RETURNING *`,
        [est.includes(estado) ? estado : null, pri.includes(prioridad) ? prioridad : null,
            asignado_a || null, req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: 'Ticket no encontrado' });
    res.json({ message: 'Ticket actualizado', ticket: r.rows[0] });
}));

// =========================================================
// ADMIN: REPORTES (métricas con rango de fechas)
// =========================================================
app.get('/api/admin/reportes', asyncRoute(async (req, res) => {
    const desde = req.query.desde || null;
    const hasta = req.query.hasta || null;
    const rango = (col) => {
        const parts = [];
        const vals = [];
        let n = 1;
        if (desde) { parts.push(`${col} >= $${n++}`); vals.push(desde); }
        if (hasta) { parts.push(`${col} < ($${n++}::date + 1)`); vals.push(hasta); }
        return { where: parts.length ? 'WHERE ' + parts.join(' AND ') : '', vals };
    };

    const cli = await pool.query(`
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE estado_cliente = 'activo')   AS activos,
               COUNT(*) FILTER (WHERE estado_cliente = 'inactivo') AS inactivos
        FROM clientes`);

    const ri = rango('fecha');
    const interTipo = await pool.query(
        `SELECT tipo, COUNT(*) AS total FROM interacciones ${ri.where} GROUP BY tipo ORDER BY total DESC`, ri.vals);
    const interTotal = await pool.query(
        `SELECT COUNT(*) AS total FROM interacciones ${ri.where}`, ri.vals);

    const porEtapa = await pool.query('SELECT etapa_crm, COUNT(*) AS total FROM clientes GROUP BY etapa_crm');

    const rp = rango('fecha_pedido');
    const ventas = await pool.query(
        `SELECT COUNT(*) AS pedidos, COALESCE(SUM(total),0) AS ingresos
         FROM pedidos ${rp.where ? rp.where + " AND estado <> 'cancelado'" : "WHERE estado <> 'cancelado'"}`,
        rp.vals);

    const rc = rango('fecha_registro');
    const nuevos = await pool.query(`SELECT COUNT(*) AS total FROM clientes ${rc.where}`, rc.vals);

    const sinInteraccion = await pool.query(`
        SELECT COUNT(*) AS total FROM clientes c
        LEFT JOIN metricas_clientes m ON c.id = m.cliente_id
        WHERE COALESCE(m.ultima_interaccion, c.fecha_registro) < CURRENT_TIMESTAMP - INTERVAL '30 days'`);

    res.json({
        rango: { desde, hasta },
        clientes: {
            total: Number(cli.rows[0].total),
            activos: Number(cli.rows[0].activos),
            inactivos: Number(cli.rows[0].inactivos),
            nuevos_periodo: Number(nuevos.rows[0].total),
            sin_interaccion: Number(sinInteraccion.rows[0].total),
        },
        interacciones: {
            total_periodo: Number(interTotal.rows[0].total),
            por_tipo: interTipo.rows,
        },
        clientes_por_etapa: porEtapa.rows,
        ventas: {
            pedidos: Number(ventas.rows[0].pedidos),
            ingresos: Number(ventas.rows[0].ingresos),
        },
    });
}));

// =========================================================
// ADMIN: DASHBOARD / MÉTRICAS CRM
// =========================================================

app.get('/api/admin/dashboard', asyncRoute(async (req, res) => {
    const totales = await pool.query(`
        SELECT
            COUNT(*) AS total_clientes,
            COUNT(*) FILTER (WHERE estado_cliente = 'activo') AS activos,
            COUNT(*) FILTER (WHERE estado_cliente = 'inactivo') AS inactivos
        FROM clientes
    `);

    const interaccionesMes = await pool.query(`
        SELECT COUNT(*) AS total FROM interacciones
        WHERE fecha >= DATE_TRUNC('month', CURRENT_DATE)
    `);

    const sinInteraccion = await pool.query(`
        SELECT c.id, c.nombre, c.correo,
               COALESCE(m.ultima_interaccion, c.fecha_registro) AS ultima_referencia,
               COALESCE(EXTRACT(DAY FROM (CURRENT_TIMESTAMP - COALESCE(m.ultima_interaccion, c.fecha_registro)))::int, 9999) AS dias_sin_contacto
        FROM clientes c
        LEFT JOIN metricas_clientes m ON c.id = m.cliente_id
        WHERE COALESCE(m.ultima_interaccion, c.fecha_registro) < CURRENT_TIMESTAMP - INTERVAL '30 days'
        ORDER BY dias_sin_contacto DESC
        LIMIT 10
    `);

    const porEtapa = await pool.query(`
        SELECT etapa_crm, COUNT(*) AS total FROM clientes GROUP BY etapa_crm
    `);

    const porTipoInteraccion = await pool.query(`
        SELECT tipo, COUNT(*) AS total FROM interacciones GROUP BY tipo
    `);

    const tickets = await pool.query(`
        SELECT
            COUNT(*) FILTER (WHERE estado IN ('abierto', 'en_proceso')) AS activos,
            COUNT(*) FILTER (WHERE estado = 'abierto') AS abiertos
        FROM tickets
    `);

    res.json({
        total_clientes: Number(totales.rows[0].total_clientes),
        activos: Number(totales.rows[0].activos),
        inactivos: Number(totales.rows[0].inactivos),
        interacciones_mes: Number(interaccionesMes.rows[0].total),
        tickets_activos: Number(tickets.rows[0].activos),
        tickets_abiertos: Number(tickets.rows[0].abiertos),
        clientes_sin_interaccion: sinInteraccion.rows,
        clientes_por_etapa: porEtapa.rows,
        interacciones_por_tipo: porTipoInteraccion.rows
    });
}));

app.get('/api/admin/metricas-productos', asyncRoute(async (req, res) => {
    const masVendidos = await pool.query(`
        SELECT p.id, p.nombre, p.marca, p.stock, p.precio,
               COALESCE(SUM(pi.cantidad) FILTER (WHERE pe.estado <> 'cancelado'), 0) AS unidades_vendidas
        FROM productos p
        LEFT JOIN pedido_items pi ON pi.producto_id = p.id
        LEFT JOIN pedidos pe ON pi.pedido_id = pe.id
        GROUP BY p.id ORDER BY unidades_vendidas DESC LIMIT 10
    `);
    const inventarioCritico = await pool.query(`
        SELECT id, nombre, marca, stock, stock_minimo
        FROM productos WHERE stock <= stock_minimo AND activo = true ORDER BY stock ASC
    `);
    const stats = await pool.query(`
        SELECT COUNT(*) AS total_productos, COALESCE(SUM(stock),0) AS stock_total,
               COUNT(*) FILTER (WHERE stock = 0) AS agotados,
               COUNT(*) FILTER (WHERE stock > 0 AND stock <= stock_minimo) AS criticos
        FROM productos WHERE activo = true
    `);
    res.json({ mas_vendidos: masVendidos.rows, inventario_critico: inventarioCritico.rows, stats: stats.rows[0] });
}));

// =========================================================
// ADMIN: ANALÍTICA DEL CHATBOT
// Qué está buscando la gente, con qué presupuesto y cuántas
// consultas se quedaron SIN recomendación (oportunidad de
// inventario / restock).
// =========================================================
app.get('/api/admin/chatbot-consultas', asyncRoute(async (req, res) => {
    const totales = await pool.query(`
        SELECT
            COUNT(*)                                                   AS total,
            COUNT(*) FILTER (WHERE productos_sugeridos IS NULL
                             OR cardinality(productos_sugeridos) = 0)  AS sin_resultado,
            COUNT(*) FILTER (WHERE fecha >= DATE_TRUNC('month', CURRENT_DATE)) AS este_mes,
            ROUND(AVG(presupuesto))                                    AS presupuesto_promedio
        FROM chatbot_consultas
    `);

    const porUso = await pool.query(`
        SELECT COALESCE(uso, '(sin especificar)') AS uso, COUNT(*) AS total
        FROM chatbot_consultas GROUP BY uso ORDER BY total DESC
    `);

    const rangos = await pool.query(`
        SELECT CASE
            WHEN presupuesto IS NULL      THEN '(sin presupuesto)'
            WHEN presupuesto < 10000      THEN 'Menos de $10,000'
            WHEN presupuesto < 20000      THEN '$10,000 - $20,000'
            WHEN presupuesto < 35000      THEN '$20,000 - $35,000'
            ELSE 'Más de $35,000'
        END AS rango, COUNT(*) AS total
        FROM chatbot_consultas GROUP BY rango ORDER BY total DESC
    `);

    const recientes = await pool.query(`
        SELECT ch.id, ch.fecha, ch.uso, ch.presupuesto, ch.categoria, ch.mensaje,
               COALESCE(cardinality(ch.productos_sugeridos), 0) AS num_sugerencias,
               c.nombre AS cliente_nombre
        FROM chatbot_consultas ch
        LEFT JOIN clientes c ON ch.cliente_id = c.id
        ORDER BY ch.fecha DESC LIMIT 60
    `);

    res.json({
        total: Number(totales.rows[0].total),
        sin_resultado: Number(totales.rows[0].sin_resultado),
        este_mes: Number(totales.rows[0].este_mes),
        presupuesto_promedio: Number(totales.rows[0].presupuesto_promedio || 0),
        por_uso: porUso.rows,
        por_rango_presupuesto: rangos.rows,
        recientes: recientes.rows,
    });
}));

// =========================================================
// ADMIN: PRODUCTOS / INVENTARIO
// =========================================================

app.get('/api/admin/productos', asyncRoute(async (req, res) => {
    const result = await pool.query(`
        SELECT p.*, c.nombre AS categoria_nombre FROM productos p
        LEFT JOIN categorias c ON p.categoria_id = c.id ORDER BY p.id ASC
    `);
    res.json(result.rows);
}));

app.post('/api/admin/productos', asyncRoute(async (req, res) => {
    const {
        nombre, descripcion, categoria_id, marca, precio, stock, stock_minimo,
        procesador, ram_gb, almacenamiento, tarjeta_grafica, pantalla,
        uso_recomendado, imagen_url, proveedor_id, vendedor_id, activo, restock
    } = req.body;

    if (!nombre || precio === undefined || precio < 0) {
        return res.status(400).json({ message: 'Nombre y precio válido son requeridos' });
    }

    const result = await pool.query(
        `INSERT INTO productos
         (nombre, descripcion, categoria_id, marca, precio, stock, stock_minimo,
          procesador, ram_gb, almacenamiento, tarjeta_grafica, pantalla,
          uso_recomendado, imagen_url, proveedor_id, vendedor_id, activo, restock)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         RETURNING *`,
        [nombre, descripcion || '', categoria_id || null, marca || '', precio, stock || 0, stock_minimo || 5,
            procesador || null, ram_gb || null, almacenamiento || null, tarjeta_grafica || null, pantalla || null,
            uso_recomendado || [], imagen_url || '', proveedor_id || null, vendedor_id || null,
            activo !== undefined ? activo : true, restock || 'push']
    );
    res.status(201).json({ message: 'Producto creado', producto: result.rows[0] });
}));

app.put('/api/admin/productos/:id', asyncRoute(async (req, res) => {
    const {
        nombre, descripcion, categoria_id, marca, precio, stock, stock_minimo,
        procesador, ram_gb, almacenamiento, tarjeta_grafica, pantalla,
        uso_recomendado, imagen_url, proveedor_id, activo, restock
    } = req.body;

    const result = await pool.query(
        `UPDATE productos SET
            nombre = COALESCE($1, nombre), descripcion = COALESCE($2, descripcion),
            categoria_id = COALESCE($3, categoria_id), marca = COALESCE($4, marca),
            precio = COALESCE($5, precio), stock = COALESCE($6, stock),
            stock_minimo = COALESCE($7, stock_minimo), procesador = COALESCE($8, procesador),
            ram_gb = COALESCE($9, ram_gb), almacenamiento = COALESCE($10, almacenamiento),
            tarjeta_grafica = COALESCE($11, tarjeta_grafica), pantalla = COALESCE($12, pantalla),
            uso_recomendado = COALESCE($13, uso_recomendado), imagen_url = COALESCE($14, imagen_url),
            proveedor_id = COALESCE($15, proveedor_id), activo = COALESCE($16, activo),
            restock = COALESCE($17, restock)
         WHERE id = $18 RETURNING *`,
        [nombre, descripcion, categoria_id, marca, precio, stock, stock_minimo, procesador, ram_gb,
            almacenamiento, tarjeta_grafica, pantalla, uso_recomendado, imagen_url, proveedor_id, activo, restock, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Producto no encontrado' });
    res.json({ message: 'Producto actualizado', producto: result.rows[0] });
}));

app.delete('/api/admin/productos/:id', asyncRoute(async (req, res) => {
    const enUso = await pool.query('SELECT id FROM pedido_items WHERE producto_id = $1 LIMIT 1', [req.params.id]);
    if (enUso.rows.length > 0) {
        await pool.query('UPDATE productos SET activo = false WHERE id = $1', [req.params.id]);
        return res.json({ message: 'El producto tiene ventas asociadas; se desactivó en lugar de eliminarlo' });
    }
    await pool.query('DELETE FROM productos WHERE id = $1', [req.params.id]);
    res.json({ message: 'Producto eliminado' });
}));

// Restock manual desde el admin
app.post('/api/admin/productos/:id/restock', asyncRoute(async (req, res) => {
    const { cantidad, motivo } = req.body;
    if (!cantidad || cantidad < 1) return res.status(400).json({ message: 'Cantidad inválida' });

    const prod = await pool.query('SELECT * FROM productos WHERE id = $1', [req.params.id]);
    if (prod.rows.length === 0) return res.status(404).json({ message: 'Producto no encontrado' });

    const nuevoStock = prod.rows[0].stock + Number(cantidad);
    await pool.query('UPDATE productos SET stock = $1 WHERE id = $2', [nuevoStock, req.params.id]);
    await pool.query(
        `INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, motivo) VALUES ($1,'entrada',$2,$3)`,
        [req.params.id, cantidad, motivo || 'Restock manual desde admin']
    );
    res.json({ message: 'Restock aplicado', stock_nuevo: nuevoStock });
}));

app.get('/api/admin/movimientos-inventario', asyncRoute(async (req, res) => {
    const result = await pool.query(`
        SELECT m.*, p.nombre AS producto_nombre FROM movimientos_inventario m
        LEFT JOIN productos p ON m.producto_id = p.id
        ORDER BY m.fecha DESC LIMIT 200
    `);
    res.json(result.rows);
}));

app.get('/api/proveedores', asyncRoute(async (req, res) => {
    const result = await pool.query('SELECT * FROM proveedores WHERE activo = true ORDER BY nombre ASC');
    res.json(result.rows);
}));

// =========================================================
// ADMIN: PEDIDOS
// =========================================================

app.get('/api/admin/pedidos', asyncRoute(async (req, res) => {
    const { estado } = req.query;
    const cond = estado && estado !== 'Todos' ? 'WHERE p.estado = $1' : '';
    const values = estado && estado !== 'Todos' ? [estado] : [];
    const result = await pool.query(`
        SELECT p.*, c.nombre AS cliente_nombre, c.correo AS cliente_correo
        FROM pedidos p JOIN clientes c ON p.cliente_id = c.id
        ${cond} ORDER BY p.fecha_pedido DESC
    `, values);
    res.json(result.rows);
}));

app.put('/api/admin/pedidos/:id/estado', asyncRoute(async (req, res) => {
    const { estado } = req.body;
    const validos = ['pendiente', 'confirmado', 'procesando', 'enviado', 'entregado', 'cancelado'];
    if (!validos.includes(estado)) return res.status(400).json({ message: 'Estado no válido' });

    const campoFecha = estado === 'enviado' ? ', fecha_envio = CURRENT_TIMESTAMP'
        : estado === 'entregado' ? ', fecha_entrega = CURRENT_TIMESTAMP'
        : estado === 'confirmado' ? ', fecha_confirmacion = CURRENT_TIMESTAMP' : '';

    const result = await pool.query(
        `UPDATE pedidos SET estado = $1 ${campoFecha} WHERE id = $2 RETURNING *`,
        [estado, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Pedido no encontrado' });
    res.json({ message: 'Estado actualizado', pedido: result.rows[0] });
}));

// =========================================================
// ADMIN: USUARIOS (equipo interno) + "Mi actividad"
// =========================================================

app.get('/api/admin/usuarios', asyncRoute(async (req, res) => {
    const result = await pool.query('SELECT id, nombre, email, telefono, rol, activo, ultimo_login FROM usuarios ORDER BY id ASC');
    res.json(result.rows);
}));

app.post('/api/admin/usuarios', requireAdmin, asyncRoute(async (req, res) => {
    const { nombre, email, password, telefono, rol, activo } = req.body;
    if (!nombre || !email || !password) return res.status(400).json({ message: 'Nombre, email y contraseña son obligatorios' });
    if (password.length < 6) return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' });
    const existe = await pool.query('SELECT id FROM usuarios WHERE email = $1', [email]);
    if (existe.rows.length > 0) return res.status(400).json({ message: 'El email ya está registrado' });

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
        `INSERT INTO usuarios (nombre, email, password_hash, telefono, rol, activo)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, nombre, email, telefono, rol, activo`,
        [nombre, email, hash, telefono, rol, activo !== undefined ? activo : true]
    );
    res.status(201).json({ message: 'Usuario creado', usuario: result.rows[0] });
}));

app.get('/api/usuarios/:id/actividad', requireUsuario, asyncRoute(async (req, res) => {
    const result = await pool.query(`
        SELECT i.fecha, c.nombre AS cliente, i.tipo, i.descripcion
        FROM interacciones i JOIN clientes c ON i.cliente_id = c.id
        WHERE i.usuario_id = $1 ORDER BY i.fecha DESC LIMIT 100
    `, [req.params.id]);
    res.json(result.rows);
}));

// =========================================================
app.get('/api', (req, res) => res.json({ status: 'ok', message: 'API TiendaTech activa' }));

app.listen(PORT, async () => {
    console.log(`TiendaTech escuchando en http://localhost:${PORT}`);
    // Ping a la base para dejar claro en el arranque si conectó o no.
    try {
        const r = await pool.query('SELECT COUNT(*)::int AS n FROM productos');
        console.log(`Base de datos: conectada (${dbConfig.database}@${dbConfig.host}:${dbConfig.port}) - ${r.rows[0].n} productos`);
    } catch (err) {
        if (/relation .* does not exist/i.test(err.message)) {
            console.error(`Base de datos: conectada a ${dbConfig.database}, pero SIN TABLAS. Carga db/database.sql.`);
        } else {
            console.error(`Base de datos: SIN CONEXION — ${err.message}`);
            console.error('  Revisa que PostgreSQL esté encendido y que db.config.js tenga usuario/contraseña/puerto correctos.');
        }
    }
});

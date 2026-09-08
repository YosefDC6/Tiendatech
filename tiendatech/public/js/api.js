// public/js/api.js
// Helper compartido para llamadas a la API y manejo de sesión.

const API_BASE = '/api';

async function api(path, options = {}) {
    // En páginas del equipo interno (/admin/*) se usa el token de admin;
    // en la tienda, el token del cliente. Nunca se mezclan: si se hiciera
    // `admin_token || token`, un token de admin viejo en el navegador se
    // mandaría en la tienda, el servidor lo rechazaría (401) y el guardia
    // de cuenta rebotaría al login una y otra vez.
    const esPanel = location.pathname.startsWith('/admin/');
    const token = esPanel
        ? localStorage.getItem('tt_admin_token')
        : localStorage.getItem('tt_token');
    const res = await fetch(API_BASE + path, {
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: 'Bearer ' + token } : {}),
        },
        ...options,
        body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        // Sesión interna vencida/ inválida -> de vuelta al login del panel
        if (res.status === 401 && location.pathname.startsWith('/admin/') && !location.pathname.endsWith('login.html')) {
            localStorage.removeItem('tt_usuario');
            localStorage.removeItem('tt_admin_token');
            location.href = '/admin/login.html';
        }
        throw new Error(data.message || data.error || 'Error en la solicitud');
    }
    return data;
}

const Sesion = {
    guardarCliente(cliente, token) {
        localStorage.setItem('tt_cliente', JSON.stringify(cliente));
        localStorage.setItem('tt_token', token);
    },
    cliente() {
        try { return JSON.parse(localStorage.getItem('tt_cliente')); } catch { return null; }
    },
    guardarUsuario(usuario, token) {
        localStorage.setItem('tt_usuario', JSON.stringify(usuario));
        localStorage.setItem('tt_admin_token', token);
    },
    usuario() {
        try { return JSON.parse(localStorage.getItem('tt_usuario')); } catch { return null; }
    },
    cerrarSesionCliente() {
        localStorage.removeItem('tt_cliente');
        localStorage.removeItem('tt_token');
    },
    cerrarSesionUsuario() {
        localStorage.removeItem('tt_usuario');
        localStorage.removeItem('tt_admin_token');
    }
};

// Manda al login guardando a dónde volver después
function irALogin(mensaje) {
    if (mensaje && window.toast) toast(mensaje, 'info');
    const next = encodeURIComponent(location.pathname + location.search + location.hash);
    const irYa = () => { location.href = `/login.html?next=${next}`; };
    if (mensaje) setTimeout(irYa, 800); else irYa();
}

// ---- Favoritos: cache local del set de ids para pintar corazones ----
const Favoritos = {
    _set: new Set(),
    async cargar() {
        const cliente = Sesion.cliente();
        if (!cliente) { this._set = new Set(); return this._set; }
        try {
            const favs = await api(`/clientes/${cliente.id}/favoritos`);
            this._set = new Set(favs.map((f) => f.id));
        } catch { this._set = new Set(); }
        return this._set;
    },
    tiene(productoId) { return this._set.has(Number(productoId)); },
    async alternar(productoId) {
        const cliente = Sesion.cliente();
        if (!cliente) { irALogin('Inicia sesión para guardar favoritos'); return null; }
        productoId = Number(productoId);
        if (this._set.has(productoId)) {
            await api(`/clientes/${cliente.id}/favoritos/${productoId}`, { method: 'DELETE' });
            this._set.delete(productoId);
            return false;
        }
        await api(`/clientes/${cliente.id}/favoritos`, { method: 'POST', body: { producto_id: productoId } });
        this._set.add(productoId);
        return true;
    }
};

function formatoMoneda(valor) {
    return Number(valor || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
}

function formatoFecha(fecha) {
    if (!fecha) return '—';
    return new Date(fecha).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function actualizarBadgeCarrito() {
    const cliente = Sesion.cliente();
    const el = document.getElementById('cart-badge');
    if (!el) return;
    if (!cliente) { el.style.display = 'none'; return; }
    api(`/carrito/${cliente.id}`).then((items) => {
        const total = items.reduce((acc, i) => acc + i.cantidad, 0);
        el.style.display = total > 0 ? 'flex' : 'none';
        el.textContent = total;
    }).catch(() => {});
}

document.addEventListener('DOMContentLoaded', actualizarBadgeCarrito);

// Exponer en window: las declaraciones `const` NO se vuelven propiedades
// de window por sí solas, y layout.js / chatbot.js hacen `window.Sesion`.
window.api = api;
window.Sesion = Sesion;
window.Favoritos = Favoritos;
window.irALogin = irALogin;
window.formatoMoneda = formatoMoneda;
window.formatoFecha = formatoFecha;
window.actualizarBadgeCarrito = actualizarBadgeCarrito;

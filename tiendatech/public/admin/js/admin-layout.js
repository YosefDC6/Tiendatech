// public/admin/js/admin-layout.js

function requireAuthAdmin() {
    const usuario = Sesion.usuario();
    const token = localStorage.getItem('tt_admin_token');
    if (!usuario || !token) { window.location.href = '/admin/login.html'; return null; }
    api('/admin/whoami')
        .then((u) => { if (u && u.rol) Sesion.guardarUsuario(u, token); })
        .catch(() => { Sesion.cerrarSesionUsuario(); window.location.href = '/admin/login.html'; });
    return usuario;
}

const ADMIN_SECCIONES = [
    { titulo: 'CRM', links: [
        { href: '/admin/dashboard.html',     key: 'dashboard',     ic: 'home',    label: 'Dashboard' },
        { href: '/admin/clientes.html',      key: 'clientes',      ic: 'user',    label: 'Clientes' },
        { href: '/admin/interacciones.html', key: 'interacciones', ic: 'chat',    label: 'Interacciones' },
        { href: '/admin/evaluaciones.html',  key: 'evaluaciones',  ic: 'star',    label: 'Evaluaciones' },
        { href: '/admin/soporte.html',       key: 'soporte',       ic: 'help',    label: 'Soporte' },
        { href: '/admin/reportes.html',      key: 'reportes',      ic: 'grid',    label: 'Reportes' },
    ] },
    { titulo: 'Tienda', links: [
        { href: '/admin/pedidos.html',   key: 'pedidos',   ic: 'truck',   label: 'Pedidos' },
        { href: '/admin/productos.html', key: 'productos', ic: 'package', label: 'Inventario' },
        { href: '/admin/chatbot.html',   key: 'chatbot',   ic: 'chat',    label: 'Analítica chatbot' },
    ] },
    { titulo: 'Cuenta', links: [
        { href: '/admin/mi-actividad.html',  key: 'mi-actividad',  ic: 'clock',    label: 'Mi actividad' },
        { href: '/admin/usuarios.html',      key: 'usuarios',      ic: 'lock',     label: 'Cuentas y equipo' },
        { href: '/admin/configuracion.html', key: 'configuracion', ic: 'settings', label: 'Configuración' },
    ] },
];

// Qué secciones ve cada rol interno. '*' = todas.
// Para un rol nuevo: agrégalo aquí, en ROLES_INTERNOS (server.js) y en el
// CHECK de la tabla usuarios (db/database.sql).
const PERMISOS = {
    admin:    '*',
    vendedor: ['dashboard', 'clientes', 'interacciones', 'evaluaciones', 'soporte', 'reportes', 'pedidos', 'productos', 'chatbot', 'mi-actividad', 'configuracion'],
    soporte:  ['dashboard', 'clientes', 'interacciones', 'evaluaciones', 'soporte', 'reportes', 'mi-actividad', 'configuracion'],
    almacen:  ['dashboard', 'pedidos', 'productos', 'chatbot', 'mi-actividad', 'configuracion'],
};
const ROL_LABEL = { admin: 'Administrador', vendedor: 'Vendedor', soporte: 'Soporte', almacen: 'Almacén' };

function puedeVer(rol, key) {
    const p = PERMISOS[rol] || PERMISOS.vendedor;
    return p === '*' || p.includes(key);
}
window.puedeVer = puedeVer;
window.ROL_LABEL = ROL_LABEL;

function renderAdminSidebar(activo) {
    const el = document.getElementById('admin-sidebar-placeholder');
    if (!el) return;
    const usuario = Sesion.usuario();
    const rol = (usuario && usuario.rol) || 'vendedor';
    const ic = window.icon || (() => '');

    // Si el rol no puede ver esta sección, lo mandamos al panel principal.
    if (activo && !puedeVer(rol, activo)) {
        window.location.href = '/admin/dashboard.html';
        return;
    }

    const secciones = ADMIN_SECCIONES
        .map((s) => ({ ...s, links: s.links.filter((l) => puedeVer(rol, l.key)) }))
        .filter((s) => s.links.length > 0);

    el.innerHTML = `
        <div class="brand"><span class="brand-mark">${ic('bolt', 16)}</span> TiendaTech</div>
        <button class="admin-nav-toggle" id="admin-nav-toggle" aria-label="Menú">${ic('menu', 20)}</button>
        <div class="admin-nav-links" id="admin-nav-links">
            ${secciones.map((s) => `
                <div class="admin-nav-sec">${s.titulo}</div>
                ${s.links.map((l) => `<a href="${l.href}" class="${l.key === activo ? 'active' : ''}">${ic(l.ic, 17)} ${l.label}</a>`).join('')}
            `).join('')}
        </div>
        <div class="admin-user">
            <div class="au-name">${usuario ? usuario.nombre : ''}</div>
            <div class="au-rol">${ROL_LABEL[rol] || rol}</div>
            <button class="btn btn-ghost btn-sm" style="padding-left:0;margin-top:4px" onclick="cerrarSesionAdmin()">Cerrar sesión</button>
        </div>
    `;
    const t = document.getElementById('admin-nav-toggle');
    if (t) t.addEventListener('click', () => document.getElementById('admin-nav-links').classList.toggle('open'));
}

function cerrarSesionAdmin() {
    Sesion.cerrarSesionUsuario();
    window.location.href = '/admin/login.html';
}

// Encabezado de página estándar del panel
function adminHeader(titulo, subtitulo, accionHTML) {
    return `<div class="admin-topbar">
        <div><h2>${titulo}</h2>${subtitulo ? `<p>${subtitulo}</p>` : ''}</div>
        <div class="at-actions">${accionHTML || ''}</div>
    </div>`;
}
window.adminHeader = adminHeader;

document.body.classList.add('theme-light');

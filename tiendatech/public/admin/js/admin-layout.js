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
        { href: '/admin/usuarios.html',      key: 'usuarios',      ic: 'lock',     label: 'Equipo' },
        { href: '/admin/configuracion.html', key: 'configuracion', ic: 'settings', label: 'Configuración' },
    ] },
];

function renderAdminSidebar(activo) {
    const el = document.getElementById('admin-sidebar-placeholder');
    if (!el) return;
    const usuario = Sesion.usuario();
    const ic = window.icon || (() => '');
    const esAdmin = usuario && usuario.rol === 'admin';

    el.innerHTML = `
        <div class="brand"><span class="brand-mark">${ic('bolt', 16)}</span> TiendaTech</div>
        <button class="admin-nav-toggle" id="admin-nav-toggle" aria-label="Menú">${ic('menu', 20)}</button>
        <div class="admin-nav-links" id="admin-nav-links">
            ${ADMIN_SECCIONES.map((s) => `
                <div class="admin-nav-sec">${s.titulo}</div>
                ${s.links
                    .filter((l) => l.key !== 'usuarios' || esAdmin)
                    .map((l) => `<a href="${l.href}" class="${l.key === activo ? 'active' : ''}">${ic(l.ic, 17)} ${l.label}</a>`).join('')}
            `).join('')}
        </div>
        <div class="admin-user">
            <div class="au-name">${usuario ? usuario.nombre : ''}</div>
            <div class="au-rol">${usuario ? usuario.rol : ''}</div>
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

// public/js/layout.js
// Navbar + footer de la tienda. Se insertan en cualquier página que
// tenga <div id="navbar-placeholder"></div> y <div id="footer-placeholder"></div>.

async function renderNavbar() {
    const el = document.getElementById('navbar-placeholder');
    if (!el) return;
    const cliente = window.Sesion ? Sesion.cliente() : null;
    const nombreCorto = cliente ? cliente.nombre.split(' ')[0] : '';

    let categorias = [];
    try { categorias = await api('/categorias'); } catch { /* backend abajo: navbar sin categorías */ }

    const params = new URLSearchParams(location.search);
    const catActual = params.get('categoria') || '';

    const catLinks = categorias.map((c) =>
        `<a href="/index.html?categoria=${encodeURIComponent(c.nombre)}">${iconCategoria(c.nombre, 16)} ${c.nombre}</a>`
    ).join('');

    // Opciones del selector de alcance dentro de la barra de búsqueda
    const scopeOptions = `<option value="">Todo</option>` + categorias.map((c) =>
        `<option value="${c.nombre}" ${c.nombre === catActual ? 'selected' : ''}>${c.nombre}</option>`
    ).join('');

    // Menú desplegable "Categorías" (reemplaza la barra fija de categorías)
    const categoriasMenu = `
        <div class="menu-dropdown" id="cat-dd">
            <button class="cat-trigger" id="cat-trigger" aria-haspopup="true" aria-expanded="false">Categorías ${icon('chevron', 14)}</button>
            <div class="menu-panel cat-panel" role="menu">
                <a href="/index.html?ver=todo" role="menuitem">${icon('grid', 16)} Todo el catálogo</a>
                <div class="menu-sep"></div>
                ${catLinks}
            </div>
        </div>`;

    const M = (i, txt, href) => `<a href="${href}" role="menuitem">${icon(i)} ${txt}</a>`;
    const cuentaMenu = cliente ? `
        <div class="menu-dropdown" id="cuenta-dd">
            <button class="icon-btn menu-trigger" id="cuenta-trigger" aria-haspopup="true" aria-expanded="false">
                <span class="avatar">${(nombreCorto[0] || 'U').toUpperCase()}</span>
                <span class="hide-sm">${nombreCorto}</span> ${icon('chevron', 14)}
            </button>
            <div class="menu-panel" role="menu">
                <div class="menu-head">
                    <strong>${cliente.nombre}</strong>
                    <span>${cliente.correo}</span>
                </div>
                ${M('home', 'Resumen', '/perfil.html')}
                ${M('package', 'Mis pedidos', '/pedidos.html')}
                ${M('star', 'Club de puntos', '/recompensas.html')}
                ${M('heart', 'Favoritos', '/favoritos.html')}
                ${M('pin', 'Direcciones', '/direcciones.html')}
                ${M('help', 'Soporte', '/soporte.html')}
                ${M('settings', 'Preferencias', '/preferencias.html')}
                <div class="menu-sep"></div>
                <button class="menu-logout" id="btn-logout" role="menuitem">${icon('logout')} Cerrar sesión</button>
            </div>
        </div>
    ` : `
        <a href="/login.html" class="btn btn-outline btn-sm">Iniciar sesión</a>
        <a href="/registro.html" class="btn btn-primary btn-sm hide-sm">Crear cuenta</a>
    `;

    el.innerHTML = `
        <div class="topbar">Envío gratis en compras mayores a $10,000 · Garantía directa con la tienda</div>
        <nav class="navbar">
            <div class="navbar-inner">
                <button class="hamburger" id="hamburger" aria-label="Menú">${icon('menu', 22)}</button>
                <a href="/index.html" class="brand"><span class="brand-mark">${icon('bolt', 16)}</span> <span class="hide-sm">TiendaTech</span></a>

                <form class="nav-search" id="nav-search" role="search">
                    <input type="search" id="nav-search-input" placeholder="Buscar productos, marcas…" aria-label="Buscar" />
                    <select id="nav-scope" aria-label="Categoría a buscar">${scopeOptions}</select>
                    <button type="submit">${icon('search', 16)}<span class="hide-sm">Buscar</span></button>
                </form>

                <div class="nav-actions">
                    ${categoriasMenu}
                    <a href="/favoritos.html" class="icon-btn hide-sm" title="Favoritos">${icon('heart', 20)}<span class="badge-count" id="fav-badge" style="display:none">0</span></a>
                    <a href="/carrito.html" class="icon-btn" title="Carrito">${icon('cart', 20)}<span class="badge-count" id="cart-badge" style="display:none">0</span></a>
                    ${cuentaMenu}
                </div>
            </div>
        </nav>

        <nav class="bottom-nav" id="bottom-nav">
            <a href="/index.html" data-match="/index.html,/"><span class="bn-ico">${icon('home', 20)}</span>Inicio</a>
            <a href="/index.html?ver=todo" data-match="__catalogo"><span class="bn-ico">${icon('grid', 20)}</span>Catálogo</a>
            <a href="/carrito.html" data-match="/carrito.html"><span class="bn-ico">${icon('cart', 20)}</span>Carrito</a>
            <a href="${cliente ? '/perfil.html' : '/login.html'}" data-match="/perfil.html,/login.html,/registro.html"><span class="bn-ico">${icon('user', 20)}</span>${cliente ? 'Perfil' : 'Entrar'}</a>
            ${cliente
                ? `<a href="#" class="is-exit" id="bn-logout"><span class="bn-ico">${icon('logout', 20)}</span>Salir</a>`
                : `<a href="/ayuda.html" data-match="/ayuda.html"><span class="bn-ico">${icon('help', 20)}</span>Ayuda</a>`}
        </nav>

        <div class="drawer-overlay" id="drawer-overlay"></div>
        <aside class="drawer" id="drawer">
            <div class="drawer-head">
                <strong>${cliente ? 'Hola, ' + nombreCorto : 'Menú'}</strong>
                <button class="modal-close" id="drawer-close" aria-label="Cerrar">${icon('x', 20)}</button>
            </div>
            <form class="drawer-search" id="drawer-search">
                <input type="search" id="drawer-search-input" placeholder="Buscar…" />
                <button type="submit">${icon('search', 16)}</button>
            </form>
            <div class="drawer-section">
                <span class="drawer-label">Categorías</span>
                <a href="/index.html?ver=todo">${icon('grid', 16)} Todo el catálogo</a>
                ${catLinks}
            </div>
            <div class="drawer-section">
                <span class="drawer-label">${cliente ? 'Mi cuenta' : 'Cuenta'}</span>
                ${cliente ? `
                    <a href="/perfil.html">Resumen</a>
                    <a href="/pedidos.html">Mis pedidos</a>
                    <a href="/recompensas.html">Club de puntos</a>
                    <a href="/favoritos.html">Favoritos</a>
                    <a href="/resenas.html">Mis reseñas</a>
                    <a href="/direcciones.html">Direcciones</a>
                    <a href="/soporte.html">Soporte</a>
                    <a href="/datos.html">Mis datos</a>
                    <a href="/seguridad.html">Seguridad</a>
                    <a href="/preferencias.html">Preferencias</a>
                    <button class="menu-logout" id="btn-logout-drawer">Cerrar sesión</button>
                ` : `
                    <a href="/login.html">Iniciar sesión</a>
                    <a href="/registro.html">Crear cuenta</a>
                    <a href="/ayuda.html">Ayuda</a>
                `}
            </div>
        </aside>
    `;

    // ---- Búsqueda (input + alcance + botón, todo en uno) ----
    const inp = document.getElementById('nav-search-input');
    if (inp) inp.value = params.get('busqueda') || '';
    const hacerBusqueda = (valor, scope) => {
        const q = (valor || '').trim();
        const qs = new URLSearchParams();
        if (q) qs.set('busqueda', q);
        if (scope) qs.set('categoria', scope);
        if (!q && !scope) qs.set('ver', 'todo');
        location.href = '/index.html?' + qs.toString();
    };
    document.getElementById('nav-search').addEventListener('submit', (e) => {
        e.preventDefault();
        hacerBusqueda(inp.value, document.getElementById('nav-scope').value);
    });
    document.getElementById('drawer-search').addEventListener('submit', (e) => {
        e.preventDefault(); hacerBusqueda(document.getElementById('drawer-search-input').value, '');
    });

    // ---- Dropdowns (cuenta + categorías): un solo manejador ----
    const dropdowns = ['cuenta-dd', 'cat-dd'].map((id) => document.getElementById(id)).filter(Boolean);
    dropdowns.forEach((dd) => {
        const trigger = dd.querySelector('[aria-haspopup]');
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const abrir = !dd.classList.contains('open');
            dropdowns.forEach((o) => o.classList.remove('open'));
            dd.classList.toggle('open', abrir);
            trigger.setAttribute('aria-expanded', abrir ? 'true' : 'false');
        });
    });
    document.addEventListener('click', () => dropdowns.forEach((dd) => dd.classList.remove('open')));
    document.querySelectorAll('#btn-logout, #btn-logout-drawer').forEach((b) =>
        b.addEventListener('click', () => {
            Sesion.cerrarSesionCliente();
            if (window.toast) toast('Sesión cerrada', 'ok');
            setTimeout(() => location.href = '/index.html', 400);
        })
    );

    // ---- Drawer móvil ----
    const drawer = document.getElementById('drawer');
    const overlay = document.getElementById('drawer-overlay');
    const abrirDrawer = () => { drawer.classList.add('open'); overlay.classList.add('open'); };
    const cerrarDrawer = () => { drawer.classList.remove('open'); overlay.classList.remove('open'); };
    document.getElementById('hamburger').addEventListener('click', abrirDrawer);
    document.getElementById('drawer-close').addEventListener('click', cerrarDrawer);
    overlay.addEventListener('click', cerrarDrawer);

    // ---- Marcar categoría activa (en el drawer y el menú de categorías) ----
    if (catActual) {
        document.querySelectorAll('.cat-panel a, .drawer-section a').forEach((a) => {
            if (a.getAttribute('href') === '/index.html?categoria=' + encodeURIComponent(catActual)) a.classList.add('active');
        });
    }

    // ---- Barra inferior (móvil): marcar activo + logout ----
    const aquí = location.pathname;
    const enPortada = (aquí === '/' || aquí === '/index.html') && !location.search;
    const enCatalogo = (aquí === '/' || aquí === '/index.html') && !!location.search;
    document.querySelectorAll('#bottom-nav a[data-match]').forEach((a) => {
        const claves = a.dataset.match.split(',');
        const activo = claves.some((k) =>
            k === '__catalogo' ? enCatalogo : (k === '/index.html' || k === '/') ? enPortada : k === aquí
        );
        if (activo) a.classList.add('active');
    });
    const bnLogout = document.getElementById('bn-logout');
    if (bnLogout) bnLogout.addEventListener('click', (e) => {
        e.preventDefault();
        Sesion.cerrarSesionCliente();
        if (window.toast) toast('Sesión cerrada', 'ok');
        setTimeout(() => location.href = '/index.html', 400);
    });

    actualizarBadgeCarrito();
    actualizarBadgeFavoritos();
}

async function actualizarBadgeFavoritos() {
    const el = document.getElementById('fav-badge');
    const cliente = window.Sesion ? Sesion.cliente() : null;
    if (!el || !cliente) { if (el) el.style.display = 'none'; return; }
    try {
        const favs = await api(`/clientes/${cliente.id}/favoritos`);
        el.textContent = favs.length;
        el.style.display = favs.length > 0 ? 'flex' : 'none';
    } catch { el.style.display = 'none'; }
}

function renderFooter() {
    const el = document.getElementById('footer-placeholder');
    if (!el) return;
    const cliente = window.Sesion ? Sesion.cliente() : null;
    el.innerHTML = `
        <footer>
            <div class="container footer-grid">
                <div>
                    <div class="brand" style="margin-bottom:10px"><span class="brand-mark">${icon('bolt', 16)}</span> TiendaTech</div>
                    <p style="font-size:.85rem">Cómputo y electrónica con stock real, comparador de especificaciones y asesor de compra.</p>
                </div>
                <div>
                    <h4>Comprar</h4>
                    <a href="/index.html">Catálogo completo</a>
                    <a href="/index.html?categoria=Laptops">Laptops</a>
                    <a href="/index.html?categoria=Componentes">Componentes</a>
                    <a href="/index.html?categoria=Perif%C3%A9ricos">Periféricos</a>
                </div>
                <div>
                    <h4>Ayuda</h4>
                    <a href="/ayuda.html#envios">Envíos y entregas</a>
                    <a href="/ayuda.html#devoluciones">Devoluciones</a>
                    <a href="/ayuda.html#garantia">Garantía</a>
                    <a href="/ayuda.html#contacto">Contacto</a>
                </div>
                <div>
                    <h4>Cuenta</h4>
                    ${cliente
                        ? `<a href="/perfil.html">Mi cuenta</a><a href="/pedidos.html">Mis pedidos</a><a href="/favoritos.html">Favoritos</a>`
                        : `<a href="/login.html">Iniciar sesión</a><a href="/registro.html">Crear cuenta</a>`}
                    <a href="/ayuda.html">Centro de ayuda</a>
                </div>
            </div>
            <div class="container footer-legal">
                <span>© ${new Date().getFullYear()} TiendaTech · Cómputo y electrónica</span>
                <span class="footer-tema">
                    <label for="tema-quick">Tema</label>
                    <select id="tema-quick" aria-label="Cambiar tema de color">
                        ${(window.Tema ? Tema.lista : []).map((t) => `<option value="${t.clave}">${t.nombre}</option>`).join('')}
                    </select>
                    · <a href="/ayuda.html#cookies">Cookies</a>
                </span>
            </div>
        </footer>
    `;

    const sel = document.getElementById('tema-quick');
    if (sel && window.Tema) {
        sel.value = Tema.actual();
        sel.addEventListener('change', () => Tema.aplicar(sel.value));
    }
}

// ---- Cookies ----
function getCookie(nombre) {
    const par = document.cookie.split('; ').find((c) => c.startsWith(nombre + '='));
    return par ? decodeURIComponent(par.split('=').slice(1).join('=')) : null;
}
window.getCookie = getCookie;

function renderCookieConsent() {
    if (getCookie('tt_consent')) return;  // ya lo aceptó antes -> no volver a mostrar
    const el = document.createElement('div');
    el.className = 'cookie-bar';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Aviso de cookies');
    el.innerHTML = `
        <div class="cookie-inner">
            <p>Usamos cookies para mantener tu sesión, tu carrito y tus preferencias.
               Al continuar aceptas su uso. <a href="/ayuda.html#cookies">Más información</a>.</p>
            <div class="cookie-actions">
                <button class="btn btn-outline btn-sm" id="cookie-min">Solo esenciales</button>
                <button class="btn btn-primary btn-sm" id="cookie-ok">Aceptar</button>
            </div>
        </div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));

    const guardar = (valor) => {
        // 1 año; solo desaparece de verdad si el usuario borra las cookies del navegador
        document.cookie = `tt_consent=${valor}; max-age=${60 * 60 * 24 * 365}; path=/; SameSite=Lax`;
        el.classList.remove('show');
        setTimeout(() => el.remove(), 350);
    };
    document.getElementById('cookie-ok').addEventListener('click', () => guardar('all'));
    document.getElementById('cookie-min').addEventListener('click', () => guardar('essential'));
}

document.addEventListener('DOMContentLoaded', () => {
    renderNavbar();
    renderFooter();
    renderCookieConsent();
});

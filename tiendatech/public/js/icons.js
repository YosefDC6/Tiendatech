// public/js/icons.js
// Set de íconos SVG (trazo, sin emojis) para toda la tienda.
// Uso:  icon('cart')  ó  icon('cart', 20)
(function () {
    const P = {
        search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
        cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.4 12a1.6 1.6 0 0 0 1.6 1.3h8.8a1.6 1.6 0 0 0 1.6-1.3L22 7H6"/>',
        heart: '<path d="M20.8 5.1a5 5 0 0 0-7.1 0L12 6.8l-1.7-1.7a5 5 0 1 0-7.1 7.1L12 21l8.8-8.8a5 5 0 0 0 0-7.1Z"/>',
        user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
        id: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.5-1.5 1.7-2.2 3-2.2s2.5.7 3 2.2"/><line x1="15" y1="10" x2="18" y2="10"/><line x1="15" y1="13" x2="18" y2="13"/>',
        package: '<path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/>',
        pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
        lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
        settings: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
        help: '<circle cx="12" cy="12" r="10"/><path d="M9.2 9a3 3 0 0 1 5.7 1c0 2-3 2.5-3 4"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
        chat: '<path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/>',
        home: '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M9 22V12h6v10"/>',
        grid: '<rect x="3" y="3" width="7.5" height="7.5" rx="1"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1"/>',
        logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
        check: '<polyline points="20 6 9 17 4 12"/>',
        x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
        chevron: '<polyline points="6 9 12 15 18 9"/>',
        arrow: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
        eye: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/>',
        info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="11"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
        alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
        menu: '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>',
        shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>',
        truck: '<path d="M1 4h13v12H1z"/><path d="M14 8h4l4 4v4h-8"/><circle cx="6" cy="18.5" r="2"/><circle cx="18.5" cy="18.5" r="2"/>',
        card: '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>',
        undo: '<polyline points="1 4 1 10 7 10"/><path d="M3.5 15a9 9 0 1 0 2.1-9.4L1 10"/>',
        bolt: '<polygon points="13 2 4 14 12 14 11 22 20 10 12 10 13 2"/>',
        laptop: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M2 20h20l-2-3H4l-2 3Z"/>',
        monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
        cpu: '<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="2" x2="9" y2="5"/><line x1="15" y1="2" x2="15" y2="5"/><line x1="9" y1="19" x2="9" y2="22"/><line x1="15" y1="19" x2="15" y2="22"/><line x1="19" y1="9" x2="22" y2="9"/><line x1="19" y1="15" x2="22" y2="15"/><line x1="2" y1="9" x2="5" y2="9"/><line x1="2" y1="15" x2="5" y2="15"/>',
        mouse: '<rect x="6" y="3" width="12" height="18" rx="6"/><line x1="12" y1="7" x2="12" y2="11"/>',
        headphones: '<path d="M4 18v-6a8 8 0 0 1 16 0v6"/><rect x="2" y="14" width="5" height="7" rx="1.5"/><rect x="17" y="14" width="5" height="7" rx="1.5"/>',
        keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="10" x2="6" y2="10"/><line x1="10" y1="10" x2="10" y2="10"/><line x1="14" y1="10" x2="14" y2="10"/><line x1="18" y1="10" x2="18" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/>',
        star: '<polygon points="12 2 15 8.5 22 9.3 17 14 18.2 21 12 17.6 5.8 21 7 14 2 9.3 9 8.5 12 2"/>',
        clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 16 14"/>',
        qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><line x1="14" y1="14" x2="14" y2="17"/><line x1="17" y1="14" x2="21" y2="14"/><line x1="21" y1="17" x2="21" y2="21"/><line x1="14" y1="21" x2="17" y2="21"/><line x1="17" y1="17" x2="17" y2="17"/>',
        wallet: '<path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2"/><rect x="3" y="7" width="18" height="12" rx="2"/><path d="M16 13h.01"/>',
        plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
        download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
        medal: '<circle cx="12" cy="14" r="6"/><path d="M8.5 8.5 6 3h5l2 4M15.5 8.5 18 3h-5"/>',
        phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.4-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7A2 2 0 0 1 22 16.9Z"/>',
        mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 6 10 7L22 6"/>',
        calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    };
    // Íconos por nombre de categoría (para los tiles de la portada)
    const CAT = {
        'Laptops': 'laptop', 'PC de Escritorio': 'monitor', 'Componentes': 'cpu',
        'Periféricos': 'mouse', 'Monitores': 'monitor', 'Accesorios': 'headphones',
    };

    window.icon = function (name, size = 18) {
        const p = P[name] || P.grid;
        return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
    };
    window.iconCategoria = function (nombre, size = 22) {
        return window.icon(CAT[nombre] || 'grid', size);
    };

    // Insignia del nivel del Club (Bronce/Plata/Oro/Platino): escudo con
    // color propio y 1–4 puntos según el nivel.
    const NIVEL_COLOR = { bronce: '#C0885A', plata: '#9AA7B8', oro: '#E0B23C', platino: '#6EA7CE' };
    const NIVEL_PIPS  = { bronce: 1, plata: 2, oro: 3, platino: 4 };
    window.nivelBadge = function (clave, size = 22) {
        const col = NIVEL_COLOR[clave] || NIVEL_COLOR.bronce;
        const pips = NIVEL_PIPS[clave] || 1;
        let dots = '';
        for (let i = 0; i < pips; i++) {
            const x = 12 + (i - (pips - 1) / 2) * 3.1;
            dots += `<circle cx="${x.toFixed(2)}" cy="14.5" r="1.15" fill="#fff"/>`;
        }
        return `<svg class="nivel-badge" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2 4 5v6.2C4 16.4 12 21 12 21s8-4.6 8-9.8V5Z" fill="${col}"/>
            <path d="M12 2 4 5v6.2C4 16.4 12 21 12 21s8-4.6 8-9.8V5Z" fill="none" stroke="rgba(0,0,0,.18)" stroke-width="1"/>
            ${dots}
        </svg>`;
    };
    window.NIVEL_COLOR = NIVEL_COLOR;

    // Rellena íconos en HTML estático: <span data-ic="cart" data-ic-size="18"></span>
    // El ícono se antepone al contenido existente del elemento.
    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('[data-ic]').forEach((el) => {
            const prev = el.innerHTML.trim();
            el.innerHTML = window.icon(el.dataset.ic, Number(el.dataset.icSize) || 20) + (prev ? ' ' + prev : '');
        });
    });
})();

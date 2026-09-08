// public/js/theme.js  — se carga ANTES que el resto para evitar parpadeo.
// Aplica el tema guardado (localStorage + cookie) poniendo data-tema en <html>.
(function () {
    const TEMAS = [
        { clave: 'indigo',    nombre: 'Índigo' },
        { clave: 'esmeralda', nombre: 'Esmeralda' },
        { clave: 'grafito',   nombre: 'Grafito' },
        { clave: 'claro',     nombre: 'Claro' },
    ];
    const claves = TEMAS.map((t) => t.clave);

    function leer() {
        try { const v = localStorage.getItem('tt_tema'); if (v) return v; } catch (e) {}
        const m = document.cookie.split('; ').find((c) => c.startsWith('tt_tema='));
        return m ? decodeURIComponent(m.split('=')[1]) : null;
    }
    function aplicar(clave) {
        const t = claves.includes(clave) ? clave : 'indigo';
        document.documentElement.setAttribute('data-tema', t);
        try { localStorage.setItem('tt_tema', t); } catch (e) {}
        document.cookie = `tt_tema=${t}; max-age=${60 * 60 * 24 * 365}; path=/; SameSite=Lax`;
        window.dispatchEvent(new CustomEvent('temacambiado', { detail: t }));
    }

    aplicar(leer() || 'indigo');
    window.Tema = { aplicar, actual: () => document.documentElement.getAttribute('data-tema') || 'indigo', lista: TEMAS };
})();

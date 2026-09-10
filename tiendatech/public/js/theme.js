// public/js/theme.js  — se carga ANTES que el resto para evitar parpadeo.
// El panel interno (/admin/*) y la tienda tienen su tema por SEPARADO:
//   - tienda  -> clave "tt_tema_tienda"  (default "indigo")
//   - panel   -> clave "tt_tema_admin"   (default "esmeralda")
// Cambiar el tema en un lado no afecta al otro. Si no se ha elegido tema,
// se aplica el default SIN guardarlo.
(function () {
    const TEMAS = [
        { clave: 'indigo',    nombre: 'Índigo' },
        { clave: 'esmeralda', nombre: 'Esmeralda' },
        { clave: 'grafito',   nombre: 'Grafito' },
        { clave: 'claro',     nombre: 'Claro' },
    ];
    const claves = TEMAS.map((t) => t.clave);
    const esPanel = location.pathname.startsWith('/admin/');
    const CLAVE = esPanel ? 'tt_tema_admin' : 'tt_tema_tienda';
    const POR_DEFECTO = esPanel ? 'esmeralda' : 'indigo';

    function leer() {
        try { const v = localStorage.getItem(CLAVE); if (v) return v; } catch (e) {}
        const m = document.cookie.split('; ').find((c) => c.startsWith(CLAVE + '='));
        return m ? decodeURIComponent(m.split('=')[1]) : null;
    }
    function poner(clave) {
        const t = claves.includes(clave) ? clave : POR_DEFECTO;
        document.documentElement.setAttribute('data-tema', t);
        window.dispatchEvent(new CustomEvent('temacambiado', { detail: t }));
        return t;
    }
    function aplicar(clave) {
        const t = poner(clave);
        try { localStorage.setItem(CLAVE, t); } catch (e) {}
        document.cookie = `${CLAVE}=${t}; max-age=${60 * 60 * 24 * 365}; path=/; SameSite=Lax`;
    }

    poner(leer() || POR_DEFECTO);
    window.Tema = {
        aplicar,
        actual: () => document.documentElement.getAttribute('data-tema') || POR_DEFECTO,
        lista: TEMAS,
        contexto: esPanel ? 'panel' : 'tienda',
    };
})();

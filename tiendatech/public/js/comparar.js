// public/js/comparar.js
// Bandeja para comparar productos (máx. 4). Guarda ids en localStorage y
// muestra una barra fija abajo. Requiere api.js e icons.js.
(function () {
    const CLAVE = 'tt_comparar';
    const MAX = 4;

    function leer() {
        try { return JSON.parse(localStorage.getItem(CLAVE)) || []; } catch (e) { return []; }
    }
    function guardar(ids) {
        try { localStorage.setItem(CLAVE, JSON.stringify(ids)); } catch (e) {}
        render();
        window.dispatchEvent(new CustomEvent('comparar-cambio', { detail: ids }));
    }

    const Comparar = {
        lista: leer,
        tiene(id) { return leer().includes(Number(id)); },
        limite: MAX,
        toggle(id) {
            id = Number(id);
            let ids = leer();
            if (ids.includes(id)) {
                ids = ids.filter((x) => x !== id);
            } else {
                if (ids.length >= MAX) {
                    if (window.toast) toast(`Puedes comparar hasta ${MAX} productos`, 'warn');
                    return false;
                }
                ids.push(id);
            }
            guardar(ids);
            return ids.includes(id);
        },
        quitar(id) { guardar(leer().filter((x) => x !== Number(id))); },
        limpiar() { guardar([]); },
    };
    window.Comparar = Comparar;

    // Cache de nombres para las fichas de la barra
    const nombres = {};
    async function nombreDe(id) {
        if (nombres[id]) return nombres[id];
        try {
            const p = await api('/productos/' + id);
            nombres[id] = p.nombre;
        } catch (e) { nombres[id] = 'Producto ' + id; }
        return nombres[id];
    }

    let barra;
    function asegurarBarra() {
        if (barra) return barra;
        barra = document.createElement('div');
        barra.className = 'cmp-bar';
        barra.hidden = true;
        document.body.appendChild(barra);
        return barra;
    }

    async function render() {
        const b = asegurarBarra();
        const ids = leer();
        if (ids.length === 0) { b.hidden = true; return; }
        b.hidden = false;
        const chips = await Promise.all(ids.map(async (id) => {
            const nom = await nombreDe(id);
            return `<span class="cmp-chip">${nom}<button aria-label="Quitar" onclick="Comparar.quitar(${id})">${window.icon ? icon('x', 12) : '×'}</button></span>`;
        }));
        b.innerHTML = `
            <div class="cmp-bar-in">
                <span class="cmp-count">${ids.length} para comparar</span>
                <div class="cmp-chips">${chips.join('')}</div>
                <div class="cmp-acts">
                    <button class="btn btn-ghost btn-sm" onclick="Comparar.limpiar()">Limpiar</button>
                    <a class="btn btn-primary btn-sm ${ids.length < 2 ? 'is-disabled' : ''}"
                       href="${ids.length < 2 ? 'javascript:void 0' : '/comparar.html?ids=' + ids.join(',')}">
                       Comparar${ids.length < 2 ? ' (elige 2+)' : ''}</a>
                </div>
            </div>`;
    }

    document.addEventListener('DOMContentLoaded', render);
    window.addEventListener('comparar-cambio', () => {
        document.querySelectorAll('[data-cmp]').forEach((el) => {
            const on = Comparar.tiene(el.dataset.cmp);
            el.classList.toggle('on', on);
            el.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
    });
})();

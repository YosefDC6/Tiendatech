// public/js/chatbot.js
// Widget de chatbot flotante, disponible en todas las páginas de la tienda.
// Flujo: pregunta el uso -> pregunta presupuesto -> llama /api/chatbot/recomendar
// -> muestra tarjetas de producto según inventario disponible.

(function () {
    const USOS = [
        { valor: 'gaming', etiqueta: 'Gaming' },
        { valor: 'oficina', etiqueta: 'Oficina' },
        { valor: 'diseno', etiqueta: 'Diseño' },
        { valor: 'programacion', etiqueta: 'Programación' },
        { valor: 'estudiante', etiqueta: 'Estudiante' },
        { valor: 'streaming', etiqueta: 'Streaming' },
    ];
    const PRESUPUESTOS = [8000, 15000, 25000, 40000];

    let estado = { uso: null, presupuesto: null, categoria: null };
    let CATEGORIAS = [];

    function crearWidget() {
        const toggle = document.createElement('button');
        toggle.id = 'chatbot-toggle';
        toggle.innerHTML = window.icon ? icon('chat', 24) : '';
        toggle.title = 'Asistente de compra';
        toggle.setAttribute('aria-label', 'Abrir asistente de compra');

        const panel = document.createElement('div');
        panel.id = 'chatbot-panel';
        panel.innerHTML = `
            <div class="chatbot-header">
                <strong>Asistente TiendaTech</strong>
                <button class="modal-close" id="chatbot-close" aria-label="Cerrar">${window.icon ? icon('x', 18) : ''}</button>
            </div>
            <div class="chatbot-body" id="chatbot-body"></div>
            <div class="chatbot-quick" id="chatbot-quick"></div>
            <div class="chatbot-input">
                <input type="text" id="chatbot-text" placeholder="Escribe presupuesto o lo que buscas..." />
                <button id="chatbot-send">Enviar</button>
            </div>
        `;

        document.body.appendChild(toggle);
        document.body.appendChild(panel);

        toggle.addEventListener('click', () => {
            panel.classList.toggle('open');
            quitarNudge();
            if (panel.classList.contains('open') && !panel.dataset.iniciado) {
                panel.dataset.iniciado = '1';
                iniciarConversacion();
            }
        });
        panel.querySelector('#chatbot-close').addEventListener('click', () => panel.classList.remove('open'));

        // Aviso de primera visita: "hay un asesor por si no sabes qué elegir"
        let visto = false;
        try { visto = localStorage.getItem('tt_asesor_visto') === '1'; } catch (e) {}
        if (!visto) {
            const nudge = document.createElement('div');
            nudge.className = 'chatbot-nudge';
            nudge.innerHTML = `<button aria-label="Cerrar">${window.icon ? icon('x', 14) : '×'}</button>
                ¿No sabes qué comprar? Pregúntame según tu presupuesto y te digo qué hay disponible.`;
            document.body.appendChild(nudge);
            setTimeout(() => nudge.classList.add('show'), 1200);
            nudge.querySelector('button').addEventListener('click', quitarNudge);
            setTimeout(quitarNudge, 12000);
        }
        function quitarNudge() {
            const n = document.querySelector('.chatbot-nudge');
            if (n) { n.classList.remove('show'); setTimeout(() => n.remove(), 300); }
            try { localStorage.setItem('tt_asesor_visto', '1'); } catch (e) {}
        }
        panel.querySelector('#chatbot-send').addEventListener('click', enviarTexto);
        panel.querySelector('#chatbot-text').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') enviarTexto();
        });
    }

    function agregarMensaje(texto, tipo = 'bot') {
        const body = document.getElementById('chatbot-body');
        const div = document.createElement('div');
        div.className = `chat-msg ${tipo}`;
        div.textContent = texto;
        body.appendChild(div);
        body.scrollTop = body.scrollHeight;
    }

    function mostrarChips(opciones, onClick) {
        const quick = document.getElementById('chatbot-quick');
        quick.innerHTML = '';
        opciones.forEach((op) => {
            const chip = document.createElement('button');
            chip.className = 'chip';
            chip.textContent = op.etiqueta || op;
            chip.addEventListener('click', () => onClick(op.valor !== undefined ? op.valor : op));
            quick.appendChild(chip);
        });
    }

    async function cargarCategorias() {
        if (CATEGORIAS.length) return;
        try { CATEGORIAS = await api('/categorias'); } catch { CATEGORIAS = []; }
    }

    function iniciarConversacion() {
        estado = { uso: null, presupuesto: null, categoria: null };
        agregarMensaje('¡Hola! Puedo ayudarte a encontrar el equipo ideal según lo que buscas y tu presupuesto. ¿Para qué lo necesitas?');
        mostrarChips(USOS, (uso) => {
            estado.uso = uso;
            agregarMensaje(USOS.find((u) => u.valor === uso).etiqueta, 'user');
            preguntarCategoria();
        });
    }

    async function preguntarCategoria() {
        await cargarCategorias();
        if (!CATEGORIAS.length) return preguntarPresupuesto();
        agregarMensaje('¿Buscas algo en particular?');
        const opciones = [{ valor: '', etiqueta: 'Cualquier tipo' }]
            .concat(CATEGORIAS.map((c) => ({ valor: c.nombre, etiqueta: c.nombre })));
        mostrarChips(opciones, (categoria) => {
            estado.categoria = categoria || null;
            agregarMensaje(categoria || 'Cualquier tipo', 'user');
            preguntarPresupuesto();
        });
    }

    function preguntarPresupuesto() {
        agregarMensaje('Perfecto. ¿Cuál es tu presupuesto aproximado?');
        mostrarChips(PRESUPUESTOS.map((p) => ({ valor: p, etiqueta: `Hasta $${p.toLocaleString('es-MX')}` })), (presupuesto) => {
            estado.presupuesto = presupuesto;
            agregarMensaje(`Hasta $${Number(presupuesto).toLocaleString('es-MX')}`, 'user');
            buscarRecomendaciones();
        });
    }

    async function buscarRecomendaciones(mensajeLibre) {
        document.getElementById('chatbot-quick').innerHTML = '';
        agregarMensaje('Buscando en inventario disponible...', 'bot');
        try {
            const cliente = window.Sesion ? Sesion.cliente() : null;
            const data = await api('/chatbot/recomendar', {
                method: 'POST',
                body: {
                    uso: estado.uso,
                    presupuesto: estado.presupuesto,
                    categoria: estado.categoria,
                    mensaje: mensajeLibre || null,
                    cliente_id: cliente ? cliente.id : null,
                },
            });
            agregarMensaje(data.respuesta, 'bot');
            const body = document.getElementById('chatbot-body');
            data.sugerencias.forEach((p) => {
                const card = document.createElement('div');
                card.className = 'chat-suggestion';
                card.innerHTML = `
                    <img src="${p.imagen_url || '/img/producto.svg'}" referrerpolicy="no-referrer" alt="${p.nombre}" onerror="this.onerror=null;this.src='/img/producto.svg'" />
                    <div style="flex:1">
                        <div class="name">${p.nombre}</div>
                        <div class="price">${formatoMoneda(p.precio)} · stock: ${p.stock}</div>
                        <div class="chat-sug-actions">
                            <button class="chip" data-ver>Ver ficha</button>
                            <button class="chip" data-add ${p.stock === 0 ? 'disabled' : ''}>+ Carrito</button>
                        </div>
                    </div>
                `;
                card.querySelector('[data-ver]').addEventListener('click', (e) => {
                    e.stopPropagation();
                    window.location.href = `/index.html#producto-${p.id}`;
                });
                card.querySelector('[data-add]').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const cli = window.Sesion ? Sesion.cliente() : null;
                    if (!cli) { window.irALogin ? irALogin() : (location.href = '/login.html'); return; }
                    try {
                        await api('/carrito', { method: 'POST', body: { cliente_id: cli.id, producto_id: p.id, cantidad: 1 } });
                        if (window.actualizarBadgeCarrito) actualizarBadgeCarrito();
                        window.toast ? toast('Agregado al carrito', 'ok') : agregarMensaje('Agregado al carrito', 'bot');
                    } catch (err) {
                        window.toast ? toast(err.message, 'error') : agregarMensaje(err.message, 'bot');
                    }
                });
                card.querySelector('img').addEventListener('click', () => { window.location.href = `/index.html#producto-${p.id}`; });
                body.appendChild(card);
            });
            body.scrollTop = body.scrollHeight;
            mostrarChips([{ etiqueta: 'Buscar otra vez' }], () => {
                iniciarConversacion();
            });
        } catch (err) {
            agregarMensaje('Tuve un problema buscando recomendaciones. Intenta de nuevo en un momento.');
        }
    }

    function enviarTexto() {
        const input = document.getElementById('chatbot-text');
        const texto = input.value.trim();
        if (!texto) return;
        agregarMensaje(texto, 'user');
        input.value = '';

        // Intenta interpretar un presupuesto numérico del texto libre
        const numero = texto.replace(/[^0-9]/g, '');
        if (numero && Number(numero) > 500) estado.presupuesto = Number(numero);

        if (!estado.uso) {
            agregarMensaje('Cuéntame, ¿para qué lo vas a usar principalmente?');
            mostrarChips(USOS, (uso) => {
                estado.uso = uso;
                agregarMensaje(USOS.find((u) => u.valor === uso).etiqueta, 'user');
                buscarRecomendaciones(texto);
            });
        } else {
            buscarRecomendaciones(texto);
        }
    }

    document.addEventListener('DOMContentLoaded', crearWidget);
})();

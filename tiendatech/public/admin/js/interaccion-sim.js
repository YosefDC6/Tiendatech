// public/admin/js/interaccion-sim.js
// Simulador de interacciones para el CRM: llamada, correo, reunión, chat y
// soporte. Cada panel arma una descripción y llama a onGuardar(tipo, desc).
//
//   simuladorInteraccion({
//     cliente:  { id, nombre, correo, telefono },   // cliente fijo, o
//     clientes: [ {id,nombre,correo,telefono}, ... ], // lista para elegir
//     tipoInicial: 'llamada',
//     onGuardar: async (tipo, descripcion) => { ... }  // hace el POST
//   })
(function () {
    const TIPOS = [
        { k: 'llamada', label: 'Llamada', ic: 'phone' },
        { k: 'correo',  label: 'Correo',  ic: 'mail' },
        { k: 'reunion', label: 'Reunión', ic: 'calendar' },
        { k: 'chat',    label: 'Chat',    ic: 'chat' },
        { k: 'soporte', label: 'Soporte', ic: 'shield' },
    ];
    const ic = (n, s) => (window.icon ? window.icon(n, s) : '');

    let modal, cfg, cliente, tipo, timerInt;

    function abrir(opts) {
        cfg = opts || {};
        cliente = cfg.cliente || (cfg.clientes && cfg.clientes[0]) || null;
        tipo = cfg.tipoInicial || 'llamada';
        if (!modal) {
            modal = document.createElement('div');
            modal.className = 'modal-overlay';
            modal.id = 'sim-modal';
            modal.innerHTML = '<div class="modal sim-modal" id="sim-body"></div>';
            document.body.appendChild(modal);
        }
        modal.classList.add('open');
        render();
    }
    function cerrar() {
        if (timerInt) clearInterval(timerInt);
        timerInt = null;
        modal.classList.remove('open');
    }
    window.simuladorInteraccion = abrir;

    function render() {
        const b = document.getElementById('sim-body');
        const selCliente = (cfg.clientes && !cfg.cliente)
            ? `<div class="field"><label>Cliente</label>
                 <select id="sim-cli" onchange="__simSetCliente(this.value)">
                   ${cfg.clientes.map((c) => `<option value="${c.id}" ${cliente && c.id === cliente.id ? 'selected' : ''}>${c.nombre} — ${c.correo || ''}</option>`).join('')}
                 </select>
               </div>`
            : `<p class="sim-cli-fijo">${ic('user', 14)} ${cliente ? cliente.nombre : ''}</p>`;

        b.innerHTML = `
            <button class="modal-close" onclick="__simCerrar()">${ic('x', 18)}</button>
            <h3>Nueva interacción</h3>
            ${selCliente}
            <div class="sim-tipos">
                ${TIPOS.map((t) => `<button class="sim-tipo ${t.k === tipo ? 'on' : ''}" onclick="__simTipo('${t.k}')">${ic(t.ic, 16)} ${t.label}</button>`).join('')}
            </div>
            <div class="sim-panel" id="sim-panel"></div>
        `;
        panel();
    }

    window.__simCerrar = cerrar;
    window.__simTipo = (t) => {
        if (timerInt) { clearInterval(timerInt); timerInt = null; }
        tipo = t;
        document.querySelectorAll('.sim-tipo').forEach((el, i) => el.classList.toggle('on', TIPOS[i].k === t));
        panel();
    };
    window.__simSetCliente = (id) => { cliente = cfg.clientes.find((c) => String(c.id) === String(id)); panel(); };

    async function guardar(descripcion) {
        if (!cliente) { toast('Elige un cliente', 'warn'); return; }
        if (!descripcion || !descripcion.trim()) { toast('Falta la información de la interacción', 'warn'); return; }
        try {
            await cfg.onGuardar(tipo, descripcion.trim(), cliente);
            toast('Interacción registrada', 'ok');
            cerrar();
            if (cfg.despues) cfg.despues();
        } catch (e) { toast(e.message || 'No se pudo registrar', 'error'); }
    }
    window.__simGuardar = guardar;

    function panel() {
        const p = document.getElementById('sim-panel');
        if (!p) return;
        if (tipo === 'llamada') p.innerHTML = panelLlamada();
        else if (tipo === 'correo') p.innerHTML = panelCorreo();
        else if (tipo === 'reunion') p.innerHTML = panelReunion();
        else if (tipo === 'chat') p.innerHTML = panelChat();
        else p.innerHTML = panelSoporte();
    }

    /* ---------- LLAMADA ---------- */
    let llamadaSeg = 0, llamadaEstado = 'idle';
    function panelLlamada() {
        llamadaSeg = 0; llamadaEstado = 'idle';
        const tel = (cliente && cliente.telefono) || 'sin teléfono';
        return `
            <div class="sim-call" id="sim-call">
                <div class="sc-num">${ic('phone', 22)}<span>${tel}</span></div>
                <div class="sc-estado" id="sc-estado">Listo para llamar a ${cliente ? cliente.nombre.split(' ')[0] : ''}</div>
                <div class="sc-timer" id="sc-timer" hidden>00:00</div>
                <div id="sc-controls">
                    <button class="btn btn-primary sc-llamar" onclick="__simCallStart()">${ic('phone', 16)} Iniciar llamada</button>
                </div>
                <div id="sc-cierre" hidden>
                    <label class="sim-lbl">Resultado</label>
                    <div class="sim-chips" id="sc-res">
                        ${['Contestó', 'No contestó', 'Buzón de voz'].map((r, i) => `<button class="sim-chip ${i === 0 ? 'on' : ''}" onclick="__simPick(this,'sc-res')">${r}</button>`).join('')}
                    </div>
                    <textarea id="sc-notas" rows="3" placeholder="Notas de la llamada (acuerdos, siguiente paso)…"></textarea>
                    <button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="__simCallSave()">Guardar en el historial</button>
                </div>
            </div>`;
    }
    window.__simCallStart = () => {
        llamadaEstado = 'llamando';
        document.getElementById('sc-estado').innerHTML = '<span class="sc-dot"></span> Llamando…';
        document.getElementById('sc-controls').innerHTML = `<button class="btn btn-danger sc-colgar" onclick="__simCallEnd()">${ic('x', 16)} Colgar</button>`;
        setTimeout(() => {
            if (llamadaEstado !== 'llamando') return;
            llamadaEstado = 'en_llamada';
            document.getElementById('sc-estado').textContent = 'En llamada';
            const t = document.getElementById('sc-timer'); t.hidden = false;
            timerInt = setInterval(() => {
                llamadaSeg++;
                t.textContent = String(Math.floor(llamadaSeg / 60)).padStart(2, '0') + ':' + String(llamadaSeg % 60).padStart(2, '0');
            }, 1000);
        }, 1600);
    };
    window.__simCallEnd = () => {
        if (timerInt) { clearInterval(timerInt); timerInt = null; }
        const conecto = llamadaEstado === 'en_llamada';
        llamadaEstado = 'fin';
        document.getElementById('sc-estado').textContent = conecto ? 'Llamada finalizada' : 'Llamada sin respuesta';
        document.getElementById('sc-controls').innerHTML = '';
        const cierre = document.getElementById('sc-cierre'); cierre.hidden = false;
        if (!conecto) {
            const chips = cierre.querySelectorAll('#sc-res .sim-chip');
            chips.forEach((c) => c.classList.remove('on'));
            chips[1].classList.add('on');
        }
    };
    window.__simCallSave = () => {
        const tel = (cliente && cliente.telefono) || 's/n';
        const dur = String(Math.floor(llamadaSeg / 60)).padStart(2, '0') + ':' + String(llamadaSeg % 60).padStart(2, '0');
        const res = document.querySelector('#sc-res .sim-chip.on')?.textContent || 'No contestó';
        const notas = document.getElementById('sc-notas').value.trim();
        guardar(`Llamada saliente a ${tel} — duración ${dur}. Resultado: ${res}.${notas ? ' ' + notas : ''}`);
    };

    /* ---------- CORREO ---------- */
    const PLANTILLAS = {
        '': { asunto: '', cuerpo: '' },
        seguimiento: { asunto: 'Seguimiento a tu compra en TiendaTech', cuerpo: 'Hola {nombre},\n\nQueremos saber si todo salió bien con tu pedido y si necesitas ayuda con la instalación o configuración.\n\nQuedamos atentos.\nEquipo TiendaTech' },
        cotizacion: { asunto: 'Cotización solicitada', cuerpo: 'Hola {nombre},\n\nAdjuntamos la cotización con los equipos que revisamos, precios y tiempos de entrega. La cotización es válida por 15 días.\n\nSaludos,\nEquipo TiendaTech' },
        bienvenida: { asunto: 'Bienvenido al Club TiendaTech', cuerpo: 'Hola {nombre},\n\nTu cuenta ya está activa. Con cada compra acumulas puntos que valen dinero en la tienda y puedes seguir tus pedidos desde tu perfil.\n\n¡Gracias por elegirnos!' },
        recordatorio: { asunto: 'Recordatorio de pago pendiente', cuerpo: 'Hola {nombre},\n\nTu pedido está apartado y solo falta completar el pago con la referencia que te compartimos. Si ya lo realizaste, ignora este mensaje.\n\nGracias.' },
    };
    function panelCorreo() {
        return `
            <div class="sim-mail">
                <div class="field"><label>Para</label><input value="${(cliente && cliente.correo) || ''}" readonly /></div>
                <div class="field"><label>Plantilla</label>
                    <select id="sm-plantilla" onchange="__simPlantilla()">
                        <option value="">Escribir desde cero</option>
                        <option value="seguimiento">Seguimiento post-venta</option>
                        <option value="cotizacion">Envío de cotización</option>
                        <option value="bienvenida">Bienvenida / alta de cuenta</option>
                        <option value="recordatorio">Recordatorio de pago</option>
                    </select>
                </div>
                <div class="field"><label>Asunto</label><input id="sm-asunto" /></div>
                <div class="field"><label>Mensaje</label><textarea id="sm-cuerpo" rows="6"></textarea></div>
                <button class="btn btn-primary" style="width:100%" onclick="__simMailSend()">${ic('chat', 15)} Enviar correo</button>
            </div>`;
    }
    window.__simPlantilla = () => {
        const t = PLANTILLAS[document.getElementById('sm-plantilla').value] || PLANTILLAS[''];
        const nom = cliente ? cliente.nombre.split(' ')[0] : '';
        document.getElementById('sm-asunto').value = t.asunto;
        document.getElementById('sm-cuerpo').value = t.cuerpo.replace('{nombre}', nom);
    };
    window.__simMailSend = () => {
        const asunto = document.getElementById('sm-asunto').value.trim();
        const cuerpo = document.getElementById('sm-cuerpo').value.trim();
        if (!asunto) { toast('Escribe el asunto', 'warn'); return; }
        toast('Correo enviado (simulado)', 'ok');
        const resumen = cuerpo.replace(/\s+/g, ' ').slice(0, 140);
        guardar(`Correo enviado a ${(cliente && cliente.correo) || ''} — Asunto: "${asunto}". ${resumen}`);
    };

    /* ---------- REUNIÓN ---------- */
    function panelReunion() {
        const man = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
        return `
            <div class="sim-meet">
                <div class="field-row">
                    <div class="field"><label>Fecha</label><input type="date" id="sr-fecha" value="${man}" /></div>
                    <div class="field"><label>Hora</label><input type="time" id="sr-hora" value="10:00" /></div>
                </div>
                <div class="field"><label>Modalidad</label>
                    <select id="sr-mod"><option>Videollamada</option><option>Presencial</option><option>Teléfono</option></select>
                </div>
                <div class="field"><label>Agenda / objetivo</label><textarea id="sr-agenda" rows="3" placeholder="Temas a tratar, equipos de interés, presupuesto…"></textarea></div>
                <button class="btn btn-primary" style="width:100%" onclick="__simMeetSave()">${ic('clock', 15)} Agendar reunión</button>
            </div>`;
    }
    window.__simMeetSave = () => {
        const f = document.getElementById('sr-fecha').value;
        const h = document.getElementById('sr-hora').value;
        const m = document.getElementById('sr-mod').value;
        const a = document.getElementById('sr-agenda').value.trim();
        if (!f || !h) { toast('Elige fecha y hora', 'warn'); return; }
        const fBonita = new Date(f + 'T' + h).toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' });
        guardar(`Reunión agendada para ${fBonita} (${m}).${a ? ' Agenda: ' + a : ''}`);
    };

    /* ---------- CHAT ---------- */
    let chatMsgs = [];
    const RESP_CLIENTE = ['Sí, claro.', 'De acuerdo, gracias.', 'Perfecto, lo reviso.', 'Muchas gracias por la ayuda.'];
    function panelChat() {
        chatMsgs = [];
        return `
            <div class="sim-chat">
                <div class="sch-log" id="sch-log"><div class="sch-vacio">Escribe o usa una respuesta rápida para iniciar la conversación.</div></div>
                <div class="sim-chips">
                    ${['Hola, ¿en qué te puedo ayudar?', 'Con gusto reviso tu pedido.', '¿Hay algo más en lo que pueda apoyarte?'].map((q) => `<button class="sim-chip" onclick="__simChatSend('${q.replace(/'/g, "\\'")}')">${q}</button>`).join('')}
                </div>
                <div class="sch-input">
                    <input id="sch-txt" placeholder="Escribe un mensaje…" onkeydown="if(event.key==='Enter')__simChatSend()" />
                    <button class="btn btn-outline btn-sm" onclick="__simChatSend()">Enviar</button>
                </div>
                <button class="btn btn-primary" style="width:100%;margin-top:10px" onclick="__simChatSave()">Cerrar chat y guardar</button>
            </div>`;
    }
    window.__simChatSend = (texto) => {
        const inp = document.getElementById('sch-txt');
        const t = (texto || (inp && inp.value) || '').trim();
        if (!t) return;
        if (inp && !texto) inp.value = '';
        chatMsgs.push({ de: 'agente', t });
        pintarChat();
        setTimeout(() => {
            chatMsgs.push({ de: 'cliente', t: RESP_CLIENTE[chatMsgs.length % RESP_CLIENTE.length] });
            pintarChat();
        }, 700);
    };
    function pintarChat() {
        const log = document.getElementById('sch-log');
        if (!log) return;
        log.innerHTML = chatMsgs.map((m) => `<div class="sch-msg ${m.de}">${m.t}</div>`).join('');
        log.scrollTop = log.scrollHeight;
    }
    window.__simChatSave = () => {
        const nAg = chatMsgs.filter((m) => m.de === 'agente').length;
        if (nAg === 0) { toast('Envía al menos un mensaje', 'warn'); return; }
        const ultimo = [...chatMsgs].reverse().find((m) => m.de === 'agente');
        guardar(`Chat de atención — ${chatMsgs.length} mensajes. Último del equipo: "${ultimo.t}"`);
    };

    /* ---------- SOPORTE ---------- */
    function panelSoporte() {
        return `
            <div class="sim-sop">
                <div class="field"><label>Prioridad</label>
                    <select id="ss-prio"><option>Media</option><option>Alta</option><option>Baja</option></select>
                </div>
                <div class="field"><label>Nota de la atención</label><textarea id="ss-nota" rows="4" placeholder="Motivo del contacto, diagnóstico, solución o siguiente paso…"></textarea></div>
                <p style="font-size:.8rem;color:var(--text-muted)">Para dar seguimiento formal con folio, usa el <a href="/admin/soporte.html">gestor de tickets</a>.</p>
                <button class="btn btn-primary" style="width:100%" onclick="__simSopSave()">Guardar nota</button>
            </div>`;
    }
    window.__simSopSave = () => {
        const prio = document.getElementById('ss-prio').value;
        const nota = document.getElementById('ss-nota').value.trim();
        if (!nota) { toast('Escribe la nota', 'warn'); return; }
        guardar(`Nota de soporte (prioridad ${prio}): ${nota}`);
    };

    /* ---------- util chips ---------- */
    window.__simPick = (el, cont) => {
        document.querySelectorAll('#' + cont + ' .sim-chip').forEach((c) => c.classList.remove('on'));
        el.classList.add('on');
    };
})();

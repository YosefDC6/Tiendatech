// public/js/recibo-render.js
// Arma el HTML del comprobante/ficha de pago a partir de la respuesta de
// GET /api/pedidos/:id/recibo. Lo usan recibo.html (cliente) y
// admin/recibo.html (panel). Requiere icons.js y qrcode.min.js.
(function () {
    const ESTADO_LABEL = { pendiente: 'Pendiente', confirmado: 'Confirmado', procesando: 'En preparación', enviado: 'Enviado', entregado: 'Entregado', cancelado: 'Cancelado' };
    const money = (v) => Number(v || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
    const fechaHora = (d) => d ? new Date(d).toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' }) : '—';
    const fecha = (d) => d ? new Date(d).toLocaleDateString('es-MX', { dateStyle: 'long' }) : '—';
    const ic = (n, s) => (window.icon ? window.icon(n, s) : '');

    function qrSVG(texto) {
        try { const q = qrcode(0, 'M'); q.addData(texto); q.make(); return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); }
        catch (e) { return ''; }
    }

    window.renderRecibo = function (d) {
        const pendiente = d.pago_estado === 'pendiente';
        const esSPEI = /spei/i.test(d.metodo_pago || '');
        const titulo = pendiente ? 'Ficha de pago' : 'Comprobante de compra';

        let bloquePago;
        if (pendiente) {
            const filasPago = esSPEI ? `
                <tr><td>Banco</td><td>${d.emisor.banco}</td></tr>
                <tr><td>Beneficiario</td><td>${d.emisor.beneficiario}</td></tr>
                <tr><td>CLABE</td><td class="mono">${d.emisor.clabe}</td></tr>
                <tr><td>Concepto / Referencia</td><td class="mono">${d.pago_referencia}</td></tr>
                <tr><td>Monto exacto</td><td><strong>${money(d.total)}</strong></td></tr>
                <tr><td>Fecha límite</td><td>${fecha(d.pago_vence)}</td></tr>
            ` : `
                <tr><td>Código de pago</td><td class="mono">${d.pago_referencia}</td></tr>
                <tr><td>Monto a pagar</td><td><strong>${money(d.total)}</strong></td></tr>
                <tr><td>Válido hasta</td><td>${fecha(d.pago_vence)}</td></tr>
            `;
            bloquePago = `
                <div class="rec-pago pendiente">
                    <h3>${ic('alert', 16)} Pago pendiente</h3>
                    <p>${esSPEI
                        ? 'Realiza una transferencia SPEI con los datos siguientes. El pedido se confirma al recibir el pago.'
                        : 'Presenta este código en la caja de cualquier sucursal para pagar en efectivo o con tarjeta. El pedido se confirma al recibir el pago.'}</p>
                    <div class="rec-pago-grid">
                        <table class="rec-kv">${filasPago}</table>
                        ${!esSPEI ? `<div class="rec-qr">${qrSVG(d.pago_referencia)}<span>Escanéalo en caja</span></div>` : ''}
                    </div>
                </div>`;
        } else {
            bloquePago = `
                <div class="rec-pago pagado">
                    <h3>${ic('check', 16)} Pago confirmado</h3>
                    <p>Método: ${d.metodo_pago || '—'} · ${fechaHora(d.fecha_confirmacion || d.fecha_pedido)}</p>
                </div>`;
        }

        const gar = (d.garantias && d.garantias.length) ? `
            <div class="rec-gar">
                <h4>Garantías extendidas</h4>
                <table class="rec-kv">
                    ${d.garantias.map((g) => `
                        <tr><td>${g.producto || 'Producto'}</td><td>${g.plan} · vence ${fecha(g.vence)}</td></tr>
                        <tr><td>Folio</td><td class="mono">${g.folio}</td></tr>
                        <tr><td>Código para validar</td><td class="mono">${g.codigo}</td></tr>
                    `).join('')}
                </table>
                <p style="font-size:.78rem;color:var(--text-muted);margin:6px 0 0">Presenta el código en servicio para hacer válida la garantía.</p>
            </div>` : '';

        const puntos = (Number(d.puntos_ganados) > 0 || Number(d.puntos_canjeados) > 0) ? `
            <div class="rec-puntos">
                ${Number(d.puntos_canjeados) > 0 ? `<span>Canjeó <strong>${d.puntos_canjeados}</strong> puntos (−${money(d.descuento)})</span>` : ''}
                ${Number(d.puntos_ganados) > 0 ? `<span>Ganó <strong>${d.puntos_ganados}</strong> puntos del Club</span>` : ''}
                ${pendiente ? '<span class="rec-nota">Los puntos ganados se acreditan al confirmarse el pago.</span>' : ''}
            </div>` : '';

        return `
            <div class="recibo">
                <div class="rec-top">
                    <div>
                        <div class="rec-marca">${ic('bolt', 16)} TiendaTech</div>
                        <div class="rec-emisor">${d.emisor.nombre}<br>RFC ${d.emisor.rfc}<br>${d.emisor.domicilio}</div>
                    </div>
                    <div class="rec-folio">
                        <span class="rec-doc-tipo">${titulo}</span>
                        <span class="rec-num mono">${d.numero_orden}</span>
                        <span>${fechaHora(d.fecha_pedido)}</span>
                        <span class="tag">${ESTADO_LABEL[d.estado] || d.estado}</span>
                    </div>
                </div>

                <div class="rec-partes">
                    <div><h4>Cliente</h4><p>${d.cliente_nombre}<br>${d.cliente_correo}</p></div>
                    <div><h4>Envío a</h4><p>${d.direccion_envio || '—'}</p></div>
                </div>

                <table class="rec-items">
                    <thead><tr><th>Producto</th><th>Cant.</th><th>P. unit.</th><th>Importe</th></tr></thead>
                    <tbody>
                        ${d.items.map((i) => `<tr>
                            <td>${i.nombre}</td>
                            <td class="mono">${i.cantidad}</td>
                            <td class="mono">${money(i.precio_unitario)}</td>
                            <td class="mono">${money(i.subtotal)}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>

                <div class="rec-tot">
                    <div><span>Subtotal</span><span class="mono">${money(d.subtotal)}</span></div>
                    <div><span>IVA (16%)</span><span class="mono">${money(d.impuestos)}</span></div>
                    <div><span>Envío</span><span class="mono">${Number(d.envio) === 0 ? 'Gratis' : money(d.envio)}</span></div>
                    ${Number(d.descuento) > 0 ? `<div class="rec-desc"><span>Descuento Club de puntos</span><span class="mono">−${money(d.descuento)}</span></div>` : ''}
                    <div class="rec-total"><span>Total</span><span class="mono">${money(d.total)}</span></div>
                </div>

                ${bloquePago}
                ${gar}
                ${puntos}

                <p class="rec-pie">Comprobante generado por TiendaTech. Documento sin validez fiscal (demo educativa).</p>
            </div>`;
    };
})();

// public/js/toast.js
// Notificaciones tipo "toast" y un confirm() con estilo, para no
// depender de los alert()/confirm() feos del navegador.

(function () {
    function contenedor() {
        let c = document.getElementById('toast-container');
        if (!c) {
            c = document.createElement('div');
            c.id = 'toast-container';
            document.body.appendChild(c);
        }
        return c;
    }

    window.toast = function (mensaje, tipo = 'info', ms = 3200) {
        const el = document.createElement('div');
        el.className = `toast toast-${tipo}`;
        const nombre = { ok: 'check', error: 'x', info: 'info', warn: 'alert' }[tipo] || 'info';
        const svg = window.icon ? icon(nombre, 16) : '';
        el.innerHTML = `<span class="toast-ico">${svg}</span><span>${mensaje}</span>`;
        contenedor().appendChild(el);
        requestAnimationFrame(() => el.classList.add('show'));
        setTimeout(() => {
            el.classList.remove('show');
            setTimeout(() => el.remove(), 250);
        }, ms);
    };

    // confirm() con promesa: const ok = await confirmar('¿Seguro?');
    window.confirmar = function (mensaje, { okText = 'Confirmar', cancelText = 'Cancelar', peligro = false } = {}) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'confirm-overlay';
            overlay.innerHTML = `
                <div class="confirm-box">
                    <p>${mensaje}</p>
                    <div class="confirm-actions">
                        <button class="btn btn-outline btn-sm" data-x>${cancelText}</button>
                        <button class="btn ${peligro ? 'btn-danger' : 'btn-primary'} btn-sm" data-ok>${okText}</button>
                    </div>
                </div>`;
            document.body.appendChild(overlay);
            requestAnimationFrame(() => overlay.classList.add('open'));
            const cerrar = (val) => { overlay.classList.remove('open'); setTimeout(() => overlay.remove(), 200); resolve(val); };
            overlay.querySelector('[data-ok]').addEventListener('click', () => cerrar(true));
            overlay.querySelector('[data-x]').addEventListener('click', () => cerrar(false));
            overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrar(false); });
        });
    };

    // prompt() con promesa y estilo. Devuelve el texto o null si se cancela.
    window.pedirDato = function (mensaje, { placeholder = '', tipo = 'text', okText = 'Aceptar', valorInicial = '' } = {}) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'confirm-overlay';
            overlay.innerHTML = `
                <div class="confirm-box">
                    <p>${mensaje}</p>
                    <input type="${tipo}" class="pd-input" placeholder="${placeholder}" value="${valorInicial}" style="margin-bottom:16px" />
                    <div class="confirm-actions">
                        <button class="btn btn-outline btn-sm" data-x>Cancelar</button>
                        <button class="btn btn-primary btn-sm" data-ok>${okText}</button>
                    </div>
                </div>`;
            document.body.appendChild(overlay);
            requestAnimationFrame(() => overlay.classList.add('open'));
            const input = overlay.querySelector('.pd-input');
            setTimeout(() => input.focus(), 50);
            const cerrar = (val) => { overlay.classList.remove('open'); setTimeout(() => overlay.remove(), 200); resolve(val); };
            overlay.querySelector('[data-ok]').addEventListener('click', () => cerrar(input.value.trim() || null));
            overlay.querySelector('[data-x]').addEventListener('click', () => cerrar(null));
            input.addEventListener('keydown', (e) => { if (e.key === 'Enter') cerrar(input.value.trim() || null); });
            overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrar(null); });
        });
    };
})();

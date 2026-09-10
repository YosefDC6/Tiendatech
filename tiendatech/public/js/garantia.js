// public/js/garantia.js
// Planes de garantía extendida (solo para mostrar en el catálogo y el
// carrito). El costo real lo recalcula y guarda el servidor.
// Debe estar en sincronía con PLANES_GARANTIA en server.js.
(function () {
    window.PLANES_GARANTIA = [
        { clave: 'none', label: 'Sin garantía extendida', corto: 'Sin garantía',  meses: 0,  factor: 0 },
        { clave: 'b12',  label: 'Básica · 12 meses',       corto: 'Básica 12m',    meses: 12, factor: 0.06 },
        { clave: 'e24',  label: 'Extendida · 24 meses',    corto: 'Extendida 24m', meses: 24, factor: 0.12 },
        { clave: 't36',  label: 'Total · 36 meses',        corto: 'Total 36m',     meses: 36, factor: 0.18 },
    ];
    window.planGarantia = (clave) =>
        PLANES_GARANTIA.find((p) => p.clave === clave) || PLANES_GARANTIA[0];
    window.costoGarantia = (precio, clave) =>
        Math.round(Number(precio || 0) * planGarantia(clave).factor);
})();

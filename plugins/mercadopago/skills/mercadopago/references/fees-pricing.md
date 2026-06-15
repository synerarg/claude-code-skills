# Comisiones y liberacion de dinero

Como cobra Mercado Pago y como afecta a tu integracion. **No hardcodear porcentajes**: las
tarifas son informacion comercial, cambian seguido y varian por pais y producto. Esta
referencia explica el **modelo**; los numeros vigentes se consultan siempre en la fuente oficial.

> Verificado via MCP (`search_documentation`, 2026-06-15).

---

## Que define la comision

La comision por recibir un pago depende de:

1. **Pais** (ARS, BRL, MXN, CLP, COP, PEN, UYU tienen tarifas distintas).
2. **Medio de pago** (tarjeta de credito, debito, dinero en cuenta MP, efectivo, etc.).
3. **Plazo de liberacion del dinero** (release timing): cuanto **antes** recibis el dinero,
   **mayor** es la comision. Las opciones tipicas: al instante, en algunos dias, o al cobrar.

La comision se **descuenta automaticamente** del monto recibido: vos cobras el bruto y MP
acredita el neto. No tenes que calcular ni cobrar nada extra al comprador por esto.

---

## Liberacion de dinero (release / "acreditacion")

- "Liberacion de dinero" = cuando tu saldo pasa de **pendiente** a **disponible** para retirar.
- Es **configurable** (plazos y, segun el caso, tarifa asociada) desde el panel de MP / panel
  administrativo. En plataformas (ej. Shopify) se configura por medio de pago.
- Trade-off: liberacion mas rapida = comision mas alta. Elegir segun el flujo de caja del negocio.
- En la API, el campo `binary_mode=true` fuerza aprobacion/rechazo **inmediato** (sin estado
  `pending` / `in_process`); es distinto de la liberacion del dinero, pero suele confundirse.

---

## Comisiones extra a tener en cuenta

| Concepto | Cuando aplica | Donde |
|----------|---------------|-------|
| Comision de MP | Siempre, por recibir el pago | Automatica, sobre el monto |
| Comision de marketplace | Si cobras para terceros | `marketplace_fee` / `application_fee` (ver `references/marketplace-split.md`). Se descuenta **despues** de la de MP |
| Costo de liberacion anticipada | Si elegis acreditar mas rapido | Config de liberacion de dinero |
| Cuotas sin interes (vendedor) | Si ofreces cuotas y absorbes el interes | Config de cuotas/MSI |

> Las **devoluciones** (`refunds`) devuelven el dinero al comprador; el tratamiento de la
> comision ya cobrada depende del pais/medio. Ver `references/refunds-cancellations.md` y
> confirmar con `search_documentation`.

---

## Donde ver las tarifas vigentes (no inventar numeros)

1. **Panel de Mercado Pago** -> seccion **Costos** / **Tarifas** de tu cuenta (muestra los % por
   medio de pago y plazo de liberacion para tu pais).
2. **Pagina oficial de costos** del pais (ej. `mercadopago.com.ar` -> "Costos" / "Tu negocio").
3. **Via MCP / docs:** `search_documentation(term="costos comisiones", language="es", siteId="MLA")`
   (cambiar `siteId` por pais). Util para confirmar el modelo y los plazos de liberacion.

> Si el usuario pide "cuanto cobra MP", **no** des un porcentaje de memoria: traelo del panel o
> de la pagina de costos del pais, porque cambia.

---

## Conciliacion

- Reporte de **liquidaciones (settlement)**: como esta compuesto tu dinero disponible.
- Reporte de **todas las transacciones (release)**: operaciones que afectaron tu balance
  (incluye comisiones, retiros como `payout`, disputas como `dispute`).

Ambos figuran en el quality checklist como buenas practicas (`settlement`, `release`) — ver
`references/mcp-server.md`.

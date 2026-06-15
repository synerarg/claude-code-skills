# Marketplace / Split de pagos

El modelo **Marketplace** sirve cuando cobras **en nombre de terceros** (vendedores) y te
quedas con una comision. Mercado Pago reparte automaticamente el importe de **cada cobro**
entre el vendedor y el marketplace mediante el **split del pago**, sin accion del vendedor.

> Verificado via MCP (`search_documentation`, 2026-06-15). El flujo de vinculacion OAuth y los
> contratos exactos cambian por pais; confirmalos con `search_documentation(term="marketplace", ...)`.

---

## Como reparte el dinero

Orden de descuento sobre el importe del pago:
1. Primero se descuenta la **comision de Mercado Pago**.
2. Sobre el saldo restante se descuenta la **comision del marketplace** (la tuya).
3. El resto queda para el **vendedor**.

> La comision del marketplace se cobra sobre lo que queda despues de la comision de MP, no
> sobre el total bruto.

---

## Como se configura la comision

Depende de la modalidad de cobro:

| Modalidad | Parametro | Donde | API |
|-----------|-----------|-------|-----|
| **Checkout Pro** | `marketplace_fee` | en la **preferencia** | `POST /checkout/preferences` |
| **Checkout API / Transparente** | `application_fee` | en el **pago** | `POST /payments` |

### Checkout Pro (ejemplo)

```json
{
  "items": [{ "title": "Producto", "quantity": 1, "unit_price": 1000, "currency_id": "ARS" }],
  "marketplace_fee": 10
}
```

### Checkout API (ejemplo)

```json
{
  "transaction_amount": 1000,
  "token": "CARD_TOKEN",
  "payment_method_id": "visa",
  "payer": { "email": "comprador@email.com" },
  "application_fee": 10
}
```

`marketplace_fee` / `application_fee` es el **monto** que cobra el marketplace por esa
operacion (no un porcentaje del lado de la API: vos calculas el monto).

---

## Vinculacion del vendedor (OAuth)

Para cobrar en nombre de un vendedor, el vendedor primero **autoriza tu marketplace** via
**OAuth** (vinculacion de aplicaciones). A partir de ahi:

1. El vendedor conecta su cuenta MP a tu app (flujo OAuth -> obtienes su `access_token`).
2. Creas la preferencia (Checkout Pro) o el pago (Checkout API) con las **credenciales del
   vendedor** + tu `marketplace_fee` / `application_fee`.
3. MP hace el split automaticamente.

El topico de webhook **`mp-connect`** notifica eventos de vinculacion de aplicaciones
(ver `references/webhooks.md`). El detalle del flujo OAuth (scopes, endpoints de autorizacion
y de token) cambia por pais: tralo con `search_documentation(term="OAuth marketplace", ...)`.

---

## Reportes

Existe un **reporte de ventas con split de pagos**, configurable via API de forma **manual** o
**automatica** (con configuraciones previas). Util para conciliar lo que cobro el vendedor vs.
lo que retuvo el marketplace.

---

## Marketplace/split vs Money Out

- **Split/Marketplace:** reparte el dinero de **un cobro** entre vendedor y marketplace en el
  mismo momento del pago. No requiere aprobacion comercial especial mas alla de habilitar el
  modelo marketplace.
- **Money Out** (`references/money-out.md`): mueve dinero de **tu saldo** hacia afuera (cuentas
  bancarias / MP / Pix) cuando vos decidis, fuera del flujo de un cobro. Requiere autorizacion
  comercial.

Regla practica: para pagar a vendedores dentro de un cobro, usa **split**. Para payouts/cash
out arbitrarios, usa **Money Out**.

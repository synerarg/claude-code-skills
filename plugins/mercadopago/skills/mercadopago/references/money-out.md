# Money Out - Enviar dinero a cuentas bancarias y de MP

Money Out es la solucion de Mercado Pago para **enviar dinero** (no cobrarlo): retiros y
transferencias desde tu saldo MP hacia **cuentas bancarias**, **cuentas de Mercado Pago** o
via **Pix** (Brasil). Es lo opuesto a las integraciones de cobro (Checkout Pro/Bricks/Orders).

> Verificado via MCP (`search_documentation`, 2026-06-15). Los contratos exactos de campos y
> los endpoints por pais cambian; tralos al dia con `search_documentation(term="Money Out", ...)`
> o desde la API reference oficial antes de implementar.

---

## Requisitos previos (IMPORTANTE)

- **Autorizacion comercial:** Money Out **no es self-serve**. Necesitas aprobacion del area
  comercial de Mercado Pago antes de poder integrar. Sin esa habilitacion los endpoints no
  responden para tu cuenta.
- Requisitos por pais (ej.: en Brasil hay que registrar las **claves Pix** antes de integrar).
- **Cifrado punta a punta:** las transacciones Money Out exigen cifrar el request con un
  esquema de clave publica/privada (una clave cifra el request, otra lo valida).
- **Clave de idempotencia** obligatoria en cada request (`X-Idempotency-Key`).

---

## Como funciona

Se integra con **un solo llamado** a la API: la transaccion se crea y procesa en el mismo
request. Si la ejecucion es exitosa, el dinero queda disponible en la cuenta de destino sin
etapas adicionales.

Dos modalidades:
1. **Pix** (solo Brasil) - retiro/transferencia via clave Pix.
2. **Transferencia a cuentas de dinero** - cuentas **bancarias** o cuentas **Mercado Pago**.

### Endpoint principal

```http
POST https://api.mercadopago.com/v1/transaction-intents/process
Authorization: Bearer ACCESS_TOKEN
X-Idempotency-Key: <uuid-unico-por-transaccion>
Content-Type: application/json
```

### Endpoints de creacion por pais (cuenta bancaria)

| Pais | Reference |
|------|-----------|
| Argentina (MLA) | `/developers/es/reference/money-out/bank-transfer-mla/post` |
| Brasil (MLB) | `/developers/es/reference/money-out/bank-transfer-mlb/post` |
| Chile (MLC) | `/developers/es/reference/money-out/bank-transfer-mlc/post` |
| Mexico (MLM) | `/developers/es/reference/money-out/bank-transfer-mlm/post` |

Para transferencia a cuenta bancaria, primero **listar los bancos disponibles** con un `GET`
(con tu Access Token) y usar ese banco en el campo de destino.

### Campos clave del body (resumen)

| Campo | Descripcion |
|-------|-------------|
| `transaction.from.accounts.amount` | Monto a retirar de la cuenta origen. Min 0, max 10000000000. |
| `transaction.to.accounts.number` | Numero unico de la cuenta bancaria de destino. |
| `external_reference` | Tu referencia interna (y en modo test, define el `status` simulado). |

> El esquema completo (datos de titular, tipo de cuenta, banco, documento, etc.) varia por pais.
> Consultalo en la API reference del pais correspondiente.

---

## Estados de la transaccion

La respuesta trae `status` + `status_detail`. Algunos relevantes:

| status | status_detail | Significado / accion |
|--------|---------------|----------------------|
| `new` | - | Transaccion creada. |
| `rejected` | `by_bank` | El banco de destino rechazo la transferencia. Reintentar el llamado. |
| `rejected` | `by_provider` | El proveedor rechazo la transferencia. Reintentar el llamado. |

Consulta el resto de estados en la doc oficial (`search_documentation`).

---

## Pruebas (sandbox)

Money Out se prueba creando transacciones con **estados predefinidos**, controlados por el
campo `external_reference`: el valor que mandes determina el `status` que recibis (ej.
`external_reference=new` -> `status=new`).

```http
POST https://api.mercadopago.com/v1/transaction-intents/process
Authorization: Bearer TEST-ACCESS-TOKEN
X-Test-Token: true
X-Idempotency-Key: <uuid>
```

---

## Conciliacion / reportes

En los reportes de "dinero liberado", las transacciones de retiros/transferencias del saldo
aparecen como **`payout`** (y las mediaciones de reclamos como `dispute`). Util para conciliar
los envios de dinero.

---

## Cuando usar Money Out

- Pagar a proveedores, vendedores o usuarios (cash out / payouts).
- Devolver saldo a una cuenta bancaria.
- Complementa, pero **no** reemplaza, al **split de pagos / marketplace** (ver
  `references/marketplace-split.md`): el split reparte el dinero de UN cobro entre vendedor y
  marketplace automaticamente; Money Out mueve dinero de tu saldo hacia afuera cuando vos decidis.

> Para pagos a vendedores dentro de un flujo de cobro, evalua primero **marketplace/split**
> (mas simple, sin aprobacion comercial). Money Out conviene cuando necesitas mandar dinero
> fuera del flujo de un cobro puntual.

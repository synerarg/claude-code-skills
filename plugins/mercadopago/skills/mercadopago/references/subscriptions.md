# Suscripciones (Preapproval) - Pagos recurrentes

Para cobros **recurrentes** (membresias, SaaS, abonos). En Mercado Pago las suscripciones se
modelan con **preapproval** (la autorizacion de cobro recurrente del pagador), opcionalmente
asociada a un **preapproval_plan** (plantilla de plan reutilizable).

> Topicos de webhook **verificados** via el schema de `save_webhook` (MCP, 2026-06-15). El
> detalle de campos del body se confirma con `search_documentation(term="suscripciones", ...)`.

---

## Dos formas de integrar

| Modo | Cuando | Como |
|------|--------|------|
| **Con plan asociado** | Varios suscriptores al mismo plan (ej. "Plan Pro $X/mes") | Crear `preapproval_plan` una vez -> suscribir pagadores con `preapproval` referenciando el `plan_id` |
| **Sin plan** | Suscripcion unica/ad-hoc por pagador | Crear `preapproval` directo con la recurrencia embebida |

### Endpoints

```http
POST /preapproval_plan      # crear plan (plantilla)
POST /preapproval           # crear suscripcion (con o sin plan_id)
GET  /preapproval/{id}      # consultar estado
PUT  /preapproval/{id}      # pausar / cancelar / actualizar (status)
```

---

## Recurrencia (`auto_recurring`)

Campos tipicos del objeto `auto_recurring` (confirmar contrato exacto en la doc):

| Campo | Descripcion |
|-------|-------------|
| `frequency` | Numero (ej. `1`) |
| `frequency_type` | `months` o `days` |
| `transaction_amount` | Monto por ciclo |
| `currency_id` | `ARS`, `BRL`, etc. |
| `start_date` / `end_date` | ISO 8601 (opcionales) |
| `free_trial` | Periodo de prueba (opcional) |

Otros campos del `preapproval`: `reason` (nombre visible), `payer_email`, `back_url`,
`external_reference`, `status`, y `card_token_id` si cobras directo con tarjeta tokenizada.

---

## Dos experiencias de cobro

1. **Tipo Checkout Pro (redireccion):** creas el `preapproval` sin `card_token_id` y rediriges
   al pagador al `init_point` para que autorice y cargue su tarjeta en MP.
2. **API directa:** tokenizas la tarjeta en el frontend (MercadoPago.js V2 / Card Brick) y creas
   el `preapproval` con `card_token_id`, sin redireccion.

---

## Estados

| status | Significado |
|--------|-------------|
| `pending` | Creada, falta autorizacion / primer pago |
| `authorized` | Activa, cobrando segun la recurrencia |
| `paused` | Pausada (se puede reactivar via `PUT`) |
| `cancelled` | Cancelada (terminal) |

Pausar/cancelar: `PUT /preapproval/{id}` con `{ "status": "paused" | "cancelled" }`.

---

## Webhooks (topicos verificados)

Configurar en `save_webhook` (ver `references/mcp-server.md` y `references/webhooks.md`):

| Topico | Notifica |
|--------|----------|
| `subscription_preapproval` | Alta y cambios de la suscripcion (preapproval) |
| `subscription_preapproval_plan` | Cambios en el plan (preapproval_plan) |
| `subscription_authorized_payment` | **Cada cobro recurrente autorizado** (el pago de cada ciclo) |

Patron recomendado: ante `subscription_authorized_payment`, consultar el pago y registrar el
ciclo cobrado en tu DB (mismas reglas de idempotencia que en `references/webhooks.md`).

---

## Cuando usar Suscripciones vs otras modalidades

- **Suscripciones (preapproval):** cobro **recurrente** automatico. Es lo que buscas para
  membresias/abonos.
- Pagos **unicos** -> Checkout Pro / Bricks / Orders (`references/checkout-pro.md`, etc.).
- Recurrencia con logica muy custom (multiples medios, captura manual) -> evaluar **Orders API**
  (`references/orders-api.md`).

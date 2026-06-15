---
name: correo-argentino
description: Integración de envíos con Correo Argentino (apiMiCorreo) para ecommerce. Cubre autenticación y alta de cliente (token Basic Auth + registro y obtención del customerId), cotización, sucursales, creación de envíos, tracking, sincronización por cron, mapeo de estados a la orden, y emails de "en camino"/"entregado". Incluye los CONTRATOS REALES de la API verificados en producción y una arquitectura multi-tenant. Stack de referencia Next.js + Supabase/Postgres, pero los contratos aplican a cualquier stack.
---

# apiMiCorreo (Correo Argentino) — Guía de integración

Guía para integrar **apiMiCorreo** en un ecommerce de forma robusta y reutilizable. Está dividida en dos capas:

1. **Contratos REALES de la API** (secciones 1–4): comportamiento verificado empíricamente contra producción. Es independiente del stack y del proyecto. Tiene prioridad sobre cualquier suposición o doc desactualizada.
2. **Arquitectura recomendada** (secciones 5–12): cómo consumir esos contratos en un ecommerce, con foco **multi-tenant**. Los nombres de archivos/columnas/env son sugerencias: adaptalos a tu proyecto.

> Convención: en los ejemplos, `<...>` son placeholders. Reemplazá `<CUSTOMER_ID>`, `<USERNAME>`, etc. por los valores reales de **tu** cuenta. Nunca commitees credenciales ni datos personales.

### Referencias

- [`references/api-reference.md`](references/api-reference.md) — referencia detallada de cada endpoint (request/response/errores), payload completo de `/shipping/import` y tabla de códigos de provincia.
- [`references/multi-tenant.md`](references/multi-tenant.md) — esquema SQL completo, RLS, cifrado de secretos y cache de token por tenant.

---

## 1. Ambientes y autenticación

### Ambientes (la URL define el ambiente)

| Ambiente | Base URL |
|---|---|
| Homologación / test | `https://apitest.correoargentino.com.ar/micorreo/v1` |
| Producción | `https://api.correoargentino.com.ar/micorreo/v1` |

Las **mismas credenciales sirven para ambos ambientes**: el JWT que devuelve `/token` trae `"member of": "ApiMiCorreoTest"` o `"ApiMiCorreoProd"` según la URL que uses. La cuenta de cliente (y por lo tanto el `customerId`) es **la misma** para test y prod.

### `POST /token` usa HTTP Basic Auth (NO body JSON)

⚠️ Error muy común: mandar `{ username, password }` en el body → la API responde `401 "Header List is null or empty"`. El contrato real es Basic Auth, **sin body**:

```http
POST /token
Authorization: Basic base64(<USERNAME>:<PASSWORD>)
```

Respuesta:

```json
{ "token": "<JWT>", "expire": "YYYY-MM-DD HH:mm:ss" }
```

El JWT dura ~2.5 h (`exp`). Cachealo ~50 min y reusalo. Todas las demás llamadas van con `Authorization: Bearer <token>` y `Content-Type: application/json`.

---

## 2. Alta de cliente: obtener el `customerId` (`POST /register`)

El `customerId` identifica a tu cuenta y es obligatorio en `/rates`, `/agencies`, `/shipping/import` y `/shipping/tracking`. Se obtiene una sola vez registrando el cliente.

**Flujo:** Basic → `/token` → `POST /register` (con `Authorization: Bearer <token>`) → devuelve `{ customerId, createdAt }`.

Schema verificado (campos requeridos; la API valida de a uno y aborta en el primer faltante):

```json
{
  "email": "<email>",
  "password": "<password>",
  "firstName": "<nombre>",
  "lastName": "<apellido>",
  "documentType": "CUIT",
  "documentId": "<solo dígitos, sin guiones>",
  "phone": "<telefono>",
  "cellPhone": "<celular>",
  "address": {
    "streetName": "<calle>",
    "streetNumber": "<numero>",
    "floor": "",
    "apartment": "",
    "locality": "<localidad>",
    "city": "<ciudad>",
    "provinceCode": "<código de provincia, 1 letra>",
    "postalCode": "<CP>"
  }
}
```

- `documentType`: `"CUIT"` o `"DNI"`.
- `address` lleva **`locality` y `city`** (ambos) más `provinceCode` y `postalCode`.
- Respuesta exitosa: `{ "customerId": "<...>", "createdAt": "..." }`. **Guardá el `customerId`.**

**Gotchas del alta:**

- Si el email ya está registrado → `402 "El usuario: <email>, ya fue dado de alta exitosamente!"` y **NO** vuelve a devolver el `customerId`. No hay endpoint para "recuperar" el `customerId` de una cuenta existente: hay que tenerlo guardado del alta original (o registrar con otro email).
- El alta es **global**: como test y prod comparten la base de usuarios, registrar una vez sirve para los dos ambientes y reusás el mismo `customerId`.

**Recomendaciones:**

1. Hacé el alta primero contra **homologación** y validá el flujo.
2. Usá **datos reales** de la entidad (no inventes CUIT/dirección): es un alta real con peso legal.
3. Guardá el `customerId` en tu config (env o, si sos multi-tenant, en DB — ver §6).

---

## 3. Contratos REALES de los endpoints operativos

> Todos verificados contra la API. La API usa Jackson con `FAIL_ON_UNKNOWN_PROPERTIES`: **cualquier campo extra** se rechaza con `400 "Unrecognized field 'X'"`. Mandá exactamente los campos del contrato.

### Cotización — `POST /rates`

```json
{
  "customerId": "<CUSTOMER_ID>",
  "postalCodeOrigin": "<CP origen>",
  "postalCodeDestination": "<CP destino>",
  "deliveredType": "D",
  "dimensions": { "weight": 900, "height": 18, "width": 18, "length": 18 }
}
```

- `deliveredType`: `"D"` (domicilio) o `"S"` (sucursal).
- `dimensions`: peso en **gramos**, medidas en **cm**, anidado.
- ⚠️ NO existen los campos planos `parcelWeight/parcelWidth/parcelHeight/parcelLength` ni `declaredValue` (los rechaza con 400).
- Respuesta `202`: `{ "customerId": "...", "validTo": ..., "rates": [ /* tarifas */ ] }`.

### Sucursales — `GET /agencies` (QUERY PARAMS, no path params)

⚠️ Error muy común: `/agencies/{customerId}/{provinceCode}/{postalCode}` → `404`. El formato real es query string:

```http
GET /agencies?customerId=<CUSTOMER_ID>&provinceCode=<COD>&postalCode=<CP>
```

- Si falta alguno de los 3 params → `400 "Hay campos obligatorios vacios"`.
- Respuesta `200`: array de sucursales (parsealo de forma defensiva: los nombres de campo varían — `agency_id`/`code`/`id`, `agency_name`/`name`, etc.).

### Tracking — `GET /shipping/tracking`

- Método **GET** con header `Content-Type: application/json`. Sin ese header devuelve `415`; con `POST` devuelve `405`.
- Params: `customerId` + `trackingNumber`.
- Paths alternativos (`/shippingtracking`, `/tracking`) → `404`. El correcto es `/shipping/tracking`.
- Parseá los eventos de forma defensiva (la respuesta puede venir como array, o bajo `events`/`tracking`/`history`).

### Importar envío — `POST /shipping/import`

POST con Bearer. Crea un envío real, así que **no lo pruebes a ciegas**. La estructura es consistente con el resto de la API (objeto `address` anidado con `streetName/streetNumber/floor/apartment/locality/provinceCode/postalCode`, y bloques `sender`/`recipient`/`shipping`/`order`). Validá el payload exacto contra la doc oficial de tu acuerdo y/o con un envío de prueba controlado. **Payload completo en [`references/api-reference.md`](references/api-reference.md).**

### Tabla de códigos de error observados

| HTTP / mensaje | Significado | Causa típica |
|---|---|---|
| `401 "Header List is null or empty"` | falta Basic Auth | mandaste body JSON a `/token` en vez de Basic |
| `400 "Unrecognized field 'X'"` | campo no reconocido | payload con campos de más (ej. `parcelWeight`, `declaredValue`) |
| `400 "Hay campos obligatorios vacios"` | faltan params | `/agencies` sin `customerId`/`provinceCode`/`postalCode` |
| `402 "ya fue dado de alta"` | email ya registrado | `/register` de una cuenta existente |
| `404` | path inexistente | path params en `/agencies`, path mal escrito |
| `405` | método no permitido | `POST` a `/shipping/tracking` (es GET) |
| `415` | media type | `GET` sin `Content-Type: application/json` |

---

## 4. 🚨 Gotcha crítico: activación comercial de la cuenta

Una cuenta **recién registrada autentica y acepta requests, pero NO devuelve datos** hasta que Correo la habilita comercialmente:

- `/rates` responde `202` con `rates: []`.
- `/agencies` responde `200` con `[]` **en todas las zonas** (incluso CABA, que obviamente tiene sucursales).

Esto **no es un bug de tu código**. Si ves respuestas `200/202` pero **vacías en todos lados**, falta que Correo Argentino active la cuenta para operar (acuerdo/habilitación comercial). Verificá esto **antes** de debuggear el código. Es el primer sospechoso cuando "todo responde OK pero no hay tarifas/sucursales".

---

## 5. Arquitectura recomendada

### Tipos de entrega (canónicos)

| Tipo | Significado | ¿Crea envío? | Costo |
|---|---|---|---|
| `home` | Envío a domicilio (`deliveredType: "D"`) | sí | cotizado |
| `branch` | Retiro en sucursal Correo (`deliveredType: "S"`) | sí | cotizado |
| `store` | Retiro en tienda propia | **no** | **0** |

Regla crítica: para `store` **no** crees shipment ni cobres envío. Si lo rompés, aparecen errores tipo "Envío no encontrado" en aprobaciones manuales/webhooks. Centralizá esto en helpers (`shouldCreateShipment(type)`, `normalizeShippingCost(type)`).

### Capa de servicio

Un único servicio (`CorreoArgentinoService` o equivalente) que encapsule:

- `getToken()` con cache (Basic → JWT). **Ver §6 para el cache en multi-tenant.**
- `calculateQuote()` → `/rates`.
- `listAgencies()` → `/agencies` (query params).
- `importShipment()` → `/shipping/import`.
- `getTracking()` → `/shipping/tracking`.
- `requestJson(path, init)` helper que agrega `Authorization: Bearer` + `Content-Type: application/json`.

Helper de provincia (mapea nombre → código de 1 letra que pide la API):

```
Buenos Aires B · CABA/Capital Federal C · Catamarca K · Chaco H · Chubut U ·
Córdoba X · Corrientes W · Entre Ríos E · Formosa P · Jujuy Y · La Pampa L ·
La Rioja F · Mendoza M · Misiones N · Neuquén Q · Río Negro R · Salta A ·
San Juan J · San Luis D · Santa Cruz Z · Santa Fe S · Santiago del Estero G ·
Tierra del Fuego V · Tucumán T
```

Normalizá el CP a 4 dígitos antes de enviarlo.

### Persistencia (tablas sugeridas)

- `shipments` (uno por orden con envío): provider, method, status, tracking_number, tracking_url, branch_code/name, destino, `external_reference`, payloads de request/response, timestamps (`imported_at`, `last_synced_at`, `delivered_at`).
- `shipment_events`: historial de tracking (status, título, detalle, payload).
- La orden referencia su estado de fulfillment (`fulfill_status`).

---

## 6. Multi-tenant (clave para publicar / SaaS)

Si una sola instancia sirve a **varias tiendas**, cada tienda tiene su **propia** cuenta de Correo: distinto `username/password`, distinto `customerId` y distinta dirección de **remitente**. No alcanza con env vars (son de valor único por deploy).

> Esquema SQL completo (tablas, RLS, cifrado de secretos, cron por tenant) en [`references/multi-tenant.md`](references/multi-tenant.md). Abajo, lo esencial.

### Config por tenant en DB

```sql
create table shipping_accounts (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,            -- o store_id
  provider     text not null default 'correo_argentino',
  username     text not null,
  password     text not null,            -- encriptar (pgcrypto/KMS) o usar secret manager
  customer_id  text not null,
  sender       jsonb not null,           -- { firstName, lastName, email, phone, address {...} }
  api_base_url text,                     -- opcional; default según ambiente
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
```

Resolvé las credenciales por la tienda de la orden/checkout, no de un singleton global.

### ⚠️ Cache de token POR TENANT

El patrón típico de "un `let tokenCache` a nivel de módulo" **rompe en multi-tenant**: mezcla el token de una tienda con otra. Usá un Map cacheado por credencial:

```ts
// ❌ NO en multi-tenant: token global compartido
let tokenCache: { token: string; expiresAt: number } | null = null

// ✅ Cache por tenant (clave = username o customerId)
const tokenCache = new Map<string, { token: string; expiresAt: number }>()

async function getToken(creds: { username: string; password: string }, baseUrl: string) {
  const key = creds.username
  const hit = tokenCache.get(key)
  if (hit && hit.expiresAt > Date.now()) return hit.token

  const basic = Buffer.from(`${creds.username}:${creds.password}`).toString("base64")
  const res = await fetch(`${baseUrl}/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}` },
  })
  const { token } = await res.json()
  tokenCache.set(key, { token, expiresAt: Date.now() + 50 * 60 * 1000 })
  return token
}
```

Hacé que **todos** los métodos del servicio reciban (o resuelvan) el contexto del tenant: credenciales, `customerId`, base URL y remitente. Nada hardcodeado a una tienda.

### Aislamiento y secretos

1. Nunca loguees credenciales ni el JWT completo.
2. Encriptá `password` en reposo o usá un secret manager; no lo guardes en texto plano.
3. El cron de tracking debe iterar **por tenant** (o resolver el tenant desde cada shipment) y firmar cada request con el token correcto.
4. Aplicá RLS para que una tienda no lea shipments/cuentas de otra.

### Modo single-tenant

Si tu app es de **una sola tienda**, podés simplificar usando env vars (`<PREFIX>_USERNAME`, `<PREFIX>_PASSWORD`, `<PREFIX>_CUSTOMER_ID`, `<PREFIX>_SENDER_*`, `<PREFIX>_API_BASE_URL`) y un token cacheado simple. La capa de servicio debería abstraer ambos modos detrás de la misma interfaz.

---

## 7. Flujo end-to-end recomendado

### A) Cotización (checkout)

1. El checkout pide cotización para `home` y/o `branch`.
2. El backend calcula peso/medidas reales desde los productos (con defaults si faltan).
3. Aplicá reglas de negocio (envío gratis por monto/zona) **antes o después** de la API según tu política.
4. Llamá a `/rates` con el contrato de §3. Si la API falla, usá un **fallback estimado** (nunca bloquees el checkout por una falla transitoria).
5. Normalizá el costo (evitá residuales: `<= 1` → `0`).

### B) Creación de la orden

- `store` → sin shipment, costo 0.
- `home`/`branch` → creá el shipment en DB en estado inicial (ej. `pending`/`ready`). Para `branch`, guardá el código de sucursal.

### C) Importar en Correo (al aprobarse el pago)

Puede dispararse en pago inmediato (tarjeta) o en webhook/aprobación manual (transferencia):

1. Asegurá idempotencia (ver §9).
2. Armá el payload de `/shipping/import` con remitente (del tenant) + destinatario (de la orden).
3. Si Correo devuelve tracking, persistilo; si falla, **no rompas la orden** (dejá el shipment local para reintentar).

### D) Sync de tracking (cron)

1. Tomá shipments no finales (importados / en tránsito).
2. Consultá `/shipping/tracking` por `customerId` + `trackingNumber`.
3. Insertá `shipment_events` sin duplicar el último.
4. Mapeá el último evento a tu `ShipmentStatus` y luego a `fulfill_status`.
5. Disparáemails de "en camino" y "entregado" **en la primera transición** (dedupe por evento/flag).
6. Sincronizá `fulfill_status` solo si el pago está aprobado.

---

## 8. Mapeo de estados (sugerido)

Adaptá los nombres a tu dominio. El texto del evento de Correo es variable; mapealo con `includes`/regex en minúsculas:

| Texto de tracking (contiene) | Estado de envío sugerido |
|---|---|
| `preimposicion`, `imposicion`, `admis` | preparación / admitido |
| `transit`, `despach`, `planta`, `clasificac` | en tránsito |
| `distribuci`, `reparto`, `en camino` | en distribución / en tránsito |
| `entregado`, `delivered` | entregado |
| `devolu`, `returned` | devuelto |
| `cancelad` | cancelado |
| `caduca`, `fallid`, `rechaz` | fallido |

Estado de envío → estado de fulfillment de la orden: `en tránsito`/`en distribución` → "despachado"; `entregado` → "entregado"; `devuelto`/`cancelado`/`fallido` → según tu flujo.

---

## 9. Validación, idempotencia y observabilidad

- **Validación en checkout:** si `branch`, exigí código de sucursal; si `≠ store`, exigí dirección/CP/ciudad/provincia; si `store`, no exijas dirección.
- **Idempotencia:** usá una `external_reference` determinística por orden y reusá el shipment existente; evitá doble import por doble click/retry del webhook.
- **Observabilidad:** logueá con contexto (`orderId`, `trackingNumber`, tenant) y **sin** PII ni credenciales. Tratá el tracking como *eventual consistency*.

---

## 10. Buenas prácticas

1. Nunca bloquees el checkout por una falla transitoria de Correo (usá fallback).
2. Nunca crees shipment para retiro en tienda.
3. Nunca asumas formato fijo de la respuesta de sucursales/tracking: parseo defensivo.
4. Mantené el sync de `fulfill_status` desacoplado (cron/eventos).
5. Cacheá el token (por tenant) y reusalo; no pidas `/token` en cada llamada.
6. Normalizá montos para evitar valores fantasma.
7. En multi-tenant, todo (token, customerId, remitente) se resuelve por tenant.

---

## 11. Troubleshooting

| Síntoma | Diagnóstico |
|---|---|
| `401 "Header List is null or empty"` en `/token` | Estás mandando body JSON. Usá Basic Auth. |
| `/rates` da `400 "Unrecognized field"` | Sacá campos de más (`parcel*`, `declaredValue`); usá `dimensions` anidado. |
| `/agencies` da `404` | Estás usando path params. Pasá a query params. |
| `/agencies` o `/rates` responden vacío en TODAS las zonas | La cuenta no está habilitada comercialmente (ver §4). |
| `/shipping/tracking` da `415`/`405` | Falta `Content-Type: application/json`, o estás usando POST. Es GET. |
| `/register` da `402` | El email ya está registrado; usá el `customerId` guardado o otro email. |
| Estado queda en "preparando" | Aún no llegó evento de tránsito; corré el sync o esperá. |
| "Envío no encontrado" en aprobación | La orden es retiro en tienda o no se persistió el `shipping_method`. |

---

## 12. Script de onboarding (referencia)

Script Node 18+ sin dependencias para obtener el `customerId`: hace Basic → `/token` → `POST /register` e imprime la respuesta. Patrón:

```js
const BASE = process.env.MICORREO_ENV === "prod"
  ? "https://api.correoargentino.com.ar/micorreo/v1"
  : "https://apitest.correoargentino.com.ar/micorreo/v1"
const basic = Buffer.from(`${process.env.CA_USERNAME}:${process.env.CA_PASSWORD}`).toString("base64")
const token = (await (await fetch(`${BASE}/token`, {
  method: "POST", headers: { Authorization: `Basic ${basic}` },
})).json()).token
const res = await fetch(`${BASE}/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify(REGISTER_PAYLOAD), // completar con datos REALES; ver §2
})
console.log(await res.json()) // -> { customerId, createdAt }
```

Reglas: probá en homologación primero, no commitees datos/credenciales, dejá el payload como template.

---

## 13. Criterio de aceptación

La integración está correcta cuando:

1. `/token` autentica con Basic Auth y el token se cachea (por tenant si aplica).
2. Tenés (o podés obtener) el `customerId` por cuenta.
3. El checkout cotiza `home`/`branch` con el contrato real y tiene fallback.
4. `store` no crea shipment ni cobra envío; `branch` exige sucursal.
5. La orden aprobada importa el envío de forma idempotente.
6. El cron actualiza tracking/estados y sincroniza `fulfill_status`.
7. El cliente recibe email en tránsito y en entrega.
8. La cuenta está habilitada comercialmente (sino, todo responde vacío — §4).

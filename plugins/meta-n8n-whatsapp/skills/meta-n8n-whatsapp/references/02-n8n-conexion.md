# 02 — Conexión del webhook a n8n + verificación HMAC

Objetivo: que un mensaje entrante de WhatsApp llegue a n8n, validado y listo para procesar.

El camino **más simple y rápido** usa un **Webhook genérico + un nodo If** (controlás vos el
verify token, sin depender del UUID escondido del WhatsApp Trigger). Es el método principal de
esta skill; el WhatsApp Trigger nativo queda como alternativa al final de la sección 1.

## 1. Camino rápido — recibir mensajes en 3 pasos

La idea: **dos nodos Webhook sobre el mismo path** — uno **GET** que valida el handshake de
Meta, y uno **POST** que recibe los mensajes. Con eso ya tenés la app conectada.

### Paso 1 — App con el caso de uso WhatsApp

Con la app ya creada (ver `references/01`), entrá a **Use cases → WhatsApp →
Configuration** y andá al **paso 2 (Webhook)**. Esa pantalla es donde después vas a pegar la
Callback URL y el verify token.

### Paso 2 — Flujo de validación (GET) + registro en Meta

Armá este flujo (es el de la imagen): un **Webhook (GET)** → un **If** → dos **Respond to
Webhook**.

```
Webhook (GET, path "whatsapp")
        │
        ▼
      If  ── equals ──┬─ true  → Respond to Webhook   (devuelve el challenge → valida)
                      └─ false → Respond to Webhook1   (rechaza)
```

Configuración de cada nodo:

- **Webhook (GET):** HTTP Method = `GET`; anotá el **path/slug** (ej. `whatsapp`). En
  **Respond** elegí **Using 'Respond to Webhook' Node** (porque la respuesta la dan los nodos
  Respond to Webhook).
- **If — un solo `equals`:** compara el token que manda Meta contra **el string que escribís
  vos a mano**:
  - Valor 1: `{{ $json.query['hub.verify_token'] }}` ← **bracket notation**: la key tiene un
    punto, `$json.query.hub.verify_token` NO funciona.
  - Operación: **equals**
  - Valor 2: `MI_TOKEN` ← el string que inventás (tu verify token / slug).
- **Respond to Webhook (rama true):** Response Body = `{{ $json.query['hub.challenge'] }}`,
  como **texto plano**, status 200. Eso es exactamente lo que Meta espera para dar por válido
  el webhook.
- **Respond to Webhook1 (rama false):** respondé un 403 o un texto de rechazo (el token no
  coincidió).

Después:
1. **Publicá** el workflow (queda activa la **Production URL** del Webhook).
2. En Meta (paso Webhook): **Callback URL** = esa Production URL; **Verify token** =
   exactamente `MI_TOKEN` (el mismo del If). Tocá **Verify and save** → valida al instante.
3. **Suscribí el campo `messages`** en *Webhook fields*. Sin esto Meta valida pero **no te
   manda los mensajes** — causa #1 de "no me llega nada a n8n".

### Paso 3 — Webhook POST como trigger de los mensajes

Agregá un **segundo nodo Webhook** con el **mismo path/slug** (`whatsapp`) pero HTTP Method
**`POST`**. Ese es el que recibe los mensajes entrantes: es tu trigger real. En **Respond**
poné **Immediately** (200 al toque). Y listo: el **GET valida** el handshake y el **POST
recibe** los mensajes, sobre la **misma URL** con dos métodos distintos.

> **Las dos reglas de oro de este método:**
> 1. **Mismo token**: el `MI_TOKEN` del If (Valor 2) tiene que ser idéntico al que cargás en
>    el campo Verify token de Meta.
> 2. **Mismo path/slug**: el Webhook GET y el Webhook POST comparten el mismo path, así
>    comparten la misma URL (Meta usa GET para verificar y POST para los eventos).

> **Gotcha — un webhook por App.** Meta permite **un solo webhook por App**. Registrar la
> Production URL **pisa** la de Test. No corras producción activa mientras testeás en el
> editor con la misma app: usá apps separadas para dev/prod, o asumí que solo una está
> conectada a la vez.

### Alternativa: WhatsApp Trigger nativo

En vez de los dos Webhook genéricos podés usar el nodo **WhatsApp Trigger**, que maneja el
`hub.challenge` solo. La contra: el **verify token es un UUID interno del nodo**, visible solo
en el JSON exportado del workflow (no hay campo en la UI), así que tenés que exportar el
workflow para copiarlo. Por eso, para entender y controlar el flujo, el camino rápido de
arriba (Webhook + If) suele ser más claro.

## 2. Modo de respuesta: Respond Immediately (obligatorio)

Meta entrega con garantía **at-least-once**: reintenta si no recibe un **HTTP 200** (los
reintentos pueden seguir por días). No hay un timeout único universal — según fuente/BSP se
citan ventanas de 5–30 s —, pero la regla es la misma: **respondé 200 enseguida y procesá
asíncrono.** Además n8n Cloud está detrás de Cloudflare con timeout de 100 s (524), así que
acoplar trabajo pesado (LLM, DB) a la respuesta del webhook es doblemente mala idea.

- En el **WhatsApp Trigger** el ack es inmediato por diseño.
- Si usás **Webhook node**: poné `Respond = Immediately` (o un Respond to Webhook ubicado
  temprano, antes de cualquier trabajo pesado).
- Patrón a escala: separá **ack** (200 ya) del **worker** (procesa y responde después). Esto
  está desarrollado en la skill `n8n-production-patterns`.

## 3. Verificar la firma HMAC (no viene built-in)

Meta firma cada POST con el header **`X-Hub-Signature-256`** = `sha256=` + HMAC-SHA256 del
**raw body** usando tu **App Secret**. Las opciones de auth del Webhook (None/Basic/Header/
JWT) **no** cubren HMAC: hay que calcularlo a mano y **fallar cerrado** si no coincide.

1. En el Webhook node, activá **Raw Body** (necesitás los bytes exactos del body).
2. Code node de verificación:

```javascript
const crypto = require('crypto');
const sig = $json.headers['x-hub-signature-256']; // "sha256=...."
const computed = 'sha256=' + crypto
  .createHmac('sha256', $env.META_APP_SECRET)
  .update($json.rawBody)        // body CRUDO, antes de cualquier parseo JSON
  .digest('hex');
// Comparación de tiempo constante (evita timing attacks):
const ok = sig && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(computed));
if (!ok) throw new Error('HMAC mismatch');
return items;
```

3. Routealo a un **Stop And Error** ante mismatch para que dispare el Error Workflow.

(El WhatsApp Trigger nativo valida con el App Secret cargado en la credencial; si usás
Webhook genérico, esta verificación es tuya y es obligatoria.)

## 4. Extraer el payload del mensaje

El payload entrante de WhatsApp vive bajo
`entry[0].changes[0].value.messages[0]`. Extracción canónica:

```
wa_id    = {{ $json.entry[0].changes[0].value.messages[0].from }}      // teléfono del usuario
msgText  = {{ $json.entry[0].changes[0].value.messages[0].text.body }} // texto
msgType  = {{ $json.entry[0].changes[0].value.messages[0].type }}      // text|image|audio|...
msgId    = {{ $json.entry[0].changes[0].value.messages[0].id }}        // wamid (id único)
```

> ⚠️ `entry`, `changes` y `messages` son **arrays**. Bajo carga Meta puede agrupar varios
> mensajes en un mismo POST; si procesás solo `[0]` perdés mensajes. Para volumen real,
> iterá sobre `value.messages` (y separá `messages` de `statuses`, que llegan por el mismo
> webhook). El patrón de procesamiento a escala está en `n8n-production-patterns`.

Normalizá esto en un Set/Code node temprano (`Normalize`) y referenciá `wa_id`, `msgText`,
etc. aguas abajo — no vuelvas a cavar el payload crudo en cada nodo.

## 5. Idempotencia por `wamid` (Meta redelivera)

Como Meta reintenta ante cualquier no-200, **vas a recibir el mismo mensaje más de una vez**.
Deduplicá por `wamid`: insertá en Supabase/Postgres con `ON CONFLICT (wamid) DO NOTHING`
apenas entra el mensaje, antes de cualquier procesamiento. Esto evita responder dos veces.
El patrón completo (debounce + claim atómico para agrupar mensajes en ráfaga) está en
`n8n-production-patterns`.

## 6. Cerrar el loop (respuesta mínima)

Para confirmar que todo conecta, respondé algo fijo con el nodo **WhatsApp Business Cloud →
Send Message** usando el `wa_id` normalizado:

```
{{ $('Normalize').first().json.wa_id }}  // a quién
"¡Recibido! 🤖"                          // qué (texto fijo de prueba)
```

Si esto llega al teléfono, la conexión Meta ↔ n8n está OK. A partir de acá, la lógica de
respuesta real (AI Agent con Tools, memoria por `wa_id`, debounce, error handling) se
construye con la skill **`n8n-production-patterns`**.

## Gotcha de plataforma 2026: cambio de CA (mTLS)

Meta cambia la **Autoridad Certificante** de sus webhooks alrededor del **31-mar-2026**. Si
tu endpoint hace verificación mTLS / pinning del certificado de Meta, hay que actualizar el
trust store o vas a **dejar de recibir webhooks** desde abril 2026. (Si terminás en n8n Cloud
detrás de Cloudflare, normalmente no te afecta; sí a endpoints self-hosted con pinning.)

## Checklist de conexión

- [ ] App de Meta creada, producto WhatsApp agregado, número de prueba activo.
- [ ] Phone Number ID, WABA ID, App Secret y Access Token a mano.
- [ ] WhatsApp Trigger (o Webhook) levantado; Callback URL registrada en Meta.
- [ ] Verify token coincide y el `hub.challenge` se responde OK.
- [ ] Campo **`messages` suscripto** en Webhook fields.
- [ ] Respond 200 inmediato + procesamiento asíncrono (no acoplar LLM/DB al ack).
- [ ] HMAC `X-Hub-Signature-256` verificado contra App Secret (Raw Body on, comparación timing-safe).
- [ ] Iterar sobre `value.messages` (es array); separar `messages` de `statuses`.
- [ ] Dedup por `wamid` antes de procesar.
- [ ] Una sola app conectada al webhook a la vez (dev/prod separados).
- [ ] Trust store actualizado ante el cambio de CA de Meta (mar-2026) si hacés mTLS/pinning.

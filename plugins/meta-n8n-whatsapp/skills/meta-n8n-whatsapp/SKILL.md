---
name: meta-n8n-whatsapp
description: >-
  Conectar una app de Meta (WhatsApp Business Cloud) a n8n para recibir mensajes entrantes y
  dejar un flujo funcionando de punta a punta: crear la app de Meta, agregar el producto
  WhatsApp, conseguir el número de prueba, configurar permisos y token, registrar el webhook
  con su verify token, validar la firma HMAC, y conectar todo a n8n con un Webhook (GET) + If
  para el handshake y un Webhook (POST) como trigger de mensajes (o el WhatsApp Trigger nativo).
  USAR SIEMPRE que el usuario quiera conectar WhatsApp a n8n, recibir mensajes de WhatsApp en
  un workflow, armar su primer bot/automatización de WhatsApp, configurar el webhook de Meta,
  obtener o validar el verify token, pasar del número de prueba a producción, o cuando mencione
  Meta app, Meta for Developers, WhatsApp Business Cloud, WhatsApp Trigger, webhook de Meta,
  hub.challenge, X-Hub-Signature-256, App Secret, phone number id, o "no me llegan los
  mensajes a n8n". Activar también para Instagram DM por webhook (mismo mecanismo de Meta).
  Para la LÓGICA de respuesta del flujo (AI Agent, memoria, debounce a escala), derivar a la
  skill n8n-production-patterns.
---

# Conectar Meta (WhatsApp) a n8n

Esta skill cubre la parte que suele trabar a todos: **conectar** la plataforma de Meta con
n8n para que los mensajes entrantes lleguen a un workflow. La lógica de *qué responde* el
bot (AI Agent, memoria, herramientas, escalado) está en la skill **`n8n-production-patterns`**;
acá llegamos hasta "el mensaje entra a n8n y respondo algo".

## Mapa del recorrido

```
[Meta for Developers]                       [n8n]
  App ─ caso de uso WhatsApp ─ nº de prueba ─┐
  Callback URL ◄─────────────────────────────┤ URL del Webhook (mismo path)
  Verify token ═══ GET hub.challenge ════════►│ Webhook GET → If(equals) → Respond (challenge)
  Mensaje entrante ═══ POST ═════════════════►│ Webhook POST → HMAC verify → flujo de respuesta
                                                         (App Secret)
```

Dos realidades que dominan todo el diseño y que conviene tener presentes desde el principio:
**Meta entrega cada mensaje con garantía at-least-once: reintenta si no recibís HTTP 200, y
los reintentos pueden llegar por días** (no hay un único timeout universal de N segundos; se
citan ventanas de 5–30 s según fuente/BSP). La regla práctica es **responder 200 al toque y
procesar de forma asíncrona**. Y **Meta permite un solo webhook por App** (registrar la URL
de producción pisa la de testing). Todo lo demás se deriva de eso.

## Lo esencial: recibir mensajes en 3 pasos

Si lo único que querés es **recibir mensajes rápido**, son tres pasos (detalle en
`references/02-n8n-conexion.md`, sección 1):

1. **App con caso de uso WhatsApp** → Use cases → WhatsApp → Configuration → paso 2 (Webhook).
2. **Flujo de validación**: `Webhook (GET) → If (equals) → Respond to Webhook`. El If compara
   `{{ $json.query['hub.verify_token'] }}` contra un **token que escribís vos**; la rama true
   devuelve `{{ $json.query['hub.challenge'] }}`. Publicás, y en Meta pegás la **Production
   URL** + **el mismo token**. Verify → valida. Suscribís el campo `messages`.
3. **Webhook POST** con el **mismo path** = tu trigger de mensajes.

Reglas de oro: **mismo token** (If ↔ Meta) y **mismo path** (Webhook GET ↔ Webhook POST).

## Orden de trabajo (seguir tal cual)

1. **Crear la app de Meta y agregar WhatsApp.** → `references/01-meta-app-setup.md`
   (tipo de app por caso de uso, producto WhatsApp, número de prueba, phone number id, tokens, permisos).
2. **Conectar el webhook a n8n (camino rápido de 3 pasos).** → `references/02-n8n-conexion.md`
   (Webhook GET + If + Respond to Webhook para el handshake, Webhook POST como trigger,
   suscribir `messages`).
3. **Validar la firma HMAC** del lado de n8n (no viene built-in). → `references/02-n8n-conexion.md`
4. **Responder algo mínimo** para cerrar el loop, y de ahí derivar a `n8n-production-patterns`
   para construir el flujo real.

## Decisiones que hay que tomar temprano

- **Número de prueba vs producción.** El número de prueba de Meta (lo da la app gratis)
  sirve para todo el desarrollo: permite hasta 5 destinatarios verificados a mano y envía
  templates/mensajes libres dentro de la ventana de 24 h. Para producción necesitás un
  número propio verificado y, si vas a iniciar conversaciones fuera de la ventana de 24 h,
  templates aprobados. Ver `references/01`.
- **Token: temporal vs System User.** El token que da el panel dura 24 h (sirve para
  probar). Para producción generás un token de **System User** (no expira o expira largo)
  con los permisos `whatsapp_business_messaging` y `whatsapp_business_management`.
- **Caso Synera — login Business, no Facebook personal.** Crear apps en Meta for Developers
  puede requerir un perfil de Facebook asociado. Si la cuenta es Business y no tenés perfil
  personal, el desbloqueo de corto plazo es que un colaborador con perfil personal cree la
  app y te agregue como admin/developer del Business y de la app.
- **Costos (cambió en 2025).** Desde el **1-jul-2025** WhatsApp factura **por mensaje**
  (per-message pricing), no por conversación. Te cobran cuando se **entrega un template**
  (`type: template`); los mensajes que no son template son gratis, y los templates de tipo
  *utility* dentro de una ventana de servicio abierta también. Tenelo en cuenta al costear
  el bot. Ver `references/01`.
- **Política de IA (cambió en 2026).** Desde el **15-ene-2026** Meta no permite distribuir
  **asistentes de IA de propósito general** (tipo ChatGPT/Perplexity) por WhatsApp. Un bot de
  **propósito acotado** (atención de un negocio puntual, soporte, reservas) sigue permitido —
  que es el caso típico de los clientes de la agencia. No montes un "asistente general" sobre
  el número.

## Caso de uso adicional: Instagram DM

El mismo mecanismo (app de Meta + webhook + verify token + HMAC) aplica a Instagram DM: en
vez de suscribir el campo `messages` de WhatsApp, suscribís los campos de mensajería de
Instagram y la app necesita los permisos de Instagram + la página de Facebook vinculada. El
esqueleto de conexión es idéntico; cambian los productos/permisos y el shape del payload.

## Archivos de referencia

- `references/01-meta-app-setup.md` — Crear la app en Meta for Developers, agregar el
  producto WhatsApp, número de prueba, phone number id / WABA id, tokens (temporal y System
  User), permisos, y el salto a producción.
- `references/02-n8n-conexion.md` — WhatsApp Trigger de n8n, registro del webhook en Meta
  (verify token + hub.challenge), suscripción de campos, modos de respuesta (Respond
  Immediately), verificación HMAC `X-Hub-Signature-256`, extracción del payload, y los
  gotchas (un webhook por app, redelivery, idempotencia por `wamid`).

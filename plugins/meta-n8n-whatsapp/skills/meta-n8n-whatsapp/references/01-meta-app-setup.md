# 01 — Crear la app de Meta y configurar WhatsApp

Objetivo: tener una app de Meta con el producto WhatsApp, un número de prueba, los IDs que
n8n necesita y un token usable.

## 1. Crear la app

1. Entrar a **developers.facebook.com** → My Apps → **Create App**.
2. Tipo de app: elegir **Business**. En el flujo nuevo de Meta (2026) la creación es
   **por caso de uso**: elegí el caso de uso **WhatsApp** (o "Other" → Business). Ambos
   caminos terminan en una app Business con el producto WhatsApp.
3. Asociar la app a un **Business Portfolio** (Meta Business). Si no tenés uno, se crea en el
   momento.

> **Bloqueo típico (caso Synera):** crear apps puede requerir un **perfil personal de
> Facebook** vinculado, no solo una cuenta Business. Si la cuenta es Business pura, el
> desbloqueo rápido es que un colaborador con perfil personal cree la app y te sume como
> **admin/developer** tanto en el Business como en la app. Después operás normal.

## 2. Agregar el producto WhatsApp

1. En el dashboard de la app → **Add Product** → **WhatsApp** → Set up.
2. Meta crea (o te pide elegir) una **WhatsApp Business Account (WABA)** y te da un
   **número de prueba** gratuito.
3. Anotá los identificadores que vas a necesitar en n8n y en las llamadas a la Graph API:
   - **Phone Number ID** — id del número (NO es el número en sí). Va en la URL de envío
     `/{phone-number-id}/messages`.
   - **WhatsApp Business Account ID (WABA ID)**.
   - **App ID** y **App Secret** (en App Settings → Basic). El **App Secret** es el que se
     usa para validar la firma HMAC de los webhooks.

## 3. Número de prueba: límites

- Permite agregar hasta **5 números destinatarios** verificados manualmente (te llega un
  código a cada uno). Solo a esos podés escribir mientras estás en modo prueba.
- Sirve para todo el desarrollo del flujo: recibir mensajes y responder dentro de la ventana
  de 24 h, y probar templates.
- No requiere número propio ni verificación de negocio todavía.

## 4. Tokens

Hay dos, y conviene no confundirlos:

| Token | Dónde sale | Dura | Para qué |
|---|---|---|---|
| **Temporal** | Panel de WhatsApp → API Setup | ~23 h | Probar a mano, primeras llamadas. |
| **System User** | Business Settings → Users → System Users → Generate Token | Largo / sin expiración | Producción. |

Para el **System User token**:
1. Business Settings → **System Users** → crear uno (rol Admin o Employee).
2. **Assign assets**: asignarle la app y la WABA.
3. **Generate new token** → elegir la app → permisos:
   - `whatsapp_business_messaging` (enviar/recibir mensajes)
   - `whatsapp_business_management` (gestionar la WABA, templates, números)
4. Guardar el token en un lugar seguro (Vault / env). Este es el que pone n8n en la
   credencial de WhatsApp.

## 5. Credencial de WhatsApp en n8n

En n8n, credencial **WhatsApp Business Cloud** (la del action node) y **WhatsApp Trigger**
(la del trigger) piden:
- **Access Token** → el System User token.
- **Business Account ID / Phone Number ID** según el nodo.
- Para el trigger, además, el **App Secret** y el **verify token** (ver `references/02`).

## 6. Pasar a producción (cuando el flujo ya anda)

1. **Número propio:** agregar un número real a la WABA y verificarlo (SMS/llamada). No puede
   estar activo en la app de WhatsApp normal con ese mismo número.
2. **Verificación del negocio** (Business Verification) en Meta Business para levantar
   límites de mensajería.
3. **Templates aprobados:** para **iniciar** conversaciones fuera de la ventana de 24 h hay
   que usar message templates aprobados por Meta. Dentro de la ventana de 24 h (el usuario
   te escribió hace <24 h) podés responder con mensajes libres.
4. **App en modo Live** y permisos aprobados si la app es pública (para uso propio de un
   solo negocio normalmente alcanza con el número y la WABA bajo tu Business).

## 7. Costos: per-message pricing (desde 1-jul-2025)

WhatsApp dejó el modelo por conversación (CBP) y pasó a **per-message pricing (PMP)**:
- Te cobran cuando se **entrega un template** (`type: template`).
- Los mensajes que **no son template** son gratis.
- Los templates de tipo **utility** entregados **dentro de una ventana de servicio abierta**
  son gratis.
Esto impacta el costeo del bot: minimizá templates iniciados por vos y aprovechá la ventana
de 24 h para responder con mensajes libres.

## IDs/credenciales a tener a mano (resumen)

- App ID, **App Secret** (HMAC), Phone Number ID, WABA ID, Access Token (System User),
  verify token (lo inventás vos, ver `references/02`).

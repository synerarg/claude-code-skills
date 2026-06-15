# MCP Server de Mercado Pago (setup asistido + calidad)

Servidor MCP oficial de Mercado Pago (en beta) que expone la documentacion y las
herramientas de cuenta de MP como tools para el agente. Sirve para **automatizar el
setup** (crear la app, obtener credenciales, configurar webhooks) y para **validar la
calidad** de la integracion, sin entrar al panel a mano.

- URL: `https://mcp.mercadopago.com/mcp`
- Transport: HTTP
- Auth: OAuth (login con tu cuenta de Mercado Pago en el navegador)
- Estado: beta

> El MCP **no** reemplaza a esta skill: el MCP automatiza la cuenta y trae docs frescas;
> la skill aporta los patrones de codigo probados (idempotencia, anti-doble-click,
> verificacion server-side, adapters de DB). Se usan **juntos**.

> Nombres de tools VERIFICADOS en vivo (2026-06-15). Los docs publicos listan algunos
> con otro nombre (`get_application`, `notifications_history_diagnostics`,
> `create_test_user`...): los de abajo son los que el server expone de verdad.

---

## Conexion (Claude Code)

```bash
claude mcp add --transport http mercadopago https://mcp.mercadopago.com/mcp
```

Luego autenticar (el server usa OAuth):

1. Ejecutar `/mcp` en Claude Code.
2. Elegir `mercadopago` y completar el login en el navegador con tu cuenta de MP.
3. **Reiniciar la sesion** (p. ej. `claude --continue`) para que se carguen las tools.

Verificar: `claude mcp list` debe mostrar `mercadopago ... Connected`.

> Importante: las tools de un MCP se registran al **arrancar** la sesion. Si conectas el
> server con la sesion ya abierta, vas a ver `Connected` pero las tools no apareceran
> hasta reiniciar. Hasta no autenticar, `claude mcp list` muestra `Needs authentication`.

---

## Tools disponibles (nombres reales)

### Solo lectura - docs y calidad

| Tool | Parametros | Para que sirve |
|------|------------|----------------|
| `search_documentation` | `term` (req), `language` (`en`/`es`/`pt`, req), `siteId` (`MLA`/`MLB`/`MLC`/`MLM`/`MLU`/`MPE`/`MCO`, req), `limit` (1-100, def 30) | Busca en los docs oficiales. Usar para traer contratos, test cards y codigos de error SIEMPRE actualizados, en vez de depender de contenido hardcodeado. |
| `quality_checklist` | `application_id` (opcional; obligatorio si tenes >1 app) | Devuelve los campos (requeridos + buenas practicas) que MP evalua. Ver el set completo mas abajo. Usar durante el build. |
| `quality_evaluation` | `payment_id` (number) **o** `order_id` (string), `application_id`, `lang` | A partir de un pago/orden real, devuelve un score de calidad + recomendaciones. Verificacion post-integracion. |

### Cuenta - requieren OAuth

| Tool | Parametros | Para que sirve |
|------|------------|----------------|
| `application_list` | (ninguno) | Lista tus aplicaciones de MP (con su `AppID`). Necesario cuando tenes varias apps para pasar el `application_id` a las otras tools. |
| `create_application` | `name`, `payment_solution` (`online_payments`/`in_person_payments`), `product` (`checkout_pro`/`checkout_api`/`checkout_bricks`/`subscription`/`point`/`qr_code`), `api_type` (`orders`/`payments`, solo si product=checkout_api), `platform`, `description`, `website_url`, `redirect_url` | Crea una app nueva con credenciales. El `site_id` (pais) se toma del usuario OAuth: **no preguntar el pais**. |
| `get_credentials` | `application_id` (opcional) | Devuelve Client ID, Client Secret, Access Token y Public Key, **mas las variantes de TEST (sandbox)**. Escribir directo al `.env`. Datos sensibles: nunca commitear ni loguear. |
| `save_webhook` | `callback`, `callback_sandbox`, `topics` (def `["payment"]`), `application_id` | Configura la URL de notificaciones (prod y sandbox) y los topicos. Topicos utiles: `payment`, `order`, `topic_merchant_order_wh`, `topic_chargebacks_wh`, `subscription_preapproval`. |
| `notifications_history` | `application_id` (opcional) | Diagnostico de entregas/fallos de webhooks (exitos, errores, metricas). Usar cuando el webhook no llega. |
| `form_homologation` | `action` (`get_form`/`submit`), `application_id`, `product`, `platform`, `site_id`, `form_values`, `notes` | Form guiado de **homologacion/certificacion** para habilitar la app en produccion. `get_form` trae los pasos; `submit` lo envia. |

> Ojo: este server **no** expone tools para crear usuarios de prueba. Para sandbox usa las
> credenciales de TEST de `get_credentials`, y crea los usuarios de prueba (comprador/vendedor)
> desde el panel (Tus integraciones > Cuentas de prueba) o via la API `/users/test_user`.

---

## Setup rapido: de cero a cobrando en sandbox

1. **Conectar + autenticar** el MCP (ver arriba).
2. **App + credenciales:** `application_list` -> si no existe, `create_application` -> `get_credentials`.
   Escribir las credenciales de **TEST** al `.env`: `MERCADOPAGO_ACCESS_TOKEN` (test access token)
   y `NEXT_PUBLIC_MP_PUBLIC_KEY` (test public key, solo para Bricks).
3. **Usuarios de prueba:** crear comprador y vendedor en el panel (Cuentas de prueba) o via
   `/users/test_user`. Loguearse con el comprador para pagar en el sandbox.
4. **Webhook:** `save_webhook(callback_sandbox = <ngrok>/api/webhooks/mercadopago, topics = ["payment"])`.
5. **Build** de la integracion (Checkout Pro / Bricks / Orders) con las credenciales ya cargadas.
   Ver `checkout-pro.md`, `checkout-bricks.md` u `orders-api.md`.
6. **Validacion:** `quality_checklist` durante el desarrollo; tras un pago de prueba,
   `quality_evaluation(payment_id)`.
7. **Diagnostico:** si el webhook no llega, `notifications_history`.
8. **Produccion:** `form_homologation` para homologar la app antes de salir a prod.

---

## Quality checklist real (verificado via MCP - 2026-06-15)

Esto es lo que MP evalua de verdad (campos y `API Name` reales). Enviar estos campos sube la
tasa de aprobacion y baja rechazos/contracargos. Ubicacion del campo segun modalidad: en la
**preferencia** (Checkout Pro) o en el request del **pago/orden** (Bricks / API / Orders).

### Requeridos (Implementation Requirements)

- [ ] `email` - `payer.email` del comprador (clave para el motor antifraude)
- [ ] `payer_first_name` / `payer_last_name` - nombre y apellido del comprador
- [ ] `item_title` / `item_description` / `item_quantity` / `item_unit_price` / `item_id` / `item_category_id` - datos completos de cada item
- [ ] `device_id` - fingerprint del dispositivo. **Transparente** en Checkout Pro y con MercadoPago.js V2; en Checkout API hay que enviarlo a mano
- [ ] `issuer_id` - emisor del medio de pago elegido (evita errores al procesar)
- [ ] `webhooks_ipn` - `notification_url` configurada
- [ ] `external_reference` - id interno para conciliar el `payment_id` de MP con tu sistema
- [ ] `back_end_sdk` - usar el SDK backend oficial (`mercadopago`)
- [ ] `web_front_end_sdk` - MercadoPago.js V2 en el frontend
- [ ] `statement_descriptor` - soft descriptor (lo que ve el comprador en el resumen; baja desconocimientos)
- [ ] `ssl` - certificado SSL **no** autofirmado
- [ ] `tls` - TLS 1.2 o superior
- [ ] `secure_form` - **secure fields** (Card Form / Core Methods): los datos de tarjeta nunca viajan ni se guardan en tu server (PCI)

### Buenas practicas (Good Practices)

- [ ] `address` - `payer.address` (mas datos del payer = mejor aprobacion)
- [ ] `payer_identification` (+ `payer_identification_mlm` en Mexico) - tipo y numero de documento
- [ ] `payer_phone` - telefono del comprador
- [ ] `payment_get_or_search_api` - tras la notificacion, consultar el pago/orden y actualizar tu plataforma
- [ ] `chargebacks_api` - gestionar disputas/contracargos por API
- [ ] `cancellation_api` - cancelar pagos en `pending` / `in_process`
- [ ] `refunds_api` - devoluciones totales o parciales por API
- [ ] `settlement` / `release` - reportes de liquidaciones y de todas las transacciones
- [ ] `binary_mode` - `binary_mode=true` si el negocio necesita aprobacion/rechazo instantaneo (sin `pending`)
- [ ] `auth_and_capt` - `capture=false` para reservar fondos (auth + captura diferida)
- [ ] `logos` - mostrar el logo de Mercado Pago (confianza)
- [ ] `response_messages` - feedback claro al comprador segun el estado del pago
- [ ] `payer_id` / `customer_id` - al cobrar con tarjeta guardada, enviar `payer.id`

### Que ya cubre esta skill (y que falta sumar)

Ya cubierto por las references/codigo de la skill:
- `external_reference`, `webhooks_ipn` (`notification_url`), `statement_descriptor` (placeholder `YOUR_BRAND`),
  `payment_get_or_search_api` (el webhook consulta el pago) e idempotencia, `back_end_sdk` (SDK `mercadopago`),
  `ssl`/`tls` (HTTPS en prod), `refunds_api` / `cancellation_api` (`refunds-cancellations.md`).

Faltantes frecuentes que conviene agregar al armar el checkout:
- `email` + `payer_first_name`/`payer_last_name` y `item_title`/`item_description` (subir aprobacion).
- `device_id` en Checkout API (en Pro/Bricks ya es transparente).
- `secure_form` (secure fields) cuando se toman datos de tarjeta en tu sitio (Bricks / Card Payment).
- `binary_mode` (opcional, segun negocio) y `auth_and_capt` (si necesitas reservar fondos).

---

## Cuando usar cada tool durante esta skill

| Paso de la skill | Tool del MCP que ayuda |
|------------------|------------------------|
| Variables de entorno / credenciales | `get_credentials`, `create_application`, `application_list` |
| Configurar webhook (`references/webhooks.md`) | `save_webhook` |
| Dudas de contrato / test cards / errores | `search_documentation` |
| Checklist general de la skill | `quality_checklist` (ver set real arriba) |
| Verificacion final (post-pago) | `quality_evaluation` |
| Webhook que no llega (`references/troubleshooting.md`) | `notifications_history` |
| Salir a produccion / certificar | `form_homologation` |

# AGENTS.md

Instrucciones para agentes de IA (Codex, Cursor, Copilot, Gemini CLI, Windsurf, Zed, etc.).

> **Ejemplo de Synera.** Copiá este archivo a la raíz de TU proyecto (o a `~/.codex/AGENTS.md`
> para Codex global) y dejá solo las skills que uses. Bajá cada skill con degit, por ejemplo:
>
> ```bash
> npx degit synerarg/claude-code-skills/plugins/mercadopago/skills/mercadopago .ai/skills/mercadopago
> ```

## Skills disponibles

Leé el `SKILL.md` y sus `references/` **solo cuando la tarea lo amerite** (carga on-demand):

- **Mercado Pago** — pagos MP: Checkout Pro/Bricks/Orders API, suscripciones, Money Out (envío a
  cuentas bancarias), marketplace/split, webhooks, reembolsos, comisiones.
  → `.ai/skills/mercadopago/SKILL.md`
- **Correo Argentino (apiMiCorreo)** — envíos: auth, cotización, sucursales, creación de envíos,
  tracking, emails de estado, multi-tenant.
  → `.ai/skills/correo-argentino/SKILL.md`
- **AFIP/ARCA** — facturación electrónica: certificado, WSAA, WSFEv1, CAE.
  → `.ai/skills/afip-arca/SKILL.md`
- **Meta + n8n + WhatsApp** — recibir mensajes de WhatsApp/Instagram en n8n: app, webhook, HMAC.
  → `.ai/skills/meta-n8n-whatsapp/SKILL.md`
- **n8n en producción** — patrones a escala: debounce, claim, error handling, queue mode.
  → `.ai/skills/n8n-production-patterns/SKILL.md`

---

Skills por [Synera](https://synera.com.ar) · `synerarg/claude-code-skills` · dejá una ⭐

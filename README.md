# synera-skills

Marketplace de **skills de Synera** para developers. Integraciones de Argentina y
automatizaciones que en general son un quilombo de implementar, con el trabajo ya hecho.

## Skills

| Plugin | Qué hace | Alcance |
|---|---|---|
| `afip-arca` | Facturación electrónica AFIP/ARCA end-to-end: certificado, WSAA, WSFEv1, CAE. | 🇦🇷 Argentina |
| `meta-n8n-whatsapp` | Conectar una app de Meta a n8n para recibir mensajes de WhatsApp (y DM de Instagram). | 🌎 Global |
| `n8n-production-patterns` | Patrones de producción para workflows n8n a escala (WhatsApp + AI Agent + Postgres). | 🌎 Global |
| `mercadopago` | Mercado Pago completo: Checkout Pro, Bricks, Orders API, suscripciones, Money Out (envío a cuentas bancarias), marketplace/split, webhooks, reembolsos, comisiones y MCP oficial. | 🌎 LatAm |
| `correo-argentino` | Envíos con Correo Argentino (apiMiCorreo): auth, cotización, sucursales, envíos, tracking, crons y emails de estado. Contratos reales + multi-tenant. | 🇦🇷 Argentina |

## Instalación (Claude Code)

```shell
/plugin marketplace add synera/synera-skills
/plugin install afip-arca@synera-skills
/plugin install meta-n8n-whatsapp@synera-skills
/plugin install n8n-production-patterns@synera-skills
/plugin install mercadopago@synera-skills
/plugin install correo-argentino@synera-skills
```

Actualizar cuando se publican cambios:

```shell
/plugin marketplace update synera-skills
```

### Para todo el equipo (auto-prompt al confiar el repo)

Agregar a `.claude/settings.json` del proyecto:

```json
{
  "extraKnownMarketplaces": {
    "synera-skills": { "source": { "source": "github", "repo": "synera/synera-skills" } }
  },
  "enabledPlugins": {
    "afip-arca@synera-skills": true,
    "meta-n8n-whatsapp@synera-skills": true,
    "n8n-production-patterns@synera-skills": true,
    "mercadopago@synera-skills": true,
    "correo-argentino@synera-skills": true
  }
}
```

## Instalación sin plugins (copiar la skill a tu máquina)

```bash
# Una skill suelta a ~/.claude/skills/
npx degit synera/synera-skills/plugins/afip-arca/skills/afip-arca ~/.claude/skills/afip-arca
```

O usar `scripts/install.sh` (ver el script para elegir qué skills bajar).

## Estructura

```
synera-skills/
├─ .claude-plugin/marketplace.json     # catálogo
├─ plugins/
│  ├─ afip-arca/
│  │  ├─ .claude-plugin/plugin.json
│  │  └─ skills/afip-arca/
│  │     ├─ SKILL.md
│  │     ├─ references/                # 01 cert+WSAA, 02 WSFEv1, 03 errores
│  │     └─ scripts/wsaa.mjs           # cliente WSAA (TRA + CMS + LoginCMS + caché)
│  ├─ meta-n8n-whatsapp/
│  │  └─ skills/meta-n8n-whatsapp/
│  │     ├─ SKILL.md
│  │     └─ references/                # 01 Meta app, 02 conexión n8n + HMAC
│  └─ n8n-production-patterns/
│     └─ skills/n8n-production-patterns/SKILL.md
├─ scripts/install.sh
└─ README.md
```

## Convenciones para sumar una skill

- Un plugin por integración, en `plugins/<nombre>/`.
- `SKILL.md` = router liviano (qué hay y cuándo leer cada cosa). El conocimiento real va en
  `references/` y el código reusable en `scripts/`.
- La descripción del frontmatter es el disparador: incluí *qué hace* y *cuándo usarla*, y
  hacela "pushy" para que Claude la active aunque no la nombren explícito.
- Sumar el plugin al `plugins[]` del `marketplace.json`.

---

Synera · web · AI automations · brand · ads · synera@synera.com.ar

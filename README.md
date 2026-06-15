# claude-code-skills

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
/plugin marketplace add synerarg/claude-code-skills
/plugin install afip-arca@claude-code-skills
/plugin install meta-n8n-whatsapp@claude-code-skills
/plugin install n8n-production-patterns@claude-code-skills
/plugin install mercadopago@claude-code-skills
/plugin install correo-argentino@claude-code-skills
```

Actualizar cuando se publican cambios:

```shell
/plugin marketplace update claude-code-skills
```

### Para todo el equipo (auto-prompt al confiar el repo)

Agregar a `.claude/settings.json` del proyecto:

```json
{
  "extraKnownMarketplaces": {
    "claude-code-skills": { "source": { "source": "github", "repo": "synerarg/claude-code-skills" } }
  },
  "enabledPlugins": {
    "afip-arca@claude-code-skills": true,
    "meta-n8n-whatsapp@claude-code-skills": true,
    "n8n-production-patterns@claude-code-skills": true,
    "mercadopago@claude-code-skills": true,
    "correo-argentino@claude-code-skills": true
  }
}
```

## Instalación sin plugins (copiar la skill a tu máquina)

```bash
# Una skill suelta a ~/.claude/skills/
npx degit synerarg/claude-code-skills/plugins/afip-arca/skills/afip-arca ~/.claude/skills/afip-arca
```

O usar `scripts/install.sh` (ver el script para elegir qué skills bajar).

## Estructura

```
claude-code-skills/
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
│  ├─ n8n-production-patterns/
│  │  └─ skills/n8n-production-patterns/SKILL.md
│  ├─ mercadopago/
│  │  └─ skills/mercadopago/        # SKILL.md + 14 references + assets/migration.sql
│  └─ correo-argentino/
│     └─ skills/correo-argentino/   # SKILL.md + references (api-reference, multi-tenant)
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

## ⭐ Dejá una estrella

Si alguna skill te ahorró horas de leer documentación, **tirale una ⭐ al repo**. Es gratis,
nos hace felices y ayuda a que más devs las encuentren.

## Qué es Synera

[**Synera**](https://synera.com.ar) es un estudio argentino que construye producto y hace
crecer negocios. Estas skills son el mismo laburo que hacemos para clientes, liberado para la
comunidad:

- 🌐 **Web & producto** — apps full-stack (Next.js + Supabase), e-commerce, CRMs y dashboards.
- 🤖 **Automatizaciones con IA** — agentes, workflows n8n, bots de WhatsApp e integraciones a medida.
- 🎨 **Marca** — identidad visual y diseño.
- 📈 **Ads** — campañas de performance.

## Trabajemos juntos

¿Querés que integremos esto por vos o tenés un proyecto en mente?

- 🌐 Sitio: **[synera.com.ar](https://synera.com.ar)**
- ✉️ Email: **[synera@synera.com.ar](mailto:synera@synera.com.ar)**

---

Hecho con ☕ en Argentina por **[Synera](https://synera.com.ar)** · y no te olvides de la ⭐

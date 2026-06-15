---
name: n8n-production-patterns
description: >-
  Guía densa de patrones de producción para workflows de n8n a escala — especialmente
  WhatsApp + AI Assistant + Google Sheets + Supabase/Postgres. USAR SIEMPRE que el usuario
  trabaje con n8n, automatizaciones n8n, workflows n8n, WhatsApp Business Cloud, WhatsApp
  Trigger, AI Agent (Tools Agent), Postgres Chat Memory, debounce de mensajes, HMAC de Meta,
  sub-workflows, Execute Workflow, $fromAI(), Code nodes, $json overwrites, Wait nodes, Error
  Workflow, queue mode, rate limits de Sheets/OpenAI, o cuando mencione: 'n8n', 'workflow
  n8n', 'WhatsApp bot', 'asistente WhatsApp', 'AI agent n8n', 'tools agent', 'Respond to
  Webhook', 'pairedItem', 'queue mode', 'sub-workflow', 'Postgres memory', 'Bemol', 'Tinta'.
  También USAR cuando se quiera diseñar, debuggear, escalar, refactorizar o auditar un
  workflow de n8n con IA, especialmente si tiene >50 nodos o problemas de duplicación, $json
  roto, Wait raros, dedup en Sheets, o errores silenciosos.
---

# n8n Production Patterns — WhatsApp + AI Assistant

Referencia operativa densa para construir y auditar workflows de producción en n8n:
WhatsApp Business Cloud + AI Agent (Tools Agent) + Postgres Chat Memory + Supabase + Google
Sheets. Cada sección mapea a un dolor concreto y cita la URL oficial de docs.

> **Relación con otras skills del repo:** la *conexión* Meta ↔ n8n (crear la app, webhook,
> verify token, HMAC, recibir el mensaje) está en la skill `meta-n8n-whatsapp`. Esta skill
> arranca donde aquella termina: el mensaje ya entra a n8n y acá se define **cómo procesarlo
> y responder a escala**.

## Cómo usar esta skill

Cuando el usuario pida construir, escalar, refactorizar o debuggear un workflow n8n:

1. **Identificá el stack:** ¿WhatsApp Trigger? ¿AI Agent? ¿Sheets? ¿Supabase? ¿queue mode?
2. **Localizá la sección relevante** (índice abajo) y aplicá el patrón canónico literalmente
   — no improvises sobre temas con docs explícitos.
3. **Auditá contra los anti-patterns** de cada sección. La mayoría de los bugs en producción
   son anti-patterns documentados (`$json` después de un Send, dedup leyendo Sheets entera,
   Simple Memory en multi-user, Wait >65 s sin tunear lock duration, etc.).
4. Cuando uses el **checklist final (§15)** trabajalo top-to-bottom: cada item es un fix
   incremental que no requiere rewrite.

## Modelo mental del stack

El workflow vive en la intersección de cuatro realidades que pelean entre sí: redelivery +
20 s ack de Meta, token/rate quotas y latencia de OpenAI, 60 writes/min/user de Google
Sheets, y el modelo item-based de n8n donde `$json` es el item actual del input inmediato.
Cada patrón existe porque una de esas cuatro restricciones mordió a alguien.

Arquitectura golden para un asistente WhatsApp + AI a escala:

```
WhatsApp Trigger → Respond 200 inmediato → HMAC verify → Inbox INSERT (Supabase)
  → Wait N s (debounce) → Claim SQL → AI Agent (Tools Agent) con Postgres Chat Memory + tools
  → WhatsApp Send → Error Workflow safety net
```

## Índice de secciones

Las secciones viven en `references/`. Cada una es autocontenida; leé solo la relevante.

1. Webhook entry: WhatsApp triggers, response modes y HMAC
2. Pipelines de mensajes y el patrón debounce/claim (regla de los 65 s del Wait)
3. AI Agents: Tools Agent es el único sobre el que construir ($fromAI, tools, output parsers)
4. Memory y contexto per-user (Postgres/Redis Chat Memory, session isolation)
5. Prompt engineering dentro de n8n (Set vs Code, llave literal, template de system prompt)
6. Code nodes: reglas para workflows grandes (Run Once All/Each, $json overwrite, pairedItem)
7. Sub-workflows y el playbook "partir un monolito de 108 nodos"
8. Integraciones externas: Sheets, Supabase/Postgres, HTTP Request, WhatsApp, OpenAI, rate limits
9. Error handling y reliability (Error Workflow, Retry On Fail, fallback)
10. Triggers programados y follow-ups (Schedule Trigger, timezone, drift)
11. Observabilidad (Executions, pruning, logging, Prometheus, LangSmith)
12. Organización de workflows 108+ nodos (sticky notes, naming, tags/folders/projects)
13. Seguridad (encryption key, External Secrets, webhook auth, RBAC)
14. Performance y memoria (queue mode, binary data, memory-reduction)
15. **Checklist consolidado** (mapeado a workflows tipo "Bemol Alimentos") — empezar acá para auditar
16. URLs clave de la documentación oficial

## Nota de scaffolding

El cuerpo completo de las 16 secciones es el documento de patrones de producción que ya
mantenés. Para terminar de armar este plugin, esos contenidos van como archivos en
`references/` (uno por sección, o un único `patterns.md` con todo). El índice de arriba ya
refleja esa estructura.

## Afinados de validación (jun 2026)

La revisión técnica confirmó el contenido como vigente. Al volcar las secciones, incorporar
estos matices menores:

- **§3 AI Agent:** la falta de memoria aplica a **todos los chain nodes**, no solo al Basic
  LLM Chain (los docs dicen "none of the chain nodes support memory").
- **§4 Memoria:** además de que `sessionIdType` "auto" rompe en multi-user, **no usar Simple
  Memory en producción con queue mode** (no garantiza que cada llamada caiga en el mismo
  worker). El aislamiento entre usuarios depende del `sessionId` configurado, no es automático.
- **§8 Sheets:** las cuotas de lectura y escritura son **separadas** (60/min/usuario cada
  una) y el límite por proyecto es **300/min** para lecturas.
- **§8 Supabase/pgBouncer:** Supavisor 1.0+ agregó soporte de *named prepared statements* en
  transaction mode (con caveats de versión), pero **session mode (5432) sigue siendo lo más
  seguro** para prepared statements y transacciones.

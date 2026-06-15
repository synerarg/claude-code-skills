# apiMiCorreo — Arquitectura multi-tenant

Cómo servir **varias tiendas** desde una sola instancia, cada una con su propia cuenta de Correo (distinto `username/password`, `customerId` y remitente). Ejemplos en Postgres/Supabase + TypeScript, adaptables a cualquier stack.

> Principio rector: **nada de Correo se hardcodea ni vive en un singleton global.** Todo (credenciales, `customerId`, remitente, base URL) se resuelve por tenant.

---

## 1. Esquema SQL

### Cuentas de envío por tenant

```sql
create table public.shipping_accounts (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,                       -- o store_id
  provider      text not null default 'correo_argentino',
  username      text not null,
  -- Guardá el secreto cifrado (ver §3) o en un secrets manager / Supabase Vault.
  password_enc  bytea not null,
  customer_id   text not null,
  -- Remitente que se usa en /shipping/import:
  -- { firstName, lastName, email, phoneNumber,
  --   address: { streetName, streetNumber, floor, apartment, locality, provinceCode, postalCode } }
  sender        jsonb not null,
  api_base_url  text,                                -- opcional; default según ambiente
  is_test       boolean not null default false,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, provider)
);

create index idx_shipping_accounts_tenant on public.shipping_accounts(tenant_id);
```

### Envíos y eventos (por orden)

```sql
create table public.shipments (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null,
  order_id            uuid not null references public.orders(id) on delete cascade,
  provider            text not null default 'correo_argentino',
  method              text not null,                 -- 'home' | 'branch'
  status              text not null default 'pending',
  service_name        text,
  product_type        text,
  shipping_cost       numeric,
  branch_code         text,
  branch_name         text,
  recipient_name      text,
  recipient_email     text,
  recipient_phone     text,
  destination_address text,
  destination_city    text,
  destination_province text,
  destination_postal_code text,
  external_reference  text,                          -- extOrderId determinístico (idempotencia)
  external_shipment_id text,
  tracking_number     text,
  tracking_url        text,
  error_message       text,
  request_payload     jsonb default '{}'::jsonb,
  response_payload    jsonb default '{}'::jsonb,
  imported_at         timestamptz,
  last_synced_at      timestamptz,
  delivered_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (order_id)
);

create table public.shipment_events (
  id          uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  status      text not null,
  title       text,
  detail      text,
  payload     jsonb default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index idx_shipments_tenant_status on public.shipments(tenant_id, status);
create index idx_shipment_events_shipment on public.shipment_events(shipment_id);
```

---

## 2. RLS (aislamiento entre tenants)

```sql
alter table public.shipping_accounts enable row level security;
alter table public.shipments         enable row level security;
alter table public.shipment_events   enable row level security;

-- shipping_accounts: SOLO service_role (nunca exponer credenciales al cliente).
-- Sin policies "for authenticated" => deny-all para anon/usuario; el backend
-- accede con service_role, que bypassa RLS.

-- shipments / shipment_events: lectura del dueño de la orden o admin del tenant.
create policy shipments_tenant_read on public.shipments
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = shipments.order_id
        and (o.user_id = auth.uid() or public.is_tenant_admin(shipments.tenant_id))
    )
  );

create policy shipment_events_tenant_read on public.shipment_events
  for select using (
    exists (
      select 1 from public.shipments s
      where s.id = shipment_events.shipment_id
        and exists (
          select 1 from public.orders o
          where o.id = s.order_id
            and (o.user_id = auth.uid() or public.is_tenant_admin(s.tenant_id))
        )
    )
  );
```

Las **escrituras** de shipments/events las hace el backend con `service_role` (crons, webhooks, aprobación). `is_tenant_admin(tenant_id)` es tu helper de rol por tenant.

---

## 3. Secretos: cifrado en reposo

No guardes el `password` en texto plano. Opciones:

- **Supabase Vault** / secrets manager externo (recomendado): guardás una referencia, no el secreto.
- **pgcrypto** (cifrado simétrico en DB) con la key fuera de la DB (env del backend):

```sql
create extension if not exists pgcrypto;

-- Guardar (en el backend, nunca exponer la key):
-- insert into shipping_accounts (..., password_enc, ...)
-- values (..., pgp_sym_encrypt(<password>, current_setting('app.enc_key')), ...);

-- Leer (solo service_role, en el backend):
-- select pgp_sym_decrypt(password_enc, current_setting('app.enc_key')) as password ...
```

Nunca loguees `password` ni el JWT completo.

---

## 4. Resolución de config + cache de token POR TENANT

⚠️ El patrón de "un `let tokenCache` a nivel de módulo" **rompe multi-tenant**: mezcla el token de una tienda con el de otra. Cacheá por tenant/credencial.

```ts
type CorreoConfig = {
  tenantId: string
  username: string
  password: string
  customerId: string
  baseUrl: string
  sender: SenderInfo
}

// Cache de token por credencial (clave estable = username).
const tokenCache = new Map<string, { token: string; expiresAt: number }>()

async function getToken(cfg: CorreoConfig): Promise<string> {
  const hit = tokenCache.get(cfg.username)
  if (hit && hit.expiresAt > Date.now()) return hit.token

  const basic = Buffer.from(`${cfg.username}:${cfg.password}`).toString("base64")
  const res = await fetch(`${cfg.baseUrl}/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}` },
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`token ${res.status}`)
  const { token } = (await res.json()) as { token: string }

  // ~50 min (el JWT dura ~2.5h).
  tokenCache.set(cfg.username, { token, expiresAt: Date.now() + 50 * 60 * 1000 })
  return token
}

// Helper genérico: resuelve baseUrl por ambiente del tenant.
function resolveBaseUrl(account: { api_base_url?: string | null; is_test: boolean }) {
  return (
    account.api_base_url ||
    (account.is_test
      ? "https://apitest.correoargentino.com.ar/micorreo/v1"
      : "https://api.correoargentino.com.ar/micorreo/v1")
  )
}
```

Cargá la `CorreoConfig` desde `shipping_accounts` por el `tenant_id` de la orden/checkout, desencriptando el password en el backend. Pasá esa config a **todos** los métodos del servicio (`calculateQuote`, `listAgencies`, `importShipment`, `getTracking`).

---

## 5. Crons / sync por tenant

El cron de tracking debe procesar shipments de **todos** los tenants, resolviendo la cuenta correcta para cada uno:

```ts
const pending = await db.shipments.findMany({
  where: { status: { in: ["imported", "ready_to_ship", "in_transit"] } },
})

// Agrupar por tenant para reusar token y minimizar llamadas a /token.
const byTenant = groupBy(pending, (s) => s.tenant_id)
for (const [tenantId, shipments] of byTenant) {
  const cfg = await loadCorreoConfig(tenantId) // desencripta password
  for (const s of shipments) {
    const tracking = await getTracking(cfg, {
      trackingNumber: s.tracking_number,
      externalReference: s.external_reference,
    })
    // ...mapear estado, insertar evento sin duplicar, sync fulfill_status,
    //    disparar emails "en camino"/"entregado" en la primera transición.
  }
}
```

Buenas prácticas del cron:
- Iterá por tenant y reusá el token cacheado por credencial.
- Idempotencia: no dupliques `shipment_events` ni reenvíes emails (dedupe por flag/evento).
- Tolerá fallas por shipment sin abortar el batch entero.
- Logueá con `tenantId` + `orderId` + `trackingNumber`, sin credenciales.

---

## 6. Checklist multi-tenant

1. Credenciales + `customerId` + remitente **por tenant** en DB (no env globales).
2. Password cifrado o en secrets manager; nunca en texto plano ni en logs.
3. Token cacheado **por credencial**, no global.
4. Todos los métodos del servicio reciben/resuelven el contexto del tenant.
5. RLS para que una tienda no vea datos de otra.
6. Crons/webhooks resuelven el tenant desde cada registro.
7. `external_reference` (extOrderId) determinístico por orden para idempotencia.

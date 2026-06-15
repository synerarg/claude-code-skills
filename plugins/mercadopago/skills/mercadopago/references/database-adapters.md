# Database Adapters - Supabase, Prisma, Raw PostgreSQL

Implementaciones del helper `src/lib/db/purchases.ts` para diferentes ORMs/clientes de base de datos.

Antes de implementar, ejecutar `assets/migration.sql` en tu base de datos.

---

## Interface comun

Todas las implementaciones deben exportar estas funciones:

```typescript
interface PurchaseInsert {
  user_email: string;
  status: 'pending';
  total_amount: number;
}

interface PurchaseUpdate {
  status?: 'pending' | 'approved' | 'rejected';
  mercadopago_payment_id?: string;
  mercadopago_preference_id?: string;
  user_email?: string;
  updated_at?: string;
}

export async function createPurchase(data: PurchaseInsert): Promise<{ id: string }>;
export async function updatePurchase(id: string, data: PurchaseUpdate): Promise<void>;
export async function getPurchaseStatus(id: string): Promise<{ id: string; status: string } | null>;
export async function createPurchaseItems(purchaseId: string, items: { item_id: string; price: number }[]): Promise<void>;
```

---

## Supabase

### Prerequisitos

- `@supabase/supabase-js` instalado
- Server-side Supabase client (ej: `createServiceClient`)
- Migration ejecutada en Supabase SQL Editor

### Environment Variables

```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # Nunca exponer al frontend
```

### Implementacion

```typescript
// src/lib/db/purchases.ts
import { createServiceClient } from '@/lib/supabase/server';

interface PurchaseInsert {
  user_email: string;
  status: 'pending';
  total_amount: number;
}

interface PurchaseUpdate {
  status?: 'pending' | 'approved' | 'rejected';
  mercadopago_payment_id?: string;
  mercadopago_preference_id?: string;
  user_email?: string;
  updated_at?: string;
}

export async function createPurchase(data: PurchaseInsert) {
  const supabase = await createServiceClient();
  const { data: purchase, error } = await supabase
    .from('purchases')
    .insert(data)
    .select('id')
    .single();

  if (error || !purchase) {
    console.error('Error creating purchase:', error);
    throw new Error('Failed to create purchase');
  }
  return purchase;
}

export async function updatePurchase(id: string, data: PurchaseUpdate) {
  const supabase = await createServiceClient();
  const { error } = await supabase
    .from('purchases')
    .update(data)
    .eq('id', id);

  if (error) {
    console.error('Error updating purchase:', error);
    throw new Error('Failed to update purchase');
  }
}

export async function getPurchaseStatus(id: string) {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from('purchases')
    .select('id, status')
    .eq('id', id)
    .single();

  if (error || !data) return null;
  return data;
}

export async function createPurchaseItems(
  purchaseId: string,
  items: { item_id: string; price: number }[]
) {
  const supabase = await createServiceClient();
  const { error } = await supabase
    .from('purchase_items')
    .insert(items.map((item) => ({ purchase_id: purchaseId, ...item })));

  if (error) {
    console.error('Error creating purchase items:', error);
    throw new Error('Failed to create purchase items');
  }
}
```

### Server Client (si no existe)

```typescript
// src/lib/supabase/server.ts
import { createClient } from '@supabase/supabase-js';

export async function createServiceClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
```

### RLS opcional

```sql
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own purchases"
  ON public.purchases FOR SELECT
  USING (user_email = auth.jwt() ->> 'email');
-- Service role bypassa RLS (usado por API routes)
```

---

## Prisma

### Prerequisitos

- `prisma` y `@prisma/client` instalados
- PostgreSQL database (AWS RDS, Neon, Supabase, self-hosted, etc.)

### Setup

```bash
npm install prisma @prisma/client
npx prisma init
```

### Environment Variables

```env
DATABASE_URL=postgresql://user:password@host:5432/dbname
```

### Schema Prisma

Agregar a `prisma/schema.prisma`:

```prisma
model Purchase {
  id                       String         @id @default(uuid()) @db.Uuid
  user_email               String         @db.VarChar(255)
  mercadopago_payment_id   String?
  mercadopago_preference_id String?
  status                   String         @default("pending") @db.VarChar(20)
  total_amount             Decimal?       @db.Decimal(10, 2)
  created_at               DateTime       @default(now()) @db.Timestamptz()
  updated_at               DateTime       @default(now()) @db.Timestamptz()
  items                    PurchaseItem[]

  @@index([user_email])
  @@index([status])
  @@index([mercadopago_payment_id])
  @@map("purchases")
}

model PurchaseItem {
  id          String   @id @default(uuid()) @db.Uuid
  purchase_id String   @db.Uuid
  item_id     String   @db.Uuid
  price       Decimal  @db.Decimal(10, 2)
  purchase    Purchase @relation(fields: [purchase_id], references: [id], onDelete: Cascade)

  @@index([purchase_id])
  @@map("purchase_items")
}
```

Ejecutar: `npx prisma migrate dev --name add_purchases`

**Nota:** Si usas `assets/migration.sql` directamente, ejecutar `npx prisma db pull` para sincronizar el schema.

### Prisma Client Singleton

```typescript
// src/lib/prisma.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
export const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

### Implementacion

```typescript
// src/lib/db/purchases.ts
import { prisma } from '@/lib/prisma';

interface PurchaseInsert {
  user_email: string;
  status: 'pending';
  total_amount: number;
}

interface PurchaseUpdate {
  status?: 'pending' | 'approved' | 'rejected';
  mercadopago_payment_id?: string;
  mercadopago_preference_id?: string;
  user_email?: string;
  updated_at?: string;
}

export async function createPurchase(data: PurchaseInsert) {
  const purchase = await prisma.purchase.create({
    data: {
      user_email: data.user_email,
      status: data.status,
      total_amount: data.total_amount,
    },
    select: { id: true },
  });
  return purchase;
}

export async function updatePurchase(id: string, data: PurchaseUpdate) {
  await prisma.purchase.update({
    where: { id },
    data: {
      ...data,
      updated_at: data.updated_at ? new Date(data.updated_at) : new Date(),
    },
  });
}

export async function getPurchaseStatus(id: string) {
  return prisma.purchase.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
}

export async function createPurchaseItems(
  purchaseId: string,
  items: { item_id: string; price: number }[]
) {
  await prisma.purchaseItem.createMany({
    data: items.map((item) => ({
      purchase_id: purchaseId,
      item_id: item.item_id,
      price: item.price,
    })),
  });
}
```

---

## Raw PostgreSQL (pg, Drizzle, otros)

### Prerequisitos

- Driver `pg` o similar instalado
- Conexion a PostgreSQL

### Environment Variables

```env
DATABASE_URL=postgresql://user:password@host:5432/dbname
```

### Pool de conexion

```typescript
// src/lib/db/pool.ts
import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
```

### Implementacion

```typescript
// src/lib/db/purchases.ts
import { pool } from './pool';

interface PurchaseInsert {
  user_email: string;
  status: 'pending';
  total_amount: number;
}

interface PurchaseUpdate {
  status?: 'pending' | 'approved' | 'rejected';
  mercadopago_payment_id?: string;
  mercadopago_preference_id?: string;
  user_email?: string;
  updated_at?: string;
}

export async function createPurchase(data: PurchaseInsert) {
  const result = await pool.query(
    'INSERT INTO purchases (user_email, status, total_amount) VALUES ($1, $2, $3) RETURNING id',
    [data.user_email, data.status, data.total_amount]
  );
  return { id: result.rows[0].id };
}

export async function updatePurchase(id: string, data: PurchaseUpdate) {
  const sets: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      sets.push(`${key} = $${idx++}`);
      values.push(value);
    }
  }

  if (sets.length === 0) return;
  values.push(id);

  await pool.query(
    `UPDATE purchases SET ${sets.join(', ')} WHERE id = $${idx}`,
    values
  );
}

export async function getPurchaseStatus(id: string) {
  const result = await pool.query(
    'SELECT id, status FROM purchases WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

export async function createPurchaseItems(
  purchaseId: string,
  items: { item_id: string; price: number }[]
) {
  const values = items.map((_, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3})`).join(', ');
  const params = [purchaseId, ...items.flatMap((item) => [item.item_id, item.price])];

  await pool.query(
    `INSERT INTO purchase_items (purchase_id, item_id, price) VALUES ${values}`,
    params
  );
}
```

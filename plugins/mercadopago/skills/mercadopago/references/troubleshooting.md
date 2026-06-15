# Troubleshooting - Errores comunes y soluciones

## Indice

1. [auto_return + localhost = 400](#1-auto_return--localhost--400)
2. [Failed to create purchase (NULL email)](#2-failed-to-create-purchase-null-email)
3. [Hydration mismatch en checkout](#3-hydration-mismatch-en-checkout)
4. [Doble compra por doble-click](#4-doble-compra-por-doble-click)
5. [Pagina de exito sin verificacion real](#5-pagina-de-exito-sin-verificacion-real)
6. [Webhook no recibido localmente](#6-webhook-no-recibido-localmente)
7. [Webhook duplicados](#7-webhook-duplicados)
8. [Error useSearchParams en App Router](#8-error-usesearchparams-en-app-router)
9. [Preferencia rechazada (items invalidos)](#9-preferencia-rechazada-items-invalidos)
10. [Pago stuck en pending](#10-pago-stuck-en-pending)
11. [Error 400 al crear order (Orders API)](#11-error-400-al-crear-order)
12. [Brick no renderiza](#12-brick-no-renderiza)
13. [Error en reembolso](#13-error-en-reembolso)
14. [Webhook x-signature invalida](#14-webhook-x-signature-invalida)

---

## 1. auto_return + localhost = 400

**Error:** `auto_return invalid. back_url.success must be defined`

**Causa:** `auto_return: 'approved'` requiere que todas las `back_urls` sean HTTPS. En localhost (HTTP), MP rechaza la preferencia.

**Solucion:**

```typescript
const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

// En el body de la preferencia:
...(baseUrl.startsWith('https') ? { auto_return: 'approved' as const } : {}),
```

**Nota:** Sin `auto_return`, el comprador debe clickear "Volver al sitio" manualmente despues del pago en localhost.

---

## 2. Failed to create purchase (NULL email)

**Error:** 500 desde `/api/checkout` - `Failed to create purchase`

**Causa:** La columna `user_email` tiene constraint `NOT NULL` pero no se proporciono email al momento del checkout.

**Solucion:**

```typescript
user_email: email || 'pending@checkout',
```

MP recolecta el email del comprador durante el pago. El webhook actualiza `user_email` con el email real de `payment.payer.email`.

---

## 3. Hydration mismatch en checkout

**Error:** React hydration mismatch warning. Contenido difiere entre server y client.

**Causa:** El cart store usa `localStorage` (ej: zustand con `persist`). SSR no tiene acceso a `localStorage`.

**Solucion:**

```typescript
const [mounted, setMounted] = useState(false);
useEffect(() => { setMounted(true); }, []);

if (!mounted) return <LoadingSpinner />;
// Ahora es seguro renderizar contenido dependiente del cart
```

---

## 4. Doble compra por doble-click

**Causa:** Usuario clickea "Pagar" multiples veces antes de la redireccion.

**Solucion:** Usar `useRef` flag (sobrevive re-renders, a diferencia de state):

```typescript
const submittingRef = useRef(false);

const submit = async () => {
  if (submittingRef.current) return;
  submittingRef.current = true;
  // ... fetch ...
  // Solo resetear en error (el exito redirige fuera de la pagina)
};
```

Tambien deshabilitar el boton via `isSubmitting` state para feedback visual.

---

## 5. Pagina de exito sin verificacion real

**Causa:** La pagina confia en los parametros de la URL de redireccion sin verificar el estado real del pago en la DB.

**Solucion:** Siempre verificar via API:

```typescript
const res = await fetch(`/api/purchases/${purchaseId}`);
const data = await res.json();
// data.status es 'pending' | 'approved' | 'rejected'
```

---

## 6. Webhook no recibido localmente

**Causa:** MP no puede alcanzar `localhost`.

**Soluciones:**

1. **ngrok (recomendado para dev):**
   ```bash
   ngrok http 3000
   ```
   Setear `NEXT_PUBLIC_APP_URL` a la URL HTTPS de ngrok

2. **Sandbox:** Los pagos sandbox disparan webhooks si la URL es accesible

3. **Fallback local:** Confiar en el redirect flow. La pagina de exito mostrara `pending`.

---

## 7. Webhook duplicados

**Causa:** MP reintenta webhooks si no recibe 2xx, o envia multiples notificaciones para el mismo evento.

**Solucion:** Chequeo de idempotencia:

```typescript
const existing = await getPurchaseStatus(externalReference);
if (existing?.status === 'approved' || existing?.status === 'rejected') {
  return NextResponse.json({ received: true });
}
```

Siempre retornar `{ received: true }` incluso en errores para prevenir reintentos infinitos.

---

## 8. Error useSearchParams en App Router

**Error:** `useSearchParams() should be wrapped in a suspense boundary at page...`

**Causa:** Next.js App Router requiere `useSearchParams()` dentro de un `<Suspense>` boundary.

**Solucion:**

```tsx
function SuccessContent() {
  const searchParams = useSearchParams();
  // ... logica del componente
}

export default function SuccessPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SuccessContent />
    </Suspense>
  );
}
```

---

## 9. Preferencia rechazada (items invalidos)

**Error:** MP retorna 400 al crear preferencia.

**Causas comunes:**
- `unit_price` es 0 o negativo
- `quantity` es 0 o negativo
- `currency_id` no coincide con el pais de la cuenta
- `title` esta vacio

**Solucion:** Validar con Zod antes de llamar a MP:

```typescript
const checkoutSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    title: z.string().min(1),
    quantity: z.number().positive(),
    unit_price: z.number().positive(),
  })).min(1),
});
```

---

## 10. Pago stuck en pending

**Causas:**
1. Webhook nunca llego (problema de localhost)
2. Comprador uso medio que requiere tiempo (Rapipago, PagoFacil, Boleto, OXXO)
3. MP esta procesando

**Soluciones:**
- En dev: Verificar que el webhook es accesible
- En produccion: Es normal para medios offline. Mostrar UI apropiada:
  ```
  "Tu pago esta siendo procesado. Recibiras un email cuando se confirme."
  ```

---

## 11. Error 400 al crear order

**Causas comunes (Orders API):**
- `processing_mode` no especificado
- `token` de tarjeta invalido o expirado
- `payment_method_id` no coincide con el tipo de tarjeta
- `installments` no permitido para ese medio de pago
- Campos requeridos faltantes

**Solucion:** La Orders API retorna una **lista de errores** (a diferencia de la API de Pagos). Inspeccionar la respuesta completa:

```typescript
const data = await response.json();
if (!response.ok) {
  console.error('Orders API errors:', JSON.stringify(data, null, 2));
}
```

---

## 12. Brick no renderiza

**Causas comunes:**
- SDK no cargado (script `sdk.mercadopago.com/js/v2` no incluido)
- `PUBLIC_KEY` incorrecta o no proporcionada
- El container DOM no existe al momento de crear el Brick
- Error silencioso en `onError` callback

**Solucion:**

```typescript
// Verificar que el SDK esta cargado
if (!window.MercadoPago) {
  console.error('MercadoPago SDK not loaded');
  return;
}

// Verificar que el container existe
if (!containerRef.current) {
  console.error('Container ref is null');
  return;
}

// Agregar callback de error
callbacks: {
  onError: (error) => {
    console.error('Brick error:', error);
  }
}
```

---

## 13. Error en reembolso

**Causas comunes:**
- Pago no esta en estado `approved` (solo pagos aprobados se pueden reembolsar)
- Monto supera el total del pago
- Han pasado mas de 180 dias
- Saldo insuficiente en la cuenta del vendedor
- Access token incorrecto

**Solucion:** Verificar el estado del pago antes de intentar reembolso:

```typescript
const payment = await getPayment(paymentId);
if (payment.status !== 'approved') {
  throw new Error('Solo se pueden reembolsar pagos aprobados');
}
```

---

## 14. Webhook x-signature invalida

**Causas comunes:**
- Webhook secret incorrecto
- Orden de los campos en el manifest incorrecto
- `data.id` convertido a tipo incorrecto (number vs string)
- `x-request-id` header faltante

**Solucion:** Verificar el manifest exacto:

```typescript
// El manifest DEBE tener este formato exacto:
const manifest = `id:${dataId};request-id:${requestId};ts:${ts}`;
// dataId debe ser string
// requestId viene del header x-request-id
// ts viene del x-signature header (ts=VALUE)
```

Obtener el secret correcto: Tus integraciones -> Tu app -> Webhooks -> Secret

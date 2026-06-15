# Checkout Bricks - Integracion completa

Checkout Bricks son **modulos configurables** que se integran en tu sitio. El pago ocurre en tu pagina, sin redireccion. Mayor personalizacion y control del UX.

## Bricks disponibles

| Brick | Descripcion |
|-------|-------------|
| **Payment Brick** | Varios medios de pago en un modulo |
| **Card Payment Brick** | Solo tarjetas credito/debito |
| **Wallet Brick** | Boton "Pagar con Mercado Pago" |
| **Status Screen Brick** | Pantalla de estado post-pago |
| **Brand Brick** | (MLA) Ventajas de pagar con MP |

---

## Inicializacion comun

### Vanilla JavaScript

```javascript
const mp = new MercadoPago('PUBLIC_KEY', { locale: 'es-AR' });
const bricksBuilder = mp.bricks();
```

### React - Hook reutilizable

```tsx
// hooks/useMercadoPago.ts
import { useEffect, useState } from 'react';

export function useMercadoPago() {
  const [mp, setMp] = useState<typeof window.MercadoPago | null>(null);

  useEffect(() => {
    if (window.MercadoPago) {
      setMp(() => window.MercadoPago);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://sdk.mercadopago.com/js/v2';
    script.async = true;
    script.onload = () => setMp(() => window.MercadoPago);
    document.body.appendChild(script);
  }, []);

  return mp;
}
```

Uso en cualquier Brick:

```tsx
const MercadoPagoConstructor = useMercadoPago();
useEffect(() => {
  if (!MercadoPagoConstructor || !containerRef.current) return;
  const mp = new MercadoPagoConstructor(process.env.NEXT_PUBLIC_MP_PUBLIC_KEY!, {
    locale: 'es-AR'
  });
  const bricksBuilder = mp.bricks();
  bricksBuilder.create('payment', containerRef.current.id, settings);
}, [MercadoPagoConstructor]);
```

---

## Payment Brick

Integra varios medios de pago. Puede usar la misma API de Preferencias o la API de Pagos.

### Vanilla JavaScript

```javascript
const renderPaymentBrick = async (bricksBuilder) => {
  const settings = {
    initialization: {
      amount: 100,
      payer: { email: 'comprador@email.com' }
    },
    customization: { visual: { style: { theme: 'default' } } },
    callbacks: {
      onReady: () => {},
      onSubmit: (formData) => {
        return fetch('/api/create-payment', {
          method: 'POST',
          body: JSON.stringify(formData)
        }).then(res => res.json()).then(data => ({ paymentId: data.id }));
      },
      onError: (error) => console.error(error)
    }
  };
  await bricksBuilder.create('payment', 'paymentBrick_container', settings);
};
```

**Con preferencia (recomendado):** `settings.initialization = { preferenceId: 'PREFERENCE_ID' };`

### React

```tsx
'use client';

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    MercadoPago: new (key: string, opts?: { locale: string }) => {
      bricks: () => {
        create: (name: string, container: string, settings: object) => Promise<unknown>;
      };
    };
  }
}

export function PaymentBrick({
  preferenceId,
  onPaymentCreated
}: {
  preferenceId: string;
  onPaymentCreated?: (paymentId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadBrick = async () => {
      if (!window.MercadoPago || !containerRef.current) return;
      const mp = new window.MercadoPago(process.env.NEXT_PUBLIC_MP_PUBLIC_KEY!, {
        locale: 'es-AR'
      });
      const bricksBuilder = mp.bricks();
      await bricksBuilder.create('payment', containerRef.current.id, {
        initialization: { preferenceId },
        callbacks: {
          onReady: () => {},
          onSubmit: async (formData) => {
            const res = await fetch('/api/create-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(formData)
            });
            const data = await res.json();
            onPaymentCreated?.(data.id);
            return { paymentId: data.id };
          },
          onError: (error) => console.error(error)
        }
      });
    };
    loadBrick();
  }, [preferenceId, onPaymentCreated]);

  return <div id="paymentBrick_container" ref={containerRef} />;
}
```

---

## Card Payment Brick

Solo tarjetas. Requiere backend para crear el pago con la API de Pagos o Orders.

### Vanilla JavaScript

```javascript
const settings = {
  initialization: {
    amount: 100,
    payer: { email: 'comprador@email.com' }
  },
  callbacks: {
    onSubmit: async (formData) => {
      const res = await fetch('/api/payments', {
        method: 'POST',
        body: JSON.stringify(formData)
      });
      const { id } = await res.json();
      return { paymentId: id };
    }
  }
};
await bricksBuilder.create('cardPayment', 'container', settings);
```

### React

```tsx
'use client';

import { useEffect, useRef } from 'react';

export function CardPaymentBrick({
  amount,
  payerEmail,
  onPaymentCreated
}: {
  amount: number;
  payerEmail: string;
  onPaymentCreated?: (paymentId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadBrick = async () => {
      if (!window.MercadoPago || !containerRef.current) return;
      const mp = new window.MercadoPago(process.env.NEXT_PUBLIC_MP_PUBLIC_KEY!, {
        locale: 'es-AR'
      });
      const bricksBuilder = mp.bricks();
      await bricksBuilder.create('cardPayment', containerRef.current.id, {
        initialization: { amount, payer: { email: payerEmail } },
        callbacks: {
          onSubmit: async (formData) => {
            const res = await fetch('/api/payments', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(formData)
            });
            const { id } = await res.json();
            onPaymentCreated?.(id);
            return { paymentId: id };
          }
        }
      });
    };
    loadBrick();
  }, [amount, payerEmail, onPaymentCreated]);

  return <div id="cardPaymentBrick_container" ref={containerRef} />;
}
```

---

## Wallet Brick

Boton para pagar con cuenta Mercado Pago. Requiere `preferenceId`.

### Vanilla JavaScript

```javascript
const settings = {
  initialization: { preferenceId: 'PREFERENCE_ID' },
  callbacks: { onReady: () => {}, onError: (error) => console.error(error) }
};
await bricksBuilder.create('wallet', 'walletBrick_container', settings);
```

### React

```tsx
'use client';

import { useEffect, useRef } from 'react';

export function WalletBrick({ preferenceId }: { preferenceId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadBrick = async () => {
      if (!window.MercadoPago || !containerRef.current) return;
      const mp = new window.MercadoPago(process.env.NEXT_PUBLIC_MP_PUBLIC_KEY!, {
        locale: 'es-AR'
      });
      const bricksBuilder = mp.bricks();
      await bricksBuilder.create('wallet', containerRef.current.id, {
        initialization: { preferenceId },
        callbacks: {
          onReady: () => {},
          onError: (error) => console.error(error)
        }
      });
    };
    loadBrick();
  }, [preferenceId]);

  return <div id="walletBrick_container" ref={containerRef} />;
}
```

---

## Status Screen Brick

Muestra el resultado del pago. Ideal para paginas de exito/error.

### Vanilla JavaScript

```javascript
const settings = {
  initialization: { paymentId: 'PAYMENT_ID' },
  callbacks: { onReady: () => {}, onError: (error) => console.error(error) }
};
await bricksBuilder.create('statusScreen', 'statusBrick_container', settings);
```

### React

```tsx
'use client';

import { useEffect, useRef } from 'react';

export function StatusScreenBrick({ paymentId }: { paymentId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadBrick = async () => {
      if (!window.MercadoPago || !containerRef.current) return;
      const mp = new window.MercadoPago(process.env.NEXT_PUBLIC_MP_PUBLIC_KEY!, {
        locale: 'es-AR'
      });
      const bricksBuilder = mp.bricks();
      await bricksBuilder.create('statusScreen', containerRef.current.id, {
        initialization: { paymentId },
        callbacks: {
          onReady: () => {},
          onError: (error) => console.error(error)
        }
      });
    };
    loadBrick();
  }, [paymentId]);

  return <div id="statusScreenBrick_container" ref={containerRef} />;
}
```

---

## 3DS con Checkout Bricks

1. En el backend, al crear el pago, agregar:

```json
{ "three_d_secure_mode": "optional" }
```

2. Si `status_detail` es `pending_challenge`, usar `three_ds_info` con Status Screen Brick:

```javascript
settings.initialization = {
  paymentId: paymentId,
  additionalInfo: {
    externalResourceURL: three_ds_info.external_resource_url,
    creq: three_ds_info.creq
  }
};
```

---

## Backend - API de Pagos (para Card Payment Brick)

Cuando usas Card Payment Brick, el frontend genera un token de tarjeta. El backend crea el pago:

```typescript
// app/api/payments/route.ts
import { NextResponse } from 'next/server';
import { MercadoPagoConfig, Payment } from 'mercadopago';

const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN!
});
const paymentClient = new Payment(client);

export async function POST(request: Request) {
  const body = await request.json();

  try {
    const result = await paymentClient.create({
      body: {
        transaction_amount: body.transaction_amount,
        token: body.token,
        description: body.description || 'Compra en tienda',
        installments: body.installments || 1,
        payment_method_id: body.payment_method_id,
        payer: {
          email: body.payer.email,
          identification: body.payer.identification
        },
        notification_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/mercadopago`,
      }
    });

    return NextResponse.json({
      id: result.id,
      status: result.status,
      status_detail: result.status_detail,
      three_ds_info: result.three_ds_info
    });
  } catch (error) {
    console.error('Payment error:', error);
    return NextResponse.json({ error: 'Payment failed' }, { status: 500 });
  }
}
```

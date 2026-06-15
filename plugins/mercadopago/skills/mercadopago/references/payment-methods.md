# Medios de pago, Currencies y Test Cards

## Paises soportados

| Pais | Currency | `currency_id` | Portal developers |
|------|----------|---------------|-------------------|
| Argentina | Peso argentino | `ARS` | mercadopago.com.ar/developers |
| Brasil | Real | `BRL` | mercadopago.com.br/developers |
| Mexico | Peso mexicano | `MXN` | mercadopago.com.mx/developers |
| Colombia | Peso colombiano | `COP` | mercadopago.com.co/developers |
| Chile | Peso chileno | `CLP` | mercadopago.cl/developers |
| Peru | Sol | `PEN` | mercadopago.com.pe/developers |
| Uruguay | Peso uruguayo | `UYU` | mercadopago.com.uy/developers |

## Notas importantes sobre currencies

- El `currency_id` en la preferencia **debe coincidir con el pais de la cuenta MercadoPago**. Una cuenta argentina solo puede usar `ARS`.
- No hay pagos cross-border via Checkout Pro. Cada pais requiere su propia cuenta MP.
- `CLP` y `COP` **no soportan decimales**. Usar numeros enteros.

---

## Credenciales de test

Cada pais tiene credenciales de test separadas. Obtener en:
`https://www.mercadopago.com/developers/panel/app`

- **Public Key:** Empieza con `TEST-` (seguro para frontend, prefix `NEXT_PUBLIC_` OK)
- **Access Token:** Empieza con `TEST-` (solo backend, **nunca** exponer al frontend)

---

## Test Cards por pais

### Argentina (ARS)

| Tarjeta | Numero | CVV | Vencimiento |
|---------|--------|-----|-------------|
| Visa (aprobada) | 4509 9535 6623 3704 | 123 | 11/25 |
| Mastercard (aprobada) | 5031 7557 3453 0604 | 123 | 11/25 |
| Visa (rechazada) | 4000 0000 0000 0036 | 123 | 11/25 |

### Brasil (BRL)

| Tarjeta | Numero | CVV | Vencimiento |
|---------|--------|-----|-------------|
| Visa (aprobada) | 4235 6477 2802 5682 | 123 | 11/25 |
| Mastercard (aprobada) | 5031 4332 1540 6351 | 123 | 11/25 |

### Mexico (MXN)

| Tarjeta | Numero | CVV | Vencimiento |
|---------|--------|-----|-------------|
| Visa (aprobada) | 4075 5957 1648 3764 | 123 | 11/25 |

Para todas las test cards, usar cualquier nombre y un numero de documento en formato valido (DNI, CPF, etc.).

Lista completa: https://www.mercadopago.com/developers/en/docs/checkout-pro/additional-content/your-integrations/test/cards

---

## Medios de pago por pais

### Argentina (MLA)

| Medio | Tipo | ID |
|-------|------|----|
| Visa | Credito/Debito | `visa` / `debvisa` |
| Mastercard | Credito/Debito | `master` / `debmaster` |
| American Express | Credito | `amex` |
| Naranja | Credito | `naranja` |
| Cabal | Credito/Debito | `cabal` |
| Maestro | Debito | `maestro` |
| Rapipago | Efectivo | `rapipago` |
| Pago Facil | Efectivo | `pagofacil` |
| Cuenta Mercado Pago | Wallet | - |
| Cuotas sin Tarjeta | Credito | Requiere `purpose: "onboarding_credits"` |

### Brasil (MLB)

- Credito: Visa, Mastercard, Amex, Elo, Hipercard
- Debito: Disponible
- Efectivo/Boleto: Boleto Bancario
- Pix: Disponible (pago instantaneo)

### Mexico (MLM)

- Credito: Visa, Mastercard, Amex
- Efectivo: OXXO, PayCash
- Transferencia bancaria: SPEI

### Colombia (MCO)

- Credito: Visa, Mastercard, Amex, Diners
- Efectivo: Efecty, Baloto
- Transferencia bancaria: PSE

### Chile (MLC)

- Credito: Visa, Mastercard, Amex, Diners
- Debito: Redcompra
- Transferencia bancaria: Webpay

### Peru (MPE)

- Credito: Visa, Mastercard, Amex, Diners
- Efectivo: PagoEfectivo

### Uruguay (MLU)

- Credito: Visa, Mastercard, Amex, Diners
- Debito: Disponible

---

## Tipos de pago para exclusion

Usar en `excluded_payment_types` de la preferencia:

- `credit_card` - Tarjetas de credito
- `debit_card` - Tarjetas de debito
- `prepaid_card` - Tarjetas prepagas
- `ticket` - Efectivo (Rapipago, Pago Facil, Boleto, OXXO, etc.)
- `bank_transfer` - Transferencia bancaria
- `atm` - Cajero automatico
- `digital_wallet` - Billetera digital
- `digital_currency` - Moneda digital

---

## Requisitos de notification_url

- Debe ser HTTPS en produccion
- Debe ser publicamente accesible (no localhost)
- Debe retornar HTTP 200 o 201
- Tiempo maximo de respuesta: 500ms recomendado (MP reintenta en timeout)
- Para desarrollo local, usar ngrok: `ngrok http 3000`

# apiMiCorreo — Referencia completa de endpoints

Referencia detallada de cada endpoint. Los contratos de `/token`, `/register`, `/rates`, `/agencies` y `/shipping/tracking` están **verificados empíricamente contra producción**. El de `/shipping/import` está marcado como *a confirmar* (crea un envío real, no se prueba a ciegas).

Convención: `<...>` son placeholders. Base URL según ambiente:

- Test: `https://apitest.correoargentino.com.ar/micorreo/v1`
- Prod: `https://api.correoargentino.com.ar/micorreo/v1`

Las mismas credenciales sirven para ambos ambientes; el JWT trae `"member of": "ApiMiCorreoTest" | "ApiMiCorreoProd"` según la URL.

---

## `POST /token` — Autenticación (Basic Auth) ✅ verificado

```http
POST /token
Authorization: Basic base64(<USERNAME>:<PASSWORD>)
```

Sin body. Respuesta `200`:

```json
{ "token": "<JWT>", "expire": "YYYY-MM-DD HH:mm:ss" }
```

- El JWT dura ~2.5 h (campo `exp`). Cachealo ~50 min.
- Todas las demás llamadas: `Authorization: Bearer <token>` + `Content-Type: application/json`.
- Error: con body JSON en vez de Basic → `401 "Header List is null or empty"`.

---

## `POST /register` — Alta de cliente / obtener customerId ✅ verificado

```http
POST /register
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "email": "<email>",
  "password": "<password>",
  "firstName": "<nombre>",
  "lastName": "<apellido>",
  "documentType": "CUIT",
  "documentId": "<dígitos sin guiones>",
  "phone": "<telefono>",
  "cellPhone": "<celular>",
  "address": {
    "streetName": "<calle>",
    "streetNumber": "<numero>",
    "floor": "",
    "apartment": "",
    "locality": "<localidad>",
    "city": "<ciudad>",
    "provinceCode": "<código 1 letra>",
    "postalCode": "<CP>"
  }
}
```

Respuesta `200`:

```json
{ "customerId": "<CUSTOMER_ID>", "createdAt": "YYYY-MM-DD HH:mm:ss.SSS" }
```

- `documentType`: `"CUIT"` | `"DNI"`.
- La API valida campo por campo y aborta en el primer faltante (ej. `400 "Invlid empty mail"`).
- Email ya registrado → `402 "El usuario: <email>, ya fue dado de alta exitosamente!"` (NO devuelve el customerId).
- Alta global: test y prod comparten usuarios; un alta sirve para ambos.

---

## `POST /rates` — Cotización ✅ verificado

```http
POST /rates
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "customerId": "<CUSTOMER_ID>",
  "postalCodeOrigin": "<CP origen>",
  "postalCodeDestination": "<CP destino>",
  "deliveredType": "D",
  "dimensions": { "weight": 900, "height": 18, "width": 18, "length": 18 }
}
```

- `deliveredType`: `"D"` domicilio | `"S"` sucursal.
- `dimensions`: peso en **gramos**, medidas en **cm**.
- ⚠️ La API rechaza campos extra (`FAIL_ON_UNKNOWN_PROPERTIES`): NO mandes `parcelWeight`/`parcelWidth`/`parcelHeight`/`parcelLength` ni `declaredValue` → `400 "Unrecognized field 'X'"`.

Respuesta `202`:

```json
{ "customerId": "<CUSTOMER_ID>", "validTo": null, "rates": [ /* tarifas */ ] }
```

Si `rates` viene `[]` en todas las pruebas → la cuenta no está habilitada comercialmente (ver SKILL.md §4).

---

## `GET /agencies` — Sucursales ✅ verificado

Usa **query params** (no path params):

```http
GET /agencies?customerId=<CUSTOMER_ID>&provinceCode=<COD>&postalCode=<CP>
Authorization: Bearer <token>
```

- Path params (`/agencies/{id}/{prov}/{cp}`) → `404`.
- Falta algún param → `400 "Hay campos obligatorios vacios"`.
- Respuesta `200`: array de sucursales. Parsealo defensivo — los nombres de campo varían:
  - id: `agency_id` | `code` | `id`
  - nombre: `agency_name` | `name`
  - también: `address`, `location`/`locality`, `province`, `email`, `phone`, `hours1`/`hours2`, `status`.

---

## `GET /shipping/tracking` — Tracking ✅ verificado (path/método)

```http
GET /shipping/tracking?customerId=<CUSTOMER_ID>&trackingNumber=<TRACKING>
Authorization: Bearer <token>
Content-Type: application/json
```

- Es **GET**. Con `POST` → `405`. Sin `Content-Type` → `415`.
- Paths alternativos (`/shippingtracking`, `/tracking`) → `404`.
- Parseá los eventos de forma defensiva: la respuesta puede venir como array directo o bajo `events` / `tracking` / `history` / `trackingHistory`. Cada evento suele tener `status`/`statusName`/`event`/`motiveDescription`, `date`/`eventDate`/`dateTime`, `description`.

Mapeo de texto de evento → estado (con `includes`/regex en minúsculas):

| Contiene | Estado |
|---|---|
| `preimposicion`, `imposicion`, `admis` | admitido / preparación |
| `transit`, `despach`, `planta`, `clasificac`, `distribuci`, `reparto`, `en camino` | en tránsito |
| `entregado`, `delivered` | entregado |
| `devolu`, `returned` | devuelto |
| `cancelad` | cancelado |
| `caduca`, `fallid`, `rechaz` | fallido |

---

## `POST /shipping/import` — Crear/importar envío ⚠️ a confirmar

> El path y método están confirmados, pero el **payload exacto NO se verificó contra la API** (crea un envío real). La estructura de abajo es consistente con los contratos verificados (objeto `address` anidado igual que en `/register`) y con implementaciones de referencia. **Confirmá los nombres de campo exactos contra la doc oficial de tu acuerdo y/o con un envío de prueba controlado antes de usarlo en prod.**

```http
POST /shipping/import
Authorization: Bearer <token>
Content-Type: application/json
```

```jsonc
{
  "order": {
    "customerId": "<CUSTOMER_ID>",
    "extOrderId": "<external_reference único de tu orden>",
    "contents": "<descripción corta de los items>",
    "declaredValue": 0,
    "totalValue": 0
  },
  "sender": {
    "firstName": "<nombre remitente>",
    "lastName": "<apellido remitente>",
    "email": "<email remitente>",
    "phoneNumber": "<telefono>",
    "address": {
      "streetName": "<calle>",
      "streetNumber": "<numero>",
      "floor": "",
      "apartment": "",
      "locality": "<localidad>",
      "provinceCode": "<COD>",
      "postalCode": "<CP>"
    }
  },
  "recipient": {
    "firstName": "<nombre destinatario>",
    "lastName": "<apellido destinatario>",
    "email": "<email destinatario>",
    "phoneNumber": "<telefono>",
    "address": {
      "streetName": "<calle>",
      "streetNumber": "<numero>",
      "floor": "",
      "apartment": "",
      "locality": "<localidad>",
      "provinceCode": "<COD>",
      "postalCode": "<CP>"
    }
  },
  "shipping": {
    "deliveryType": "D",            // "D" domicilio | "S" sucursal
    "productType": "CP",            // tipo de producto/servicio de tu acuerdo
    "branchCode": "",              // requerido si deliveryType = "S"
    "branchName": ""
  }
}
```

Notas:
- `extOrderId` debe ser determinístico y único por orden (idempotencia — ver multi-tenant.md y SKILL.md §9).
- `/shipping/import` puede no devolver tracking útil de inmediato; lo completa el cron de `/shipping/tracking`.
- No bloquees la orden si el import falla: persistí el shipment local y reintentá.

---

## Códigos de provincia (provinceCode)

| Provincia | Código |
|---|---|
| Buenos Aires | B |
| CABA / Capital Federal | C |
| Catamarca | K |
| Chaco | H |
| Chubut | U |
| Córdoba | X |
| Corrientes | W |
| Entre Ríos | E |
| Formosa | P |
| Jujuy | Y |
| La Pampa | L |
| La Rioja | F |
| Mendoza | M |
| Misiones | N |
| Neuquén | Q |
| Río Negro | R |
| Salta | A |
| San Juan | J |
| San Luis | D |
| Santa Cruz | Z |
| Santa Fe | S |
| Santiago del Estero | G |
| Tierra del Fuego | V |
| Tucumán | T |

---

## Tabla de errores observados

| HTTP / mensaje | Causa |
|---|---|
| `401 "Header List is null or empty"` | `/token` con body JSON en vez de Basic Auth |
| `400 "Unrecognized field 'X'"` | campo de más en el payload (ej. `/rates` con `parcel*`/`declaredValue`) |
| `400 "Hay campos obligatorios vacios"` | `/agencies` sin `customerId`/`provinceCode`/`postalCode` |
| `400 "Invlid empty mail"` | `/register` sin `email` |
| `402 "ya fue dado de alta"` | `/register` con email existente |
| `404` | path inexistente o path params donde van query params |
| `405` | método incorrecto (ej. POST a `/shipping/tracking`) |
| `415` | falta `Content-Type: application/json` |

# 01 — Certificado digital y autenticación WSAA

Las dos primeras capas: conseguir la identidad (certificado) y usarla para sacar un Ticket
de Acceso (TA) del WSAA.

## Parte A — Certificado digital

### A.1 Generar clave privada + CSR (OpenSSL)

Esto se hace una sola vez por CUIT/ambiente. La clave privada **nunca** se comparte ni se
sube al repo.

```bash
# 1) Clave privada RSA 2048 (AFIP exige mínimo 2048)
openssl genrsa -out synera.key 2048

# 2) Solicitud de certificado (CSR)
#    Importante: en serialNumber va la palabra literal "CUIT", un espacio, y los 11 dígitos
#    del CUIT sin guiones.
openssl req -new -key synera.key \
  -subj "/C=AR/O=SYNERA/CN=facturador/serialNumber=CUIT 20XXXXXXXXX" \
  -out synera.csr
```

- `O` = organización (razón social o nombre).
- `CN` = nombre del sistema/equipo (libre, ej. `facturador`).
- `serialNumber` = `CUIT ` + 11 dígitos. El espacio y la palabra `CUIT` son obligatorios.

> Sobre la versión de OpenSSL: tanto 1.1.1 como 3.x firman el CMS correctamente (el manual
> oficial del WSAA usa `openssl cms -sign`). No hay evidencia de que 3.x produzca firmas
> rechazadas por sí mismo. Si el WSAA rechaza el CMS (`cms.bad` / "El CMS no es válido") la
> causa real, según el FAQ del manual oficial, es casi siempre: certificado inválido o
> vencido, ambiente equivocado (cert de homologación contra producción o viceversa), o
> parámetros mal pasados (servicio o TTL). Diagnosticá por ahí, no por la versión del binario.

### A.2 Obtener el certificado

**Homologación (testing):**
1. Entrar a AFIP/ARCA con clave fiscal → buscar y adherir el servicio **"WSASS –
   Autogestión Certificados Homologación"** (Autoservicio de Acceso a APIs de Homologación).
2. "Nuevo Certificado" → pegar el contenido del CSR (`synera.csr`) → obtenés un `.crt`/`.pem`
   que guardás como `synera.crt`.
3. En homologación el CUIT **no se valida** y no hace falta que sea persona jurídica: podés
   sacar el certificado a tu nombre para probar. (Excepción: web services MiPyME, que exigen
   estar en el listado de Empresas Grandes de Homo.)

**Producción:**
1. Entrar con clave fiscal → servicio **"Administrador de Certificados Digitales"**.
2. Crear un alias, subir el CSR, descargar el certificado `.crt`.

### A.3 Asociar el certificado al WS de negocio (paso que casi todos olvidan)

Tener el certificado **no alcanza**. Hay que crear una **autorización / relación** que diga
"este certificado puede consumir el WS Facturación Electrónica".

- En homologación: dentro de WSASS → "Crear autorización" → elegir el servicio
  **`wsfe` (Facturación Electrónica)** y el certificado.
- En producción: en el "Administrador de Relaciones de Clave Fiscal" → Nueva Relación →
  buscar el servicio de Facturación Electrónica (WSFE) → seleccionar el certificado como
  representante.

Si te salteás esto, autenticás bien contra el WSAA pero al facturar te rebota con
`coe.notAuthorized` ("Computador no autorizado a acceder al servicio").

## Parte B — WSAA: del certificado al Ticket de Acceso

El WSAA implementa autenticación con certificados X.509 sobre SOAP (Apache Axis 1.4, viejo
pero estable). El flujo tiene 4 pasos.

### B.1 Generar el TRA (LoginTicketRequest.xml)

Documento XML con un id único y ventana temporal. `<service>` debe ser `wsfe` para facturar.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>1718460000</uniqueId>
    <generationTime>2026-06-15T12:00:00-03:00</generationTime>
    <expirationTime>2026-06-15T12:10:00-03:00</expirationTime>
  </header>
  <service>wsfe</service>
</loginTicketRequest>
```

- `uniqueId`: entero creciente (usar epoch en segundos sirve).
- `generationTime` / `expirationTime`: ISO-8601 con offset. La ventana suele ser de minutos
  (ej. ahora − 5 min a ahora + 10 min). **Sincronizá el reloj del server (NTP)**: si tu
  reloj está corrido, AFIP rechaza el TRA por expirado/futuro.

### B.2 Firmar el TRA como CMS / PKCS#7

```bash
openssl cms -sign \
  -in   LoginTicketRequest.xml \
  -signer synera.crt \
  -inkey  synera.key \
  -nodetach -outform DER \
  -out  LoginTicketRequest.xml.cms

base64 LoginTicketRequest.xml.cms > LoginTicketRequest.xml.cms.base64
```

(`openssl smime -sign ... -outform DER -nodetach | base64` es equivalente en builds viejas.)
El resultado base64 es lo que va en el parámetro `in0` de `LoginCMS`.

### B.3 Llamar a LoginCMS

SOAP 1.1 contra el endpoint del ambiente. Envelope mínimo:

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
  <soapenv:Header/>
  <soapenv:Body>
    <wsaa:loginCms>
      <wsaa:in0>BASE64_DEL_CMS_ACA</wsaa:in0>
    </wsaa:loginCms>
  </soapenv:Body>
</soapenv:Envelope>
```

POST a `https://wsaahomo.afip.gov.ar/ws/services/LoginCms` (homo) o `.../wsaa.afip.gov.ar/...`
(prod), header `Content-Type: text/xml; charset=utf-8` y `SOAPAction: ""`.

### B.4 Parsear el LoginTicketResponse y extraer el TA

La respuesta trae un `<loginCmsReturn>` con un XML escapeado adentro. Desescapado se ve así:

```xml
<loginTicketResponse>
  <header>
    <expirationTime>2026-06-16T00:00:00.000-03:00</expirationTime>
  </header>
  <credentials>
    <token>PD94bWwgdmVyc2lvbj0i...</token>
    <sign>kF3l9c0...</sign>
  </credentials>
</loginTicketResponse>
```

`token` + `sign` son el TA. Junto con tu `Cuit` van en el header de auth de cada llamada a
WSFEv1. **Guardá también `expirationTime`** para saber cuándo renovar.

### B.5 Caché y reutilización del TA (no negociable)

El TA dura **12 horas**. Pedir uno nuevo mientras hay uno válido devuelve
`coe.alreadyAuthenticated`. Persistí `{ token, sign, expirationTime }` (Supabase/Vault/disco)
keyed por `cuit + ambiente` y reusalo hasta unos minutos antes de `expirationTime`. El script
`scripts/wsaa.mjs` ya implementa este caché en disco.

## Checklist de la capa de identidad/auth

- [ ] Clave privada 2048 generada y guardada fuera del repo.
- [ ] CSR con `serialNumber=CUIT <11 dígitos>`.
- [ ] Certificado obtenido en el ambiente correcto (WSASS homo / Admin Certif prod).
- [ ] Certificado **asociado** al servicio `wsfe` (autorización/relación creada).
- [ ] Reloj del server sincronizado por NTP.
- [ ] TA cacheado y reusado por 12 h, no pedido en cada request.
- [ ] Certificado de homo NO usado contra prod ni viceversa.

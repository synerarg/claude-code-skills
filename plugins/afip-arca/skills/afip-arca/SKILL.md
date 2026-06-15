---
name: afip-arca
description: >-
  Implementar facturación electrónica de AFIP/ARCA (Argentina) de punta a punta desde
  código: obtener y asociar el certificado digital, autenticarse con el WSAA (TRA + CMS
  firmado + LoginCMS), y emitir comprobantes con WSFEv1 para conseguir el CAE. USAR SIEMPRE
  que el usuario mencione facturación electrónica, factura electrónica, AFIP, ARCA, WSFEv1,
  WSFE, WSAA, CAE, CAEA, "facturar desde mi sistema", comprobante electrónico, factura A/B/C,
  punto de venta electrónico, monotributo facturando por API, o cuando pida emitir/autorizar
  comprobantes argentinos, integrar facturación a un CRM/ecommerce, o resolver errores como
  "coe.notAuthorized", "cms.cert.untrusted", "El CEE ya posee un TA", CondicionIVAReceptorId,
  o problemas de homologación vs producción. Activar incluso si no nombran el web service
  exacto: "quiero que mi app facture en Argentina" alcanza.
---

# Facturación electrónica AFIP / ARCA (WSFEv1)

> ARCA (Agencia de Recaudación y Control Aduanero) es el organismo que reemplazó a AFIP en
> octubre de 2024 (Decreto 953/2024). Los web services, endpoints y CUIT siguen funcionando
> igual; cambió el nombre y parte de la documentación. En esta skill uso "AFIP/ARCA"
> indistintamente y los hostnames de los WS **siguen siendo `afip.gov.ar`** según el manual
> oficial vigente (algunas guías de terceros muestran `arca.gob.ar`, pero el manual conserva
> `afip.gov.ar`).
>
> ⚠️ **Vigencia normativa:** la facturación electrónica AR cambia seguido por resoluciones
> generales con fechas que ARCA reprorroga. Los datos normativos de esta skill están al día a
> **junio 2026**; antes de poner algo en producción, **verificá las fechas de corte contra la
> última RG en el Boletín Oficial** (en particular `CondicionIVAReceptorId` y CAEA-contingencia,
> ambos con cortes previstos en 2026). El núcleo técnico (WSAA, métodos, estructura) es estable.

Esta skill implementa el flujo completo para que un sistema (Next.js, Node, lo que sea)
emita comprobantes electrónicos válidos y obtenga el **CAE** (Código de Autorización
Electrónico) sin intervención manual.

## Modelo mental: tres capas que hay que atravesar en orden

Facturar por API es difícil porque son tres subsistemas encadenados, y un error en
cualquiera tira todo abajo con mensajes crípticos:

1. **Identidad** — un certificado digital X.509 emitido por la AC de ARCA, atado a tu CUIT,
   asociado al web service de negocio "Facturación Electrónica". Sin esto no autenticás.
2. **Autenticación (WSAA)** — con el certificado firmás un *Ticket de Requerimiento de
   Acceso* (TRA) como CMS/PKCS#7, lo mandás a `LoginCMS`, y recibís un *Ticket de Acceso*
   (TA) con un `token` y un `sign`. El TA **dura 12 horas** y hay que cachearlo.
3. **Negocio (WSFEv1)** — con `token` + `sign` + `Cuit` en el header de auth, consultás el
   último comprobante autorizado, armás el comprobante nuevo y pedís el CAE.

```
[Certificado .crt + .key]  →  WSAA.LoginCMS(TRA firmado)  →  TA{token, sign}  →  WSFEv1.FECAESolicitar  →  CAE
        (una vez)                  (cada 12 h, cachear)                              (cada comprobante)
```

Cada capa tiene su propio archivo de referencia. **No improvises sobre estos temas: tienen
documentación oficial estricta y los errores son por desviarse de ella.**

## Cómo usar esta skill

1. **Identificá en qué capa está el usuario.** ¿No tiene certificado todavía? → empezá por
   `references/01-certificado-y-wsaa.md`. ¿Ya autentica pero falla al facturar? →
   `references/02-wsfev1-emitir.md`. ¿Tira un error raro? → `references/03-errores-y-gotchas.md`
   PRIMERO, porque el 90% de los problemas son errores documentados.
2. **Confirmá el ambiente.** Homologación (testing) y producción son mundos separados con
   certificados, endpoints y datos distintos. Mezclarlos es el error #1. Ver tabla de
   endpoints abajo.
3. **Para autenticar, usá el script provisto** `scripts/wsaa.mjs` en vez de reimplementar el
   firmado CMS a mano. Reimplementar PKCS#7 en JS puro es un pozo; el script delega en
   `openssl` que es la forma confiable.
4. **Para los datos del comprobante** (tipos, condición IVA, alícuotas) leé
   `references/02-wsfev1-emitir.md` — los enums no se adivinan, se consultan con los métodos
   `FEParamGet*`.

## Endpoints (memorizar la diferencia homo/prod)

| Servicio | Homologación (testing) | Producción |
|---|---|---|
| WSAA `LoginCMS` | `https://wsaahomo.afip.gov.ar/ws/services/LoginCms` | `https://wsaa.afip.gov.ar/ws/services/LoginCms` |
| WSFEv1 (WSDL) | `https://wswhomo.afip.gov.ar/wsfev1/service.asmx?WSDL` | `https://servicios1.afip.gov.ar/wsfev1/service.asmx?WSDL` |
| Certificados | WSASS (Autoservicio Certificados Homologación), con clave fiscal | "Administrador de Certificados Digitales", con clave fiscal |

El `service` que se pide al WSAA para facturar es siempre `wsfe` (no `wsfev1`).

## Stack recomendado para Synera (Next.js / Supabase)

- La emisión de CAE va **server-side** (Route Handler / Server Action / n8n), nunca desde el
  cliente: la clave privada no puede salir del servidor.
- Cacheá el TA (token+sign+expirationTime) en una tabla de Supabase o en Vault, keyed por
  `cuit + ambiente`. Reusalo mientras `expirationTime` siga vigente. Pedir un TA nuevo con
  uno válido activo devuelve el error `coe.alreadyAuthenticated`.
- Guardá la clave privada y el certificado en variables de entorno / Supabase Vault, no en
  el repo.
- Numeración: **siempre** consultá `FECompUltimoAutorizado` y sumá 1 antes de emitir. No
  lleves el contador por tu cuenta; AFIP es la fuente de verdad y un salto de numeración es
  un problema fiscal.

## Archivos de referencia

- `references/01-certificado-y-wsaa.md` — Generar la clave privada y el CSR con OpenSSL,
  obtener el certificado (homo vía WSASS / prod vía Administrador de Certificados),
  asociarlo al WS de negocio, y el flujo WSAA completo (TRA → CMS → LoginCMS → TA).
- `references/02-wsfev1-emitir.md` — Emitir una factura: `FEDummy`, `FECompUltimoAutorizado`,
  `FECAESolicitar`, estructura del comprobante, tipos de comprobante, `CondicionIVAReceptorId`
  (obligatorio), alícuotas de IVA, y los métodos `FEParamGet*` para descubrir enums.
- `references/03-errores-y-gotchas.md` — Catálogo de errores reales y sus causas, homo vs
  prod, caché del TA, diagnóstico de errores de CMS, relojes desincronizados, versión del
  manual del desarrollador, y validaciones de negocio.

## Scripts

- `scripts/wsaa.mjs` — Cliente WSAA en Node (ESM). Genera el TRA, lo firma como CMS usando
  `openssl`, llama a `LoginCMS`, parsea el TA y lo cachea en disco. Reutilizable como módulo
  o por CLI. Leer el encabezado del archivo para la firma de uso.

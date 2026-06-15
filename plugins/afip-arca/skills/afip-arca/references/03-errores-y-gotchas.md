# 03 — Errores y gotchas (leer ESTO primero ante cualquier falla)

El 90% de los problemas de facturación electrónica son errores documentados por desviarse
del flujo, no bugs de tu código. Buscá el síntoma acá antes de debuggear a ciegas.

## Errores del WSAA (autenticación)

| Mensaje / código | Causa real | Fix |
|---|---|---|
| `coe.notAuthorized` — "Computador no autorizado a acceder al servicio" | El certificado no está **asociado** al WS de negocio `wsfe`. | Crear la autorización/relación cert ↔ servicio (ver ref 01, A.3). |
| `cms.cert.untrusted` — "Certificado no emitido por AC de confianza" | Estás usando el certificado de **homologación contra producción** (o viceversa). | Usá el cert del ambiente correcto contra el endpoint correcto. |
| `cms.bad` / "El CMS no es válido" | Firma CMS mal armada: cert vencido/inválido, ambiente equivocado, o parámetros mal pasados (servicio/TTL). NO es por la versión de OpenSSL. | Regenerá con `openssl cms -sign ... -nodetach`; verificá cert, ambiente y que el `service` sea `wsfe`. |
| `coe.alreadyAuthenticated` — "El CEE ya posee un TA válido" | Pediste un TA nuevo teniendo uno vigente (dura 12 h). | Cacheá y reusá el TA hasta su `expirationTime`. |
| "El XML expiró hace N minutos" / "generationTime futuro" | Reloj del server desincronizado, o ventana del TRA mal armada. | NTP en el server; `generationTime` ≈ ahora−5min, `expirationTime` ≈ ahora+10min. |
| `xml.sax` / "invalid XML character (Unicode 0x5)" | El base64 del CMS quedó con bytes/saltos raros, o mandaste DER sin base64. | Asegurate de base64 del DER, sin caracteres de control. |

## Errores del WSFEv1 (negocio)

| Síntoma | Causa | Fix |
|---|---|---|
| Observación por `CondicionIVAReceptorId` faltante/inválido | A jun-2026 es **observado, no rechazado** (dato no excluyente; rechazo previsto ago–sept 2026). RG 5616. | Mandá igual el Id correcto (ref 02) coherente con el `CbteTipo`; revisá la fecha de corte vigente. |
| "Los importes no coinciden" | `ImpTotal` no es la suma de los componentes, o `AlicIva` no suma `ImpIVA`. | Revisá la aritmética (ref 02, reglas). Redondeá a 2 decimales consistentemente. |
| "El número de comprobante no es correlativo" | No consultaste `FECompUltimoAutorizado` o hubo carrera. | Consultá último + 1 justo antes de emitir; serializá la emisión por PtoVta. |
| Error 1014 + texto | "Cajón de sastre" de ARCA para errores no contemplados; el texto explica la causa. | Leer el texto adjunto literal. |
| `Resultado: "A"` con Observaciones | Aprobado **con** advertencias. | Es válido, pero leé las observaciones (pueden indicar datos a corregir a futuro). |
| Cotización fuera de rango (moneda extranjera) | Cotización < 2% o > 400% de la orientativa (regla vigente desde manual v3.3). | Tomá la cotización de `FEParamGetCotizacion`. |
| `FEDummy` devuelve algún server en "NO" | Caída/mantenimiento del lado de ARCA, no tu código. | Reintentar con backoff; no spamear. |

## Gotchas de entorno

- **Homo y prod son universos paralelos.** Cert, endpoint, puntos de venta y numeración son
  independientes. El número de comprobante en homo NO se traslada a prod.
- **Versión del manual del desarrollador.** La oficial publicada es la **v4.0** (mar-2025,
  trajo `CondicionIVAReceptorId` y `CanMisMonExt`). ARCA anunció **v4.4/v4.5** con cambios de
  CAEA-contingencia (RG 5782): `CbteFchHsGen` obligatorio y códigos de validación 15016/15017.
  Si emitís con CAEA, revisá esos cambios contra el PDF oficial vigente.
- **El reloj importa.** WSAA valida ventanas temporales; sin NTP vas a tener rechazos
  intermitentes difíciles de diagnosticar.
- **La clave privada es sagrada.** Nunca en el repo, nunca en el cliente. Server-side +
  Vault/env. Si se filtra, hay que revocar el certificado y emitir uno nuevo.
- **Puntos de venta:** el PtoVta que uses por WS tiene que estar habilitado para
  "Web Services" en ARCA (no es el mismo que un PtoVta de talonario manual o de otro
  sistema). Verificá con `FEParamGetPtosVenta`.
- **Certificado homo y CUIT:** en homologación el CUIT no se valida y podés emitir cert a tu
  nombre; en producción tiene que ser el CUIT real del emisor y el cert debe estar a su
  nombre / con relación válida.

## Diagnóstico rápido (orden de chequeo)

1. ¿`FEDummy` responde todo "OK"? Si no, es ARCA, esperá.
2. ¿El TA se obtiene sin `coe.notAuthorized` / `cms.*`? Si falla → problema de capa
   identidad/auth (ref 01).
3. ¿`FECompUltimoAutorizado` responde? Si sí, auth OK; el problema está en los datos del
   comprobante.
4. ¿`FECAESolicitar` devuelve "R"? Leé `Errores` y `Observaciones` textuales: casi siempre
   dicen exactamente qué campo está mal.

## Canales oficiales de soporte (ARCA)

- Aspectos funcionales del WS: `wsfev1@arca.gov.ar`
- Ambiente de producción: `sri@arca.gov.ar`
- Normativa: `facturaelectronica@arca.gov.ar`
- Certificados y accesos: sitio `arca.gob.ar/ws/`

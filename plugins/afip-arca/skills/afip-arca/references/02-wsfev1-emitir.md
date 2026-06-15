# 02 — WSFEv1: emitir un comprobante y obtener el CAE

Tercera capa. Con el TA (`token`+`sign`) y el `Cuit`, se consulta el último comprobante,
se arma el nuevo y se pide el CAE con `FECAESolicitar`.

## Tabla de contenidos
- Header de autenticación
- Métodos del servicio
- Flujo canónico de emisión
- Estructura de FECAESolicitar
- Tipos de comprobante (CbteTipo)
- CondicionIVAReceptorId (estado normativo)
- Alícuotas de IVA
- Facturar en moneda extranjera
- Régimen de Transparencia Fiscal (clase B)
- Descubrir enums con FEParamGet*

## Header de autenticación (`FEAuthRequest`)

Va en todas las llamadas de negocio:

```
Auth = {
  Token: <token del TA>,
  Sign:  <sign del TA>,
  Cuit:  <CUIT del emisor, el mismo del certificado>
}
```

## Métodos del servicio

| Método | Para qué |
|---|---|
| `FEDummy` | Health check. No requiere auth. Devuelve estado de AppServer/DbServer/AuthServer. Usalo para verificar conectividad antes de culpar a tu código. |
| `FECompUltimoAutorizado` | Último número autorizado para un `PtoVta` + `CbteTipo`. Sumar 1 = número a emitir. |
| `FECAESolicitar` | **El método principal**: autoriza el comprobante y devuelve el CAE. |
| `FECompConsultar` | Consultar un comprobante ya emitido. |
| `FECAEASolicitar` / `FECAEAConsultar` | CAEA: autorización anticipada quincenal (solo A y B). Caso avanzado. |
| `FEParamGetTiposCbte` | Lista de tipos de comprobante válidos. |
| `FEParamGetTiposIva` | Lista de alícuotas de IVA (Id → %). |
| `FEParamGetCondicionIvaReceptor` | Lista de condiciones IVA del receptor (para `CondicionIVAReceptorId`). |
| `FEParamGetPtosVenta` | Puntos de venta habilitados para el CUIT. |
| `FEParamGetCotizacion` | Cotización oficial de una moneda (para facturar en USD). |

## Flujo canónico de emisión

```
1. FEDummy                         → ¿el servicio está arriba?
2. FECompUltimoAutorizado(PtoVta, CbteTipo) → último Nro autorizado
3. nro = último + 1
4. Armar FeCAEReq (cabecera + detalle) con nro
5. FECAESolicitar(Auth, FeCAEReq)
6. Leer Resultado:
     - "A" (Aprobado) → guardar CAE + CAEFchVto. Listo.
     - "R" (Rechazado) → leer Observaciones/Errores, corregir, reintentar.
7. Guardar CAE, vencimiento, número y PtoVta. El PDF/representación impresa se arma aparte
   con esos datos + código de barras / QR.
```

> **Idempotencia / reproceso:** si `FECAESolicitar` falla por timeout pero AFIP igual
> autorizó, reintentar con el mismo número da error de "comprobante ya existente". Ante
> duda, consultá con `FECompConsultar(PtoVta, CbteTipo, nro)` antes de reintentar, o usá
> `FECompUltimoAutorizado` para ver si el número ya avanzó.

## Estructura de FECAESolicitar (campos clave)

`FeCAEReq` tiene una **cabecera** (`FeCabReq`) y un **detalle** (`FeDetReq` → `FECAEDetRequest`).

```jsonc
{
  "FeCAEReq": {
    "FeCabReq": {
      "CantReg":  1,          // cantidad de comprobantes en este request
      "PtoVta":   1,          // punto de venta
      "CbteTipo": 11          // tipo (ver tabla)
    },
    "FeDetReq": {
      "FECAEDetRequest": {
        "Concepto":    1,            // 1=Productos, 2=Servicios, 3=Productos y Servicios
        "DocTipo":     80,           // 80=CUIT, 86=CUIL, 96=DNI, 99=Consumidor Final
        "DocNro":      20111111112,  // documento del receptor (0 si Consumidor Final sin id)
        "CbteDesde":   1,
        "CbteHasta":   1,            // = nro consultado + 1 (mismo número para 1 comprobante)
        "CbteFch":     "20260615",   // yyyymmdd
        "ImpTotal":    121.00,
        "ImpTotConc":  0,            // neto no gravado
        "ImpNeto":     100.00,       // neto gravado
        "ImpOpEx":     0,            // exento
        "ImpIVA":      21.00,
        "ImpTrib":     0,            // otros tributos
        "MonId":       "PES",        // PES = pesos; "DOL" para dólares
        "MonCotiz":    1,            // 1 si PES; cotización si moneda extranjera
        "CanMisMonExt": "N",         // S/N: ¿se cancela en la misma moneda extranjera? (desde manual v4.0)
        "CondicionIVAReceptorId": 5, // condición IVA del receptor (ver estado normativo abajo)
        "Iva": {
          "AlicIva": {
            "Id":      5,            // 5 = 21% (ver FEParamGetTiposIva)
            "BaseImp": 100.00,
            "Importe": 21.00
          }
        }
      }
    }
  }
}
```

Reglas aritméticas que el WS valida (si no cierran, rechaza):
- `ImpTotal = ImpTotConc + ImpNeto + ImpOpEx + ImpIVA + ImpTrib`
- La suma de `AlicIva[].Importe` debe igualar `ImpIVA`, y la de `BaseImp` igualar `ImpNeto`.
- En comprobantes **C** (monotributo) no se discrimina IVA: `ImpIVA = 0`, `ImpNeto` lleva el
  total gravado y normalmente no se manda el nodo `Iva` (o va con alícuota 0 según versión).
- Para `Concepto` 2 o 3 (servicios) hay que mandar además `FchServDesde`, `FchServHasta` y
  `FchVtoPago`.

## Tipos de comprobante (CbteTipo) — los más usados

| Id | Comprobante | Emisor típico |
|---|---|---|
| 1 | Factura A | Responsable Inscripto a RI |
| 6 | Factura B | RI a Consumidor Final/Exento/Monotributo |
| 11 | Factura C | Monotributo / Exento |
| 2 / 7 / 12 | Nota de Débito A / B / C | |
| 3 / 8 / 13 | Nota de Crédito A / B / C | |

Confirmá siempre contra `FEParamGetTiposCbte` (la tabla completa es más larga e incluye
MiPyME FCE, recibos, etc.).

## CondicionIVAReceptorId — estado normativo (RG 5616/2024)

Campo agregado por la RG 5616/2024 (introducido en el manual del desarrollador **v4.0**),
que identifica la condición del **receptor** frente al IVA.

> **Estado a junio 2026 (IMPORTANTE, esto cambia seguido):** el campo **NO es obligatorio
> bajo rechazo todavía**. Tras varias prórrogas se mantiene como **dato no excluyente**: si
> lo omitís, ARCA lo **observa** pero **autoriza el comprobante igual**. El rechazo está
> previsto para algún momento entre **agosto y septiembre de 2026** según la última RG
> vigente — las fuentes no coinciden (la RG 5852/2026 prorrogó plazos al 1-ago-2026; AFIP SDK
> cita 1-sept-2026 vía manual v4.5) y ARCA reprorrogó repetidamente.
>
> **Conclusión operativa:** mandalo siempre (es trivial y te deja a prueba de la fecha de
> corte), pero no asumas que su ausencia rompe la emisión hoy. **Antes de cada release,
> verificá la fecha de corte contra la última RG publicada en el Boletín Oficial.**

La tabla completa se obtiene con `FEParamGetCondicionIvaReceptor`. Valores:

| Id | Condición |
|---|---|
| 1 | IVA Responsable Inscripto |
| 4 | IVA Sujeto Exento |
| 5 | Consumidor Final |
| 6 | Responsable Monotributo |
| 7 | Sujeto No Categorizado |
| 8 | Proveedor del Exterior |
| 9 | Cliente del Exterior |
| 10 | IVA Liberado – Ley 19.640 |
| 13 | Monotributista Social |
| 15 | IVA No Alcanzado |
| 16 | Monotributo Trabajador Independiente Promovido |

La condición elegida tiene que ser coherente con el `CbteTipo` (ej. no podés mandar Factura
A a un Consumidor Final).

## Alícuotas de IVA (AlicIva.Id)

| Id | Alícuota |
|---|---|
| 3 | 0% |
| 4 | 10.5% |
| 5 | 21% |
| 6 | 27% |
| 8 | 5% |
| 9 | 2.5% |

Confirmar con `FEParamGetTiposIva`.

## Facturar en moneda extranjera (USD)

- `MonId = "DOL"`, `MonCotiz = ` cotización del día (obtenida con `FEParamGetCotizacion('DOL')`).
- `CanMisMonExt`: `"S"` si la operación se cancela en la misma moneda extranjera, `"N"` si se
  cancela en pesos. Campo del manual v4.0; interactúa con la validación de `MonCotiz`.
- Validación de cotización (vigente desde el manual v3.3, ene-2024, y mantenida en v4.0): la
  cotización informada **no puede ser inferior al 2% ni superior en un 400%** respecto de la
  orientativa de ARCA. Si te pasás, error. (Histórico: v3.1 era 20%–200%.)

## Régimen de Transparencia Fiscal al Consumidor (Ley 27.743 / RG 5614/2024)

En comprobantes **clase B** (a consumidor final) hay que **discriminar** el "IVA Contenido"
y los "Otros Impuestos Nacionales Indirectos" que integran el precio. Vigencia: obligatorio
para grandes empresas desde el 1-ene-2025 y para el resto de los contribuyentes desde el
**1-abr-2025**. Si emitís facturas B a consumidor final, contemplá esta discriminación en la
representación impresa/PDF (no cambia el CAE, pero es exigencia del régimen).

## Descubrir enums en vez de hardcodear

Los `FEParamGet*` existen porque las tablas cambian. Antes de hardcodear un Id, en
desarrollo conviene llamar al `FEParamGet*` correspondiente y loguear la tabla. En
producción cacheálos (cambian poco) y revalidá periódicamente.

## Errores y validaciones

El detalle de errores frecuentes está en `references/03-errores-y-gotchas.md`. Recordá que
`FECAESolicitar` puede devolver `Resultado: "A"` con **Observaciones** (aprobado con
advertencias) — leelas igual, no solo el rechazo.

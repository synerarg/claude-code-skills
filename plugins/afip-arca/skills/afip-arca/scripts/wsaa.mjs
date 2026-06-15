#!/usr/bin/env node
/**
 * wsaa.mjs — Cliente WSAA (AFIP/ARCA) en Node ESM.
 *
 * Hace el flujo de autenticación completo y cachea el Ticket de Acceso (TA):
 *   TRA (XML) -> firma CMS/PKCS#7 con openssl -> base64 -> LoginCMS -> {token, sign}
 *
 * El firmado se delega en `openssl` (binario del sistema) porque implementar PKCS#7 en JS
 * puro es frágil. Requiere openssl en PATH (idealmente 1.1.1).
 *
 * USO COMO MÓDULO:
 *   import { getTA } from './wsaa.mjs';
 *   const ta = await getTA({
 *     cert: process.env.AFIP_CERT,        // PEM del certificado (string) o path
 *     key:  process.env.AFIP_KEY,         // PEM de la clave privada (string) o path
 *     service: 'wsfe',
 *     homo: true,                          // true = homologación, false = producción
 *     cacheDir: './.afip-cache',
 *   });
 *   // ta = { token, sign, expirationTime, cuit? }
 *
 * USO POR CLI:
 *   AFIP_CERT=./synera.crt AFIP_KEY=./synera.key node wsaa.mjs --homo --service wsfe
 *
 * NOTA: este módulo NO emite comprobantes; solo entrega el TA. Con ese TA llamás a WSFEv1
 * (ver references/02-wsfev1-emitir.md). En producción cacheá el TA en Supabase/Vault en vez
 * de disco, keyed por cuit+ambiente.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const execFileP = promisify(execFile);

const ENDPOINTS = {
  homo: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
  prod: 'https://wsaa.afip.gov.ar/ws/services/LoginCms',
};

/** Lee un PEM que puede venir como contenido inline o como path a un archivo. */
async function resolvePem(value) {
  if (!value) throw new Error('Falta cert o key');
  if (value.includes('-----BEGIN')) return value;            // contenido inline
  if (existsSync(value)) return readFile(value, 'utf8');      // path
  throw new Error(`No se pudo resolver PEM: ${value.slice(0, 40)}...`);
}

/** Genera el LoginTicketRequest (TRA) con ventana temporal de +/- minutos. */
function buildTRA(service) {
  const now = Date.now();
  const fmt = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, '-00:00');
  return `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${Math.floor(now / 1000)}</uniqueId>
    <generationTime>${fmt(now - 5 * 60 * 1000)}</generationTime>
    <expirationTime>${fmt(now + 10 * 60 * 1000)}</expirationTime>
  </header>
  <service>${service}</service>
</loginTicketRequest>`;
}

/** Firma el TRA como CMS DER y devuelve el base64 (parámetro in0 de LoginCMS). */
async function signTRA(traXml, certPem, keyPem) {
  const dir = await mkdtemp(path.join(tmpdir(), 'wsaa-'));
  try {
    const traPath = path.join(dir, 'tra.xml');
    const certPath = path.join(dir, 'cert.pem');
    const keyPath = path.join(dir, 'key.pem');
    const cmsPath = path.join(dir, 'tra.cms');
    await Promise.all([
      writeFile(traPath, traXml),
      writeFile(certPath, certPem),
      writeFile(keyPath, keyPem),
    ]);
    // openssl cms -sign -nodetach -outform DER
    await execFileP('openssl', [
      'cms', '-sign',
      '-in', traPath,
      '-signer', certPath,
      '-inkey', keyPath,
      '-nodetach',
      '-outform', 'DER',
      '-out', cmsPath,
    ]);
    const der = await readFile(cmsPath);
    return der.toString('base64');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** POST SOAP a LoginCMS. */
async function callLoginCMS(cmsB64, endpoint) {
  const envelope = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
  <soapenv:Header/>
  <soapenv:Body>
    <wsaa:loginCms>
      <wsaa:in0>${cmsB64}</wsaa:in0>
    </wsaa:loginCms>
  </soapenv:Body>
</soapenv:Envelope>`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
    body: envelope,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`LoginCMS HTTP ${res.status}: ${text.slice(0, 500)}`);
  return text;
}

/** Extrae token/sign/expirationTime del LoginTicketResponse (viene XML-escapeado). */
function parseTA(soapResponse) {
  const unescaped = soapResponse
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  const grab = (tag) => unescaped.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1]?.trim();
  const token = grab('token');
  const sign = grab('sign');
  const expirationTime = grab('expirationTime');
  if (!token || !sign) {
    const fault = unescaped.match(/<faultstring>([\s\S]*?)<\/faultstring>/)?.[1];
    throw new Error(`WSAA sin token/sign. ${fault ? 'Fault: ' + fault : unescaped.slice(0, 500)}`);
  }
  return { token, sign, expirationTime };
}

/** Caché en disco del TA por servicio+ambiente. */
async function readCache(cacheDir, key) {
  try {
    const raw = await readFile(path.join(cacheDir, `${key}.json`), 'utf8');
    const ta = JSON.parse(raw);
    if (ta.expirationTime && new Date(ta.expirationTime).getTime() - Date.now() > 5 * 60 * 1000) {
      return ta; // vigente con >5 min de margen
    }
  } catch { /* no cache */ }
  return null;
}

async function writeCache(cacheDir, key, ta) {
  await mkdir(cacheDir, { recursive: true });
  await writeFile(path.join(cacheDir, `${key}.json`), JSON.stringify(ta, null, 2));
}

/**
 * getTA — devuelve un Ticket de Acceso válido, usando caché si lo hay.
 * @returns {Promise<{token:string, sign:string, expirationTime:string}>}
 */
export async function getTA({ cert, key, service = 'wsfe', homo = true, cacheDir = './.afip-cache' } = {}) {
  const endpoint = homo ? ENDPOINTS.homo : ENDPOINTS.prod;
  const cacheKey = `${service}-${homo ? 'homo' : 'prod'}`;

  const cached = await readCache(cacheDir, cacheKey);
  if (cached) return cached;

  const [certPem, keyPem] = await Promise.all([resolvePem(cert), resolvePem(key)]);
  const tra = buildTRA(service);
  const cmsB64 = await signTRA(tra, certPem, keyPem);
  const response = await callLoginCMS(cmsB64, endpoint);
  const ta = parseTA(response);

  await writeCache(cacheDir, cacheKey, ta);
  return ta;
}

// --- CLI ---
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const homo = !args.includes('--prod');
  const service = (() => {
    const i = args.indexOf('--service');
    return i >= 0 ? args[i + 1] : 'wsfe';
  })();
  getTA({ cert: process.env.AFIP_CERT, key: process.env.AFIP_KEY, service, homo })
    .then((ta) => {
      console.log(JSON.stringify(ta, null, 2));
    })
    .catch((err) => {
      console.error('Error WSAA:', err.message);
      process.exit(1);
    });
}

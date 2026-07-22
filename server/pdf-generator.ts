import type { Browser } from 'puppeteer';
import * as fs from 'fs';

let browserPromise: Promise<Browser> | null = null;

function getExecutablePath(): string | undefined {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  const candidates = [
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/snap/bin/chromium',
    '/usr/local/bin/chromium',
    '/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium',
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return undefined;
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    let puppeteer: typeof import('puppeteer');
    try {
      puppeteer = require('puppeteer');
    } catch {
      throw new Error('Puppeteer não está instalado. Geração de PDF indisponível neste servidor.');
    }

    const execPath = getExecutablePath();
    console.log('[pdf] Chromium path:', execPath ?? '(auto-detect)');

    browserPromise = puppeteer.default.launch({
      executablePath: execPath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
      ],
    }).catch((err) => {
      browserPromise = null;
      throw err;
    });

    const browser = await browserPromise;
    browser.on('disconnected', () => {
      browserPromise = null;
    });
    return browser;
  }
  return browserPromise;
}

export interface PdfOptions {
  format?: 'A3' | 'A4' | 'Letter' | 'Legal';
  landscape?: boolean;
  printBackground?: boolean;
  marginTop?: string;
  marginRight?: string;
  marginBottom?: string;
  marginLeft?: string;
}

export async function htmlToPdf(html: string, options: PdfOptions = {}): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: ['load', 'domcontentloaded', 'networkidle0'], timeout: 30000 });
    const buffer = await page.pdf({
      format: options.format || 'A4',
      landscape: options.landscape || false,
      printBackground: options.printBackground !== false,
      preferCSSPageSize: true,
      margin: {
        top: options.marginTop || '0',
        right: options.marginRight || '0',
        bottom: options.marginBottom || '0',
        left: options.marginLeft || '0',
      },
    });
    return Buffer.from(buffer);
  } finally {
    await page.close().catch(() => {});
  }
}

export async function shutdownPdfGenerator(): Promise<void> {
  if (browserPromise) {
    try {
      const browser = await browserPromise;
      await browser.close();
    } catch {}
    browserPromise = null;
  }
}

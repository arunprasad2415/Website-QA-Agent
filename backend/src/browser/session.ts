import { chromium, type Browser, type Page } from 'playwright';
import { config } from '../config.js';
import { assertAllowedUrl } from './url-guard.js';

export interface PageElement {
  id: number;
  tag: string;
  label: string;
  type?: string;
  href?: string;
}

export interface Observation {
  url: string;
  title: string;
  screenshot: Buffer;
  elements: PageElement[];
}

export interface ConsoleIssue {
  kind: 'console' | 'pageerror';
  message: string;
  pageUrl: string;
}

export interface NetworkIssue {
  url: string;
  method: string;
  resourceType: string;
  status?: number;
  failure?: string;
  pageUrl: string;
}

const ID_ATTR = 'data-qa-id';

export class BrowserSession {
  readonly consoleIssues: ConsoleIssue[] = [];
  readonly networkIssues: NetworkIssue[] = [];

  private constructor(
    private readonly browser: Browser,
    readonly page: Page,
  ) {
    page.on('console', (msg) => {
      if (msg.type() === 'error') this.consoleIssues.push({ kind: 'console', message: msg.text(), pageUrl: page.url() });
    });
    page.on('pageerror', (err) => {
      this.consoleIssues.push({ kind: 'pageerror', message: err.message, pageUrl: page.url() });
    });
    page.on('response', (res) => {
      if (res.status() >= 400) {
        const req = res.request();
        this.networkIssues.push({ url: res.url(), method: req.method(), resourceType: req.resourceType(), status: res.status(), pageUrl: page.url() });
      }
    });
    page.on('requestfailed', (req) => {
      const failure = req.failure()?.errorText;
      if (failure?.includes('ERR_ABORTED') || failure?.includes('ERR_BLOCKED_BY_CLIENT')) return;
      this.networkIssues.push({ url: req.url(), method: req.method(), resourceType: req.resourceType(), failure, pageUrl: page.url() });
    });
  }

  static async open(url: string): Promise<BrowserSession> {
    const browser = await chromium.launch({ headless: config.headless });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
      await page.addInitScript('globalThis.__name = (fn) => fn');
      await page.route('**/*', async (route) => {
        const url = route.request().url();
        const isHttp = url.startsWith('http:') || url.startsWith('https:');
        const allowed = !isHttp || (await assertAllowedUrl(url).then(() => true, () => false));
        await (allowed ? route.continue() : route.abort('blockedbyclient')).catch(() => {});
      });
      const session = new BrowserSession(browser, page);
      await session.goto(url);
      return session;
    } catch (err) {
      await browser.close();
      throw err;
    }
  }

  async observe(): Promise<Observation> {
    const elements = await this.page.evaluate((attr) => {
      document.querySelectorAll(`[${attr}]`).forEach((el) => el.removeAttribute(attr));
      const selector = [
        'a[href]', 'button', 'input:not([type="hidden"])', 'select', 'textarea', 'summary',
        '[role="button"]', '[role="link"]', '[role="checkbox"]', '[role="tab"]', '[role="menuitem"]',
        '[onclick]', '[contenteditable="true"]',
      ].join(',');
      const out: { id: number; tag: string; label: string; type?: string; href?: string }[] = [];
      for (const el of document.querySelectorAll<HTMLElement>(selector)) {
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        const visible = r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0
          && r.top < innerHeight && r.left < innerWidth
          && style.visibility !== 'hidden' && style.display !== 'none';
        if (!visible) continue;

        const type = el.getAttribute('type') ?? undefined;
        const buttonValue = ['submit', 'button', 'reset'].includes(type ?? '') ? (el as HTMLInputElement).value : '';
        const label = (
          el.getAttribute('aria-label') || el.innerText || el.getAttribute('placeholder') || buttonValue
          || el.title || el.querySelector('img')?.alt || el.getAttribute('name') || ''
        ).trim().replace(/\s+/g, ' ').slice(0, 80);

        const id = out.length;
        el.setAttribute(attr, String(id));
        out.push({ id, tag: el.tagName.toLowerCase(), label, type, href: el.getAttribute('href') ?? undefined });
      }
      return out;
    }, ID_ATTR);

    return {
      url: this.page.url(),
      title: await this.page.title(),
      screenshot: await this.page.screenshot(),
      elements,
    };
  }

  async click(id: number): Promise<void> {
    await (await this.element(id)).click({ timeout: 5000 });
    await this.settle();
  }

  async type(id: number, text: string, submit = false): Promise<void> {
    const el = await this.element(id);
    await el.fill(text, { timeout: 5000 });
    if (submit) await el.press('Enter');
    await this.settle();
  }

  async goto(url: string): Promise<void> {
    await this.page.goto((await assertAllowedUrl(url)).href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await this.settle();
  }

  async scroll(direction: 'up' | 'down'): Promise<void> {
    await this.page.evaluate((dy) => window.scrollBy(0, dy), direction === 'down' ? 600 : -600);
    await this.settle();
  }

  async close(): Promise<void> {
    await this.browser.close();
  }

  private async element(id: number) {
    const el = this.page.locator(`[${ID_ATTR}="${id}"]`);
    if ((await el.count()) === 0) throw new Error(`No element with id ${id} on the current page; observe again`);
    return el.first();
  }

  private async settle(): Promise<void> {
    await this.page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
  }
}

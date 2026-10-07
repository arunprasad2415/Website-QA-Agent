import { request, type APIRequestContext } from 'playwright';
import type { BrowserSession } from '../browser/session.js';
import type { Severity } from './tools.js';

export type BugSource = 'agent' | 'console' | 'network' | 'accessibility' | 'broken_link';

export interface Bug {
  source: BugSource;
  title: string;
  severity: Severity;
  details: string;
  pageUrl: string;
  step: number;
  screenshot: string;
}

type Finding = Omit<Bug, 'step' | 'screenshot'>;

const MAX_LINKS_PER_PAGE = 20;

export class AutoChecks {
  private readonly reported = new Set<string>();
  private readonly scannedPages = new Set<string>();
  private readonly checkedLinks = new Set<string>();
  private consoleSeen = 0;
  private networkSeen = 0;
  private api?: APIRequestContext;

  async run(session: BrowserSession, step: number, screenshot: string): Promise<Bug[]> {
    const findings: [key: string, finding: Finding][] = [];

    for (const issue of session.consoleIssues.slice(this.consoleSeen)) {
      if (issue.message.startsWith('Failed to load resource')) continue;
      const uncaught = issue.kind === 'pageerror';
      findings.push([`console:${issue.message}`, {
        source: 'console',
        severity: uncaught ? 'high' : 'medium',
        title: uncaught ? 'Uncaught JavaScript error' : 'Console error',
        details: issue.message,
        pageUrl: issue.pageUrl,
      }]);
    }
    this.consoleSeen = session.consoleIssues.length;

    for (const issue of session.networkIssues.slice(this.networkSeen)) {
      const what = issue.status ? `HTTP ${issue.status}` : `request failed (${issue.failure ?? 'unknown error'})`;
      findings.push([`network:${issue.method}:${issue.url}:${what}`, {
        source: 'network',
        severity: issue.resourceType === 'document' || (issue.status ?? 0) >= 500 ? 'high' : 'medium',
        title: `${what} loading ${issue.resourceType}`,
        details: `${issue.method} ${issue.url}`,
        pageUrl: issue.pageUrl,
      }]);
    }
    this.networkSeen = session.networkIssues.length;

    const pageUrl = session.page.url().split('#')[0];
    if (!this.scannedPages.has(pageUrl)) {
      this.scannedPages.add(pageUrl);
      for (const issue of await accessibilityIssues(session)) {
        findings.push([`a11y:${pageUrl}:${issue.kind}`, { source: 'accessibility', ...issue, pageUrl }]);
      }
      for (const link of await this.brokenLinks(session)) {
        findings.push([`link:${link.url}`, {
          source: 'broken_link',
          severity: 'medium',
          title: `Broken link (${link.status})`,
          details: link.url,
          pageUrl,
        }]);
      }
    }

    const bugs: Bug[] = [];
    for (const [key, finding] of findings) {
      if (this.reported.has(key)) continue;
      this.reported.add(key);
      bugs.push({ ...finding, step, screenshot });
    }
    return bugs;
  }

  async close(): Promise<void> {
    await this.api?.dispose();
  }

  private async brokenLinks(session: BrowserSession): Promise<{ url: string; status: string }[]> {
    const origin = new URL(session.page.url()).origin;
    const hrefs = await session.page.evaluate(() =>
      [...document.querySelectorAll<HTMLAnchorElement>('a[href]')].map((a) => a.href),
    );
    const links = [...new Set(hrefs.map((h) => h.split('#')[0]))]
      .filter((h) => URL.canParse(h) && new URL(h).origin === origin && !this.checkedLinks.has(h))
      .slice(0, MAX_LINKS_PER_PAGE);
    links.forEach((l) => this.checkedLinks.add(l));

    const api = (this.api ??= await request.newContext());
    const results = await Promise.all(
      links.map(async (url) => {
        try {
          const opts = { timeout: 10_000, maxRedirects: 0 };
          let res = await api.head(url, opts);
          if (res.status() === 405 || res.status() === 501) res = await api.get(url, opts);
          const status = res.status();
          await res.dispose();
          return status === 404 || status === 410 || status >= 500 ? { url, status: `HTTP ${status}` } : undefined;
        } catch {
          return { url, status: 'unreachable' };
        }
      }),
    );
    return results.filter((r) => r !== undefined);
  }
}

async function accessibilityIssues(session: BrowserSession) {
  return session.page.evaluate(() => {
    const issues: { kind: string; title: string; severity: 'low' | 'medium'; details: string }[] = [];
    const visible = (el: Element) => el.getClientRects().length > 0;
    const snippet = (els: Element[]) => els.slice(0, 5).map((el) => el.outerHTML.slice(0, 150)).join('\n');
    const hasName = (el: Element) =>
      Boolean(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title'));

    const noAlt = [...document.querySelectorAll('img:not([alt])')].filter(visible);
    if (noAlt.length) {
      issues.push({ kind: 'img-alt', severity: 'low', title: `${noAlt.length} image(s) missing alt text`, details: snippet(noAlt) });
    }

    const fields = document.querySelectorAll<HTMLInputElement>(
      'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]), select, textarea',
    );
    const unlabeled = [...fields].filter((el) => visible(el) && !el.labels?.length && !hasName(el));
    if (unlabeled.length) {
      issues.push({ kind: 'input-label', severity: 'medium', title: `${unlabeled.length} form field(s) without a label`, details: snippet(unlabeled) });
    }

    const controls = document.querySelectorAll<HTMLElement>('button, a[href], [role=button]');
    const nameless = [...controls].filter(
      (el) => visible(el) && !el.innerText.trim() && !hasName(el) && !el.querySelector('img[alt]:not([alt=""]), svg[aria-label]'),
    );
    if (nameless.length) {
      issues.push({ kind: 'control-name', severity: 'medium', title: `${nameless.length} button(s)/link(s) with no accessible name`, details: snippet(nameless) });
    }

    if (!document.documentElement.lang) {
      issues.push({ kind: 'html-lang', severity: 'low', title: 'Page is missing <html lang>', details: 'Screen readers cannot pick the right language.' });
    }
    if (!document.title.trim()) {
      issues.push({ kind: 'title', severity: 'low', title: 'Page has no <title>', details: 'Missing title hurts accessibility and SEO.' });
    }
    return issues;
  });
}

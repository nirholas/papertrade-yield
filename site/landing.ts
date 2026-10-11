/** Landing-page behavior that is independent of the staking app: copy buttons, client tabs and the live MCP tool list. */

interface McpTool {
  name: string;
  title?: string;
  description: string;
  annotations?: { readOnlyHint?: boolean };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.className = 'sr-only';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(ta);
  if (!ok) throw new Error('copy failed');
}

function wireCopyButtons(): void {
  document.addEventListener('click', (event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>('.copy');
    if (!btn) return;
    const code = btn.parentElement?.querySelector('code');
    if (!code) return;
    const flash = (label: string, state: string) => {
      btn.textContent = label;
      btn.dataset.state = state;
      window.setTimeout(() => {
        btn.textContent = 'Copy';
        delete btn.dataset.state;
      }, 1600);
    };
    copyText(code.textContent ?? '').then(
      () => flash('Copied', 'done'),
      () => flash('Press Ctrl+C', 'fail'),
    );
  });
}

function wireTabs(): void {
  const root = document.getElementById('connect-tabs');
  if (!root) return;
  const panels = Array.from(root.querySelectorAll<HTMLElement>('.tabpanel'));
  if (!panels.length) return;
  const list = document.createElement('div');
  list.className = 'tablist';
  list.setAttribute('role', 'tablist');
  list.setAttribute('aria-label', 'AI client');
  const tabs = panels.map((panel, i) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'tab';
    tab.setAttribute('role', 'tab');
    tab.id = `tab-${i}`;
    tab.textContent = panel.dataset.tab ?? `Client ${i + 1}`;
    tab.setAttribute('aria-controls', `panel-${i}`);
    panel.id = `panel-${i}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tab.id);
    list.appendChild(tab);
    return tab;
  });
  const select = (index: number, focus = false) => {
    tabs.forEach((tab, i) => {
      const on = i === index;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      panels[i].hidden = !on;
    });
    if (focus) tabs[index].focus();
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(i));
    tab.addEventListener('keydown', (e) => {
      const last = tabs.length - 1;
      if (e.key === 'ArrowRight') select(i === last ? 0 : i + 1, true);
      else if (e.key === 'ArrowLeft') select(i === 0 ? last : i - 1, true);
      else if (e.key === 'Home') select(0, true);
      else if (e.key === 'End') select(last, true);
      else return;
      e.preventDefault();
    });
  });
  root.insertBefore(list, root.firstChild);
  root.dataset.js = '1';
  select(0);
}

async function loadTools(): Promise<void> {
  const el = document.getElementById('tool-list');
  if (!el) return;
  const fail = (detail: string) => {
    el.innerHTML = `<div class="errorbox"><h3>Could not load the tool list</h3><p>${esc(detail)}</p><button class="btn" type="button" id="tools-retry">Try again</button></div>`;
    document.getElementById('tools-retry')?.addEventListener('click', () => {
      el.innerHTML = '<div class="skeleton skeleton-row" aria-hidden="true"></div><div class="skeleton skeleton-row" aria-hidden="true"></div><div class="skeleton skeleton-row" aria-hidden="true"></div>';
      void loadTools();
    });
  };
  try {
    const res = await fetch('/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    if (!res.ok) throw new Error(`The MCP endpoint answered HTTP ${res.status}.`);
    const body = (await res.json()) as { result?: { tools?: McpTool[] }; error?: { message: string } };
    if (body.error) throw new Error(body.error.message);
    const tools = body.result?.tools ?? [];
    if (!tools.length) {
      el.innerHTML = '<div class="empty"><h3>No tools reported</h3><p>The server answered but listed no tools. Check <a href="/docs/mcp/">the MCP docs</a>.</p></div>';
      return;
    }
    el.innerHTML = `<ul class="tools">${tools
      .map(
        (t) =>
          `<li><code>${esc(t.name)}</code><span>${esc(t.title ?? '')}</span>${t.annotations?.readOnlyHint ? '<em>read-only</em>' : ''}</li>`,
      )
      .join('')}</ul>`;
  } catch (err) {
    fail(err instanceof Error ? err.message : 'Network error.');
  }
}

wireCopyButtons();
wireTabs();
void loadTools();

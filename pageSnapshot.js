// NAME: Page Snapshot
// VERSION: 1.2.0
// DESCRIPTION: Copies a text snapshot of Spotify's page structure to the clipboard, and keeps an on-screen log of errors. For theme and extension authors fixing things after a Spotify update.

(function pageSnapshot() {
	const MAX_LENGTH = 30000;
	const MAX_ERRORS = 20;
	const SHORTCUT_SNAPSHOT = "S"; // Ctrl+Alt+S
	const SHORTCUT_ERRORS = "E"; // Ctrl+Alt+E

	// ------------------------------------------------------------ error log
	// Started straight away, so errors from Spotify, Spicetify and other extensions during start-up are caught too.

	const errors = [];
	const time = () => new Date().toTimeString().slice(0, 8);
	function describeValue(value) {
		if (value instanceof Error) {
			const stack = (value.stack ?? "").split("\n").slice(1, 4).map((l) => l.trim()).join("\n    ");
			return `${value.name}: ${value.message}${stack ? `\n    ${stack}` : ""}`;
		}
		if (typeof value === "string") return value.slice(0, 400);
		try {
			return JSON.stringify(value).slice(0, 200);
		} catch {
			return String(value).slice(0, 200);
		}
	}
	function record(source, values) {
		const text = values.map(describeValue).join(" ").slice(0, 900);
		// React reports the same failure several times in a row; count repeats instead of listing them
		const last = errors[errors.length - 1];
		if (last && last.text.split("\n")[0] === text.split("\n")[0]) {
			last.count++;
			last.time = time();
		} else {
			errors.push({ time: time(), source, text, count: 1 });
			if (errors.length > MAX_ERRORS) errors.shift();
		}
		paintLog();
	}

	const originalError = console.error;
	console.error = (...args) => {
		try {
			record("console", args);
		} catch {
			// never let the log break logging
		}
		return originalError.apply(console, args);
	};
	window.addEventListener("error", (e) => record("uncaught", [e.error ?? e.message]));
	window.addEventListener("unhandledrejection", (e) => record("promise", [e.reason]));

	const formatErrors = () =>
		errors.length
			? errors.map((e) => `[${e.time}] (${e.source}${e.count > 1 ? `, x${e.count}` : ""}) ${e.text}`).join("\n")
			: "(no errors logged)";

	// ------------------------------------------------------- on-screen log

	let panel = null;
	let panelBody = null;

	function button(label, onClick) {
		const el = document.createElement("button");
		el.type = "button";
		el.textContent = label;
		el.style.cssText =
			"padding:3px 10px;border:1px solid rgba(255,255,255,.35);border-radius:9999px;background:transparent;color:#fff;font:600 11px sans-serif;cursor:pointer;";
		el.addEventListener("click", onClick);
		return el;
	}

	function showLog() {
		if (panel) return;
		panel = document.createElement("div");
		panel.setAttribute("role", "log");
		panel.style.cssText =
			"position:fixed;left:12px;bottom:110px;z-index:100000;display:flex;flex-direction:column;width:min(560px,46vw);max-height:42vh;" +
			"border-radius:8px;background:rgba(24,6,8,.94);color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.5);";
		const head = document.createElement("div");
		head.style.cssText = "display:flex;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.12);font:700 12px sans-serif;";
		const title = document.createElement("span");
		title.style.flex = "1";
		title.textContent = "Error log (Ctrl+Alt+E to hide)";
		head.append(
			title,
			button("Copy", () => copy(`${header()}\n\n${formatErrors()}`, "Error log copied to clipboard")),
			button("Clear", () => {
				errors.length = 0;
				paintLog();
			}),
			button("Close", hideLog)
		);
		panelBody = document.createElement("pre");
		panelBody.style.cssText = "flex:1;overflow:auto;margin:0;padding:8px 10px;font:11px/1.45 Consolas,monospace;white-space:pre-wrap;user-select:text;";
		panel.append(head, panelBody);
		document.body.appendChild(panel);
		paintLog();
	}

	function hideLog() {
		panel?.remove();
		panel = null;
		panelBody = null;
	}

	function paintLog() {
		if (!panelBody) return;
		panelBody.textContent = `${header()}\n\n${formatErrors()}`;
		panelBody.scrollTop = panelBody.scrollHeight;
	}

	// ------------------------------------------------------------ snapshot

	function header() {
		const s = window.Spicetify ?? {};
		return `Spotify ${s.Platform?.version ?? "?"} | Spicetify ${s.Config?.version ?? "?"} | theme ${s.Config?.current_theme || "(none)"} | window ${innerWidth}x${innerHeight} | path ${s.Platform?.History?.location?.pathname ?? "?"}`;
	}

	function describe(el) {
		const classes = [...el.classList].slice(0, 6).join(".");
		const testId = el.getAttribute("data-testid");
		const rect = el.getBoundingClientRect();
		return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${classes ? `.${classes}` : ""}${testId ? `[testid=${testId}]` : ""} ${Math.round(rect.width)}x${Math.round(rect.height)}@${Math.round(rect.x)},${Math.round(rect.y)}`;
	}

	function tree(el, depth, maxChildren = 8, indent = "") {
		if (!el) return `${indent}(not found)\n`;
		let out = `${indent}${describe(el)}\n`;
		if (depth <= 0) return out;
		const children = [...el.children];
		for (const child of children.slice(0, maxChildren)) out += tree(child, depth - 1, maxChildren, `${indent}  `);
		if (children.length > maxChildren) out += `${indent}  ... ${children.length - maxChildren} more\n`;
		return out;
	}

	function ancestors(el) {
		const out = [];
		for (let node = el; node && node !== document.documentElement; node = node.parentElement) {
			const css = getComputedStyle(node);
			out.push(`${describe(node)} {display:${css.display}; bg:${css.backgroundColor}}`);
		}
		return `${out.join("\n")}\n`;
	}

	function snapshot() {
		const $ = (selector) => document.querySelector(selector);
		const bar = $('[data-testid="now-playing-bar"]');
		const appGrid = bar?.parentElement?.parentElement;
		const firstShelf = $('[data-testid="home-page"] h2')?.closest('section:not([data-testid="home-page"])');
		const spiceVars = [...document.documentElement.style].filter((name) => name.startsWith("--")).length;
		const parts = [
			header(),
			`extensions: ${(window.Spicetify?.Config?.extensions ?? []).join(", ") || "(none)"}`,
			`custom apps: ${(window.Spicetify?.Config?.custom_apps ?? []).join(", ") || "(none)"}`,
			`root class: ${document.documentElement.className}`,
			`root inline variables: ${spiceVars}`,
			`\n== recent errors ==\n${formatErrors()}\n`,
			`== player bar, up to body ==\n${bar ? ancestors(bar) : "(now-playing-bar not found)\n"}`,
			`== player bar tree ==\n${tree(bar, 5)}`,
			`== app grid ==\n${tree(appGrid, 2, 10)}`,
			`== top bar ==\n${tree($("#global-nav-bar") ?? appGrid?.firstElementChild, 4, 8)}`,
			`== main view ==\n${tree($("main"), 3, 6)}`,
			`== first Home shelf ==\n${tree(firstShelf, 4, 5)}`,
			`== Home shortcut tile ==\n${tree($('[data-testid="shortcut-background"]')?.parentElement?.parentElement, 3, 5)}`,
			`== entity header (album, playlist, artist) ==\n${tree($('[data-testid="entity-header"]'), 4, 6)}`,
			`== right sidebar ==\n${tree($(".NowPlayingView")?.closest("aside") ?? $('[data-testid="NPV_Panel_OpenDiv"]'), 3, 6)}`,
		];
		return parts.join("\n").slice(0, MAX_LENGTH);
	}

	async function copy(text, message) {
		try {
			if (window.Spicetify?.Platform?.ClipboardAPI?.copy) await Spicetify.Platform.ClipboardAPI.copy(text);
			else await navigator.clipboard.writeText(text);
			window.Spicetify?.showNotification?.(message);
		} catch {
			console.log(text);
			window.Spicetify?.showNotification?.("Could not copy. The text was printed to the console instead.", true);
		}
	}

	const copySnapshot = () => copy(snapshot(), "Page snapshot copied to clipboard");
	const toggleLog = () => (panel ? hideLog() : showLog());

	// ------------------------------------------------------------ shortcuts
	// Keyboard shortcuts work even when Spotify's menus don't (Spotify 1.3.5 broke extension menu entries).

	document.addEventListener(
		"keydown",
		(e) => {
			if (!e.ctrlKey || !e.altKey || e.shiftKey || e.metaKey) return;
			const key = e.key.toUpperCase();
			if (key === SHORTCUT_SNAPSHOT) copySnapshot();
			else if (key === SHORTCUT_ERRORS) toggleLog();
			else return;
			e.preventDefault();
			e.stopPropagation();
		},
		true
	);

	window.PageSnapshot = { copySnapshot, showLog, hideLog, errors: () => formatErrors() };

	// ---------------------------------------------------------- menu items
	// Menu items are built with React, which Spicetify exposes a little after Menu

	(function registerMenu() {
		if (!document.body || !window.Spicetify?.Menu || !Spicetify.React || !Spicetify.ReactJSX) {
			setTimeout(registerMenu, 300);
			return;
		}
		new Spicetify.Menu.Item("Copy page snapshot", false, copySnapshot).register();
		new Spicetify.Menu.Item("Show error log", false, toggleLog).register();
	})();
})();

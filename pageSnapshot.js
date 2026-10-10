// NAME: Page Snapshot
// VERSION: 1.0.0
// DESCRIPTION: Copies a text snapshot of Spotify's page structure to the clipboard. For theme and extension authors fixing selectors after a Spotify update.

(function pageSnapshot() {
	// Menu items are built with React, which Spicetify exposes a little after Menu
	if (!document.body || !window.Spicetify?.Menu || !Spicetify.React || !Spicetify.ReactJSX) {
		setTimeout(pageSnapshot, 300);
		return;
	}

	const MAX_LENGTH = 30000;

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
			`Spotify ${Spicetify.Platform?.version} | Spicetify ${Spicetify.Config?.version} | theme ${Spicetify.Config?.current_theme || "(none)"} | window ${innerWidth}x${innerHeight} | path ${Spicetify.Platform?.History?.location?.pathname}`,
			`extensions: ${(Spicetify.Config?.extensions ?? []).join(", ") || "(none)"}`,
			`custom apps: ${(Spicetify.Config?.custom_apps ?? []).join(", ") || "(none)"}`,
			`root class: ${document.documentElement.className}`,
			`root inline variables: ${spiceVars}`,
			`\n== player bar, up to body ==\n${bar ? ancestors(bar) : "(now-playing-bar not found)\n"}`,
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

	new Spicetify.Menu.Item("Copy page snapshot", false, async () => {
		const text = snapshot();
		try {
			if (Spicetify.Platform?.ClipboardAPI?.copy) await Spicetify.Platform.ClipboardAPI.copy(text);
			else await navigator.clipboard.writeText(text);
			Spicetify.showNotification?.("Page snapshot copied to clipboard");
		} catch (error) {
			console.log(text);
			Spicetify.showNotification?.("Could not copy. The snapshot was printed to the console instead.", true);
		}
	}).register();
})();

// Client-side mermaid rendering for ```mermaid fences.
// Starlight/Expressive Code renders them as <pre data-language="mermaid">;
// we swap each block for the rendered SVG after load.
const blocks = document.querySelectorAll('pre[data-language="mermaid"]');
if (blocks.length > 0) {
	const { default: mermaid } = await import(
		'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs'
	);
	const dark = document.documentElement.dataset.theme === 'dark';
	mermaid.initialize({
		startOnLoad: false,
		theme: dark ? 'dark' : 'neutral',
		fontFamily: "'Saira', ui-sans-serif, system-ui, sans-serif",
		themeVariables: {
			fontFamily: "'Saira', ui-sans-serif, system-ui, sans-serif",
			fontSize: '14px',
		},
	});
	// Expressive Code wraps every line in its own <div class="ec-line">, so
	// `pre.textContent` concatenates the lines with no newlines and mermaid
	// fails to parse. Rebuild the source line-by-line (falling back to
	// innerText / textContent for un-wrapped blocks).
	const extractSource = (pre) => {
		const lines = pre.querySelectorAll('.ec-line');
		if (lines.length > 0) {
			return [...lines].map((line) => line.textContent).join('\n');
		}
		return pre.innerText ?? pre.textContent ?? '';
	};

	let i = 0;
	for (const pre of blocks) {
		const source = extractSource(pre);
		const target = pre.closest('.expressive-code') ?? pre;
		const container = document.createElement('div');
		container.className = 'mermaid-diagram';
		try {
			const { svg } = await mermaid.render(`zarf-mmd-${i++}`, source);
			container.innerHTML = svg;
			target.replaceWith(container);
		} catch {
			// Leave the code block as-is if the diagram fails to parse.
		}
	}
}

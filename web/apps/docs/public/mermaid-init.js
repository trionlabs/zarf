// Client-side mermaid rendering for ```mermaid fences.
// Starlight/Expressive Code renders them as <pre data-language="mermaid">;
// we swap each block for the rendered SVG after load.
const blocks = document.querySelectorAll('pre[data-language="mermaid"]');
if (blocks.length > 0) {
	const { default: mermaid } = await import(
		'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs'
	);
	const dark = document.documentElement.dataset.theme === 'dark';
	mermaid.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'neutral' });
	let i = 0;
	for (const pre of blocks) {
		const source = pre.textContent ?? '';
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

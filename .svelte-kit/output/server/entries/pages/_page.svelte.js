import { c as create_ssr_component } from "../../chunks/index.js";
const _page_svelte_svelte_type_style_lang = "";
const css = {
  code: ".svelte-5ydix6.svelte-5ydix6{font-family:Courier}h3.svelte-5ydix6.svelte-5ydix6{margin-top:0.25rem;margin-bottom:0.25rem}.device-list.svelte-5ydix6.svelte-5ydix6{display:flex;flex-direction:row;flex-wrap:wrap;justify-content:space-around;gap:3px}.device.svelte-5ydix6.svelte-5ydix6{padding:10px;border-radius:4px;background:#f5f5f5;border:1px solid #ededed;flex-grow:1;width:30%}.device.svelte-5ydix6 h4.svelte-5ydix6{font-size:1rem;margin:0;float:left}.device.svelte-5ydix6 span.status.svelte-5ydix6{padding:3px 6px;border-radius:3px;text-align:right;float:right}.clear.svelte-5ydix6.svelte-5ydix6{clear:both}.device.svelte-5ydix6 span.status.up.svelte-5ydix6{background:#64ed61}.device.svelte-5ydix6 span.status.down.svelte-5ydix6{background:#ff5257}.device.svelte-5ydix6 p.svelte-5ydix6{color:#a3a2a2;margin-top:0.25rem;margin-bottom:0.25rem;font-size:0.75rem}.device.svelte-5ydix6 p b.svelte-5ydix6{color:#1f1f1f}button.svelte-5ydix6.svelte-5ydix6{padding:12px;border:none;border-radius:4px;cursor:pointer}button.primary.svelte-5ydix6.svelte-5ydix6{padding:12px;background:#2d7cfa;color:#ffffff;border:none;border-radius:4px}button.primary.svelte-5ydix6.svelte-5ydix6:disabled{background:#80b0fe;cursor:not-allowed}",
  map: null
};
const Page = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  $$result.css.add(css);
  return `
<h3 class="${"svelte-5ydix6"}">Network</h3>
<div class="${"svelte-5ydix6"}"><div class="${"device-list svelte-5ydix6"}">${``}</div></div>
`;
});
export {
  Page as default
};

// Every page is static: content pages are prerendered, app pages (login, device,
// dashboard) opt out of SSR and prerender as an empty shell that renders on the client.
export const prerender = true;
export const trailingSlash = 'never';

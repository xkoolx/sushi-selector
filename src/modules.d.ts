// Markdown files under shared/prompts/ are bundled as text modules (see the
// "rules" entry in wrangler.jsonc).
declare module "*.md" {
  const text: string;
  export default text;
}

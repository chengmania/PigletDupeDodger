// bun-types has no ambient declaration for *.css at all; this covers the
// `with { type: 'file' }` embedded-asset import in http.ts.
declare module '*.css' {
  const path: string;
  export default path;
}

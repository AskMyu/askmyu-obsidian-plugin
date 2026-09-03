/** esbuild's text loader: a `.css` import is the file's contents. Only snippets/myu-look.css uses it. */
declare module '*.css' {
  const text: string;
  export default text;
}

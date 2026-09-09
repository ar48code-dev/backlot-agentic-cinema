declare module "@babel/standalone" {
  type TransformOptions = {
    presets?: string[];
    sourceType?: "script" | "module";
  };

  const Babel: {
    transform(code: string, options?: TransformOptions): { code?: string };
  };

  export default Babel;
}
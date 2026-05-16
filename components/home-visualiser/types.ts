export type AmbientRenderOptions = {
  width: number;
  height: number;
  time: number;
  energy: number;
};

export type AmbientTheme = {
  name: string;
  init: (gl: WebGL2RenderingContext) => void;
  render: (gl: WebGL2RenderingContext, opts: AmbientRenderOptions) => void;
  dispose: (gl: WebGL2RenderingContext) => void;
};
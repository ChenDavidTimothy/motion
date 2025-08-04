// src/animation/types.ts
import type { CanvasRenderingContext2D as NodeCanvasCtx } from 'canvas';

export interface AnimationConfig {
  width: number;
  height: number;
  fps: number;
  duration: number;
  triangleSize: number;
  margin: number;
  rotations: number;
  backgroundColor: string;
  triangleColor: string;
  strokeColor: string;
  strokeWidth: number;
  videoPreset: string;
  videoCrf: number;
}

export interface Point2D {
  x: number;
  y: number;
}

export interface Transform {
  translate: Point2D;
  rotate: number;
  scale: Point2D;
}

export interface ParsedGlyph {
  width: number;
  path: string;
}

export interface ParsedTextElement {
  x: number;
  y: number;
  content: string;
  fontSize?: number;
  fontFamily?: string;
}

export interface ParsedPathElement {
  d: string;
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
  transform?: string;
}

export interface ParsedLineElement {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke?: string;
  strokeWidth?: number;
  transform?: string;
}

export interface ParsedRectElement {
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  transform?: string;
}

export interface ParsedLatex {
  fontGlyphs: Map<string, Map<string, ParsedGlyph>>;
  textElements: ParsedTextElement[];
  pathElements: ParsedPathElement[];
  lineElements: ParsedLineElement[];
  rectElements: ParsedRectElement[];
  baseFontSize: number;
}

export type NodeCanvasContext = NodeCanvasCtx;
export type EasingFunction = (t: number) => number;
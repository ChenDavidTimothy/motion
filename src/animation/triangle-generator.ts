// src/animation/triangle-generator.ts
import path from 'path';
import type { ParsedLatex } from './types';
import { FrameGenerator, type FrameConfig } from './renderer/frame-generator';
import { drawTriangle, type TriangleStyle } from './geometry/triangle';
import { renderLatex } from './renderer/latex-renderer';
import { easeInOutCubic } from './core/interpolation';

export interface TriangleAnimationConfig {
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

export const DEFAULT_CONFIG: TriangleAnimationConfig = {
  width: 1920,
  height: 1080,
  fps: 120,
  duration: 3,
  triangleSize: 80,
  margin: 100,
  rotations: 2,
  backgroundColor: '#000000',
  triangleColor: '#ff4444',
  strokeColor: '#ffffff',
  strokeWidth: 3,
  videoPreset: 'medium',
  videoCrf: 18
};

export async function generateTriangleAnimation(
  latexData: ParsedLatex,
  equation: string,
  config: TriangleAnimationConfig = DEFAULT_CONFIG
): Promise<string> {
  const outputDir = path.join(process.cwd(), 'public', 'animations');
  const filename = `triangle_${Date.now()}_${Math.random()
    .toString(36)
    .substr(2, 9)}.mp4`;
  const outputPath = path.join(outputDir, filename);

  const frameConfig: FrameConfig = {
    width: config.width,
    height: config.height,
    fps: config.fps,
    duration: config.duration,
    backgroundColor: config.backgroundColor
  };

  const frameGenerator = new FrameGenerator(frameConfig, easeInOutCubic);

  const triangleStyle: TriangleStyle = {
    fillColor: config.triangleColor,
    strokeColor: config.strokeColor,
    strokeWidth: config.strokeWidth
  };

  await frameGenerator.generateAnimation(
    outputPath,
    (ctx, frame, frameConfig) => {
      const MOVE_DISTANCE = frameConfig.width - config.margin * 2;
      
      // Calculate triangle position and rotation
      const x = config.margin + frame.easedProgress * MOVE_DISTANCE;
      const y = frameConfig.height / 2;
      const rotation = frame.easedProgress * Math.PI * 2 * config.rotations;

      // Draw triangle
      drawTriangle(ctx, { x, y }, config.triangleSize, rotation, triangleStyle);

      // Render LaTeX equation
      renderLatex(
        ctx as unknown as CanvasRenderingContext2D, 
        latexData, 
        frameConfig.width / 2 + 500, 
        frameConfig.height / 2 - 200, 
        8
      );
    },
    {
      preset: config.videoPreset,
      crf: config.videoCrf
    }
  );

  return `/animations/${filename}`;
}
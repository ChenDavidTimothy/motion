// src/animation/scene-generator.ts
import path from 'path';
import type { ParsedLatex } from './types';
import type { AnimationScene } from './scene/scene';
import { FrameGenerator, type FrameConfig } from './renderer/frame-generator';
import { SceneRenderer, type SceneRenderConfig } from './execution/scene-renderer';
import { latexToSvg, parseSVGContent } from './renderer/latex-renderer';
import { validateScene } from './scene/scene';
import { linear } from './core/interpolation';

export interface SceneAnimationConfig {
  width: number;
  height: number;
  fps: number;
  backgroundColor: string;
  videoPreset: string;
  videoCrf: number;
}

export const DEFAULT_SCENE_CONFIG: SceneAnimationConfig = {
  width: 1920,
  height: 1080,
  fps: 60,
  backgroundColor: '#000000',
  videoPreset: 'medium',
  videoCrf: 18
};

export async function generateSceneAnimation(
  scene: AnimationScene,
  config: SceneAnimationConfig = DEFAULT_SCENE_CONFIG
): Promise<string> {
  // Validate scene
  const errors = validateScene(scene);
  if (errors.length > 0) {
    throw new Error(`Scene validation failed: ${errors.join(', ')}`);
  }

  // Process LaTeX if present
  let latexData: ParsedLatex | undefined;
  if (scene.latex?.equation) {
    try {
      const svgContent = await latexToSvg(scene.latex.equation);
      latexData = parseSVGContent(svgContent);
    } catch (error) {
      console.warn('LaTeX processing failed:', error);
      // Continue without LaTeX rendering
    }
  }

  // Setup output path
  const outputDir = path.join(process.cwd(), 'public', 'animations');
  const filename = `scene_${Date.now()}_${Math.random()
    .toString(36)
    .substr(2, 9)}.mp4`;
  const outputPath = path.join(outputDir, filename);

  // Configure frame generation
  const frameConfig: FrameConfig = {
    width: config.width,
    height: config.height,
    fps: config.fps,
    duration: scene.duration,
    backgroundColor: config.backgroundColor
  };

  const sceneRenderConfig: SceneRenderConfig = {
    width: config.width,
    height: config.height,
    backgroundColor: config.backgroundColor
  };

  // Create renderer and frame generator
  const sceneRenderer = new SceneRenderer(scene, sceneRenderConfig, latexData);
  const frameGenerator = new FrameGenerator(frameConfig, linear);

  // Generate animation
  await frameGenerator.generateAnimation(
    outputPath,
    (ctx, frame) => {
      sceneRenderer.renderFrame(ctx, frame.time);
    },
    {
      preset: config.videoPreset,
      crf: config.videoCrf
    }
  );

  return `/animations/${filename}`;
}


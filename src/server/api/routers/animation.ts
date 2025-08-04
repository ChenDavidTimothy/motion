// src/server/api/routers/animation.ts
import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { 
  generateSceneAnimation, 
  DEFAULT_SCENE_CONFIG,
  type SceneAnimationConfig 
} from "@/animation/scene-generator";
import { validateScene } from "@/animation/scene/scene";

// Scene config schema
const sceneConfigSchema = z.object({
  width: z.number().optional(),
  height: z.number().optional(),
  fps: z.number().optional(),
  backgroundColor: z.string().optional(),
  videoPreset: z.string().optional(),
  videoCrf: z.number().optional(),
});

// Scene object schemas
const point2DSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const trianglePropertiesSchema = z.object({
  size: z.number(),
  color: z.string(),
  strokeColor: z.string().optional(),
  strokeWidth: z.number().optional(),
});

const circlePropertiesSchema = z.object({
  radius: z.number(),
  color: z.string(),
  strokeColor: z.string().optional(),
  strokeWidth: z.number().optional(),
});

const rectanglePropertiesSchema = z.object({
  width: z.number(),
  height: z.number(),
  color: z.string(),
  strokeColor: z.string().optional(),
  strokeWidth: z.number().optional(),
});

const sceneObjectSchema = z.object({
  id: z.string(),
  type: z.enum(['triangle', 'circle', 'rectangle']),
  properties: z.union([trianglePropertiesSchema, circlePropertiesSchema, rectanglePropertiesSchema]),
  initialPosition: point2DSchema,
  initialRotation: z.number().optional(),
  initialScale: point2DSchema.optional(),
  initialOpacity: z.number().min(0).max(1).optional(),
});

const animationTrackSchema = z.object({
  objectId: z.string(),
  type: z.enum(['move', 'rotate', 'scale', 'fade', 'color']),
  startTime: z.number().min(0),
  duration: z.number().min(0),
  easing: z.enum(['linear', 'easeInOut', 'easeIn', 'easeOut']),
  properties: z.record(z.any()),
});

const latexElementSchema = z.object({
  equation: z.string(),
  position: point2DSchema,
  scale: z.number().optional(),
});

const animationSceneSchema = z.object({
  duration: z.number().min(0),
  objects: z.array(sceneObjectSchema),
  animations: z.array(animationTrackSchema),
  latex: latexElementSchema.optional(),
  background: z.object({
    color: z.string(),
  }).optional(),
});

export const animationRouter = createTRPCRouter({
  // Main scene-based endpoint
  generateScene: publicProcedure
    .input(z.object({
      scene: animationSceneSchema,
      config: sceneConfigSchema.optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const config: SceneAnimationConfig = {
          ...DEFAULT_SCENE_CONFIG,
          ...input.config,
        };
        
        const videoUrl = await generateSceneAnimation(input.scene, config);
        
        return {
          success: true,
          videoUrl,
          scene: input.scene,
          config,
        };
      } catch (error) {
        console.error("Scene animation generation failed:", error);
        throw new Error(
          error instanceof Error 
            ? `Scene animation generation failed: ${error.message}`
            : "Scene animation generation failed with unknown error"
        );
      }
    }),

  // Utility endpoints
  getDefaultSceneConfig: publicProcedure
    .query(() => {
      return DEFAULT_SCENE_CONFIG;
    }),

  getDefaultTriangleConfig: publicProcedure
    .query(() => {
      return {
        width: 1920,
        height: 1080,
        fps: 60,
        duration: 3,
        triangleSize: 80,
        margin: 100,
        rotations: 2,
        backgroundColor: '#000000',
        triangleColor: '#ff4444',
        strokeColor: '#ffffff',
        strokeWidth: 3,
        videoPreset: 'medium',
        videoCrf: 18,
      };
    }),

  validateScene: publicProcedure
    .input(animationSceneSchema)
    .query(({ input }) => {
      const errors = validateScene(input);
      return {
        valid: errors.length === 0,
        errors,
      };
    }),
});
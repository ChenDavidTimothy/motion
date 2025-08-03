import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { latexToSvg, parseSVGContent } from "@/lib/latex-parser";
import { generateTriangleAnimation, DEFAULT_CONFIG, type AnimationConfig } from "@/lib/triangle-generator";

const animationConfigSchema = z.object({
  width: z.number().optional(),
  height: z.number().optional(),
  fps: z.number().optional(),
  duration: z.number().optional(),
  triangleSize: z.number().optional(),
  margin: z.number().optional(),
  rotations: z.number().optional(),
  backgroundColor: z.string().optional(),
  triangleColor: z.string().optional(),
  strokeColor: z.string().optional(),
  strokeWidth: z.number().optional(),
  videoPreset: z.string().optional(),
  videoCrf: z.number().optional(),
});

export const animationRouter = createTRPCRouter({
  generateTriangle: publicProcedure
    .input(z.object({
      equation: z.string().min(1, "Equation cannot be empty"),
      config: animationConfigSchema.optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        // Parse LaTeX equation to SVG
        const svgContent = await latexToSvg(input.equation);
        const latexData = parseSVGContent(svgContent);
        
        // Merge user config with defaults
        const config: AnimationConfig = {
          ...DEFAULT_CONFIG,
          ...input.config,
        };
        
        // Generate animation
        const videoUrl = await generateTriangleAnimation(
          latexData,
          input.equation,
          config
        );
        
        return {
          success: true,
          videoUrl,
          equation: input.equation,
          config,
        };
      } catch (error) {
        console.error("Animation generation failed:", error);
        throw new Error(
          error instanceof Error 
            ? `Animation generation failed: ${error.message}`
            : "Animation generation failed with unknown error"
        );
      }
    }),

  getDefaultConfig: publicProcedure
    .query(() => {
      return DEFAULT_CONFIG;
    }),
});
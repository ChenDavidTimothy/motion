import { createCanvas } from 'canvas';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { type ParsedLatex, renderLatex } from './latex-parser';

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

export const DEFAULT_CONFIG: AnimationConfig = {
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

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function drawTriangle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  rotation: number,
  config: AnimationConfig
): void {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(rotation);
  ctx.fillStyle = config.triangleColor;
  ctx.strokeStyle = config.strokeColor;
  ctx.lineWidth = config.strokeWidth;
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(-size * 0.866, size * 0.5);
  ctx.lineTo(size * 0.866, size * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function writeFrame(
  ffmpegProcess: ReturnType<typeof spawn>,
  frameData: Buffer
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ffmpegProcess.stdin?.write(frameData)) {
      resolve();
    } else {
      const onDrain = () => {
        ffmpegProcess.stdin?.removeListener('error', onError);
        resolve();
      };
      const onError = (error: Error) => {
        ffmpegProcess.stdin?.removeListener('drain', onDrain);
        reject(error);
      };
      
      ffmpegProcess.stdin?.once('drain', onDrain);
      ffmpegProcess.stdin?.once('error', onError);
    }
  });
}

export async function generateTriangleAnimation(
  latexData: ParsedLatex,
  equation: string,
  config: AnimationConfig = DEFAULT_CONFIG
): Promise<string> {
  const outputDir = path.join(process.cwd(), 'public', 'animations');
  const filename = `triangle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp4`;
  const outputPath = path.join(outputDir, filename);
  
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const TOTAL_FRAMES = config.fps * config.duration;
  const MOVE_DISTANCE = config.width - (config.margin * 2);
  const canvas = createCanvas(config.width, config.height);
  const ctx = canvas.getContext('2d');

  return new Promise((resolve, reject) => {
    const ffmpegProcess = spawn('ffmpeg', [
      '-f', 'rawvideo', '-pix_fmt', 'rgb24',
      '-s', `${config.width}x${config.height}`,
      '-r', config.fps.toString(), '-i', 'pipe:0',
      '-pix_fmt', 'yuv420p', '-c:v', 'libx264',
      '-preset', config.videoPreset, '-crf', config.videoCrf.toString(),
      '-y', outputPath
    ]);

    ffmpegProcess.on('error', (error) => {
      reject(new Error(`FFmpeg failed: ${error.message}`));
    });

    ffmpegProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`FFmpeg exited with code ${code}`));
      } else {
        resolve(`/animations/${filename}`);
      }
    });

    // Generate and stream frames
    (async () => {
      try {
        for (let frame = 0; frame < TOTAL_FRAMES; frame++) {
          const progress = frame / (TOTAL_FRAMES - 1);
          const easedProgress = easeInOutCubic(progress);
          
          const x = config.margin + (easedProgress * MOVE_DISTANCE);
          const y = config.height / 2;
          const rotation = easedProgress * Math.PI * 2 * config.rotations;
          
          // Clear canvas
          ctx.fillStyle = config.backgroundColor;
          ctx.fillRect(0, 0, config.width, config.height);
          
          // Draw triangle
          drawTriangle(ctx, x, y, config.triangleSize, rotation, config);
          
          // Render LaTeX equation
          renderLatex(ctx, latexData, config.width / 2, 150, 8);
          
          // Convert to RGB buffer
          const imageData = ctx.getImageData(0, 0, config.width, config.height);
          const rgbPixels = new Uint8Array(config.width * config.height * 3);
          
          for (let i = 0; i < config.width * config.height; i++) {
            const rgbaIndex = i * 4;
            const rgbIndex = i * 3;
            rgbPixels[rgbIndex] = imageData.data[rgbaIndex];
            rgbPixels[rgbIndex + 1] = imageData.data[rgbaIndex + 1];
            rgbPixels[rgbIndex + 2] = imageData.data[rgbaIndex + 2];
          }
          
          await writeFrame(ffmpegProcess, Buffer.from(rgbPixels));
        }
        
        ffmpegProcess.stdin?.end();
      } catch (error) {
        ffmpegProcess.kill();
        reject(error);
      }
    })();
  });
}
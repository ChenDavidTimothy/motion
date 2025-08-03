import { createCanvas } from 'canvas';
import { spawn } from 'child_process';

const CONFIG = {
  WIDTH: 1920,
  HEIGHT: 1080,
  FPS: 60,
  DURATION: 3,
  TRIANGLE_SIZE: 80,
  MARGIN: 100,
  ROTATIONS: 2,
  BACKGROUND_COLOR: '#000000',
  TRIANGLE_COLOR: '#ff4444',
  STROKE_COLOR: '#ffffff',
  STROKE_WIDTH: 3,
  VIDEO_PRESET: 'medium',
  VIDEO_CRF: 18
};

const TOTAL_FRAMES = CONFIG.FPS * CONFIG.DURATION;
const MOVE_DISTANCE = CONFIG.WIDTH - (CONFIG.MARGIN * 2);

const canvas = createCanvas(CONFIG.WIDTH, CONFIG.HEIGHT);
const ctx = canvas.getContext('2d');

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function drawTriangle(x, y, size, rotation) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(rotation);
  ctx.fillStyle = CONFIG.TRIANGLE_COLOR;
  ctx.strokeStyle = CONFIG.STROKE_COLOR;
  ctx.lineWidth = CONFIG.STROKE_WIDTH;
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(-size * 0.866, size * 0.5);
  ctx.lineTo(size * 0.866, size * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

const ffmpegProcess = spawn('ffmpeg', [
  '-f', 'rawvideo', '-pix_fmt', 'rgb24',
  '-s', `${CONFIG.WIDTH}x${CONFIG.HEIGHT}`,
  '-r', CONFIG.FPS.toString(), '-i', 'pipe:0',
  '-pix_fmt', 'yuv420p', '-c:v', 'libx264',
  '-preset', CONFIG.VIDEO_PRESET, '-crf', CONFIG.VIDEO_CRF.toString(),
  '-y', 'triangle_animation.mp4'
]);

ffmpegProcess.on('error', (error) => {
  throw new Error(`FFmpeg failed: ${error.message}`);
});

ffmpegProcess.on('close', (code) => {
  if (code !== 0) throw new Error(`FFmpeg exited with code ${code}`);
});

async function writeFrame(frameData) {
  return new Promise((resolve, reject) => {
    if (ffmpegProcess.stdin.write(frameData)) {
      resolve();
    } else {
      const onDrain = () => {
        ffmpegProcess.stdin.removeListener('error', onError);
        resolve();
      };
      const onError = (error) => {
        ffmpegProcess.stdin.removeListener('drain', onDrain);
        reject(error);
      };
      
      ffmpegProcess.stdin.once('drain', onDrain);
      ffmpegProcess.stdin.once('error', onError);
    }
  });
}

async function renderAnimation() {
  for (let frame = 0; frame < TOTAL_FRAMES; frame++) {
    const progress = frame / (TOTAL_FRAMES - 1);
    const easedProgress = easeInOutCubic(progress);
    
    const x = CONFIG.MARGIN + (easedProgress * MOVE_DISTANCE);
    const y = CONFIG.HEIGHT / 2;
    const rotation = easedProgress * Math.PI * 2 * CONFIG.ROTATIONS;
    
    ctx.fillStyle = CONFIG.BACKGROUND_COLOR;
    ctx.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
    drawTriangle(x, y, CONFIG.TRIANGLE_SIZE, rotation);
    
    const imageData = ctx.getImageData(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
    const rgbaPixels = imageData.data;
    
    const rgbPixels = new Uint8Array(CONFIG.WIDTH * CONFIG.HEIGHT * 3);
    for (let i = 0; i < CONFIG.WIDTH * CONFIG.HEIGHT; i++) {
      const rgbaIndex = i * 4;
      const rgbIndex = i * 3;
      rgbPixels[rgbIndex] = rgbaPixels[rgbaIndex];
      rgbPixels[rgbIndex + 1] = rgbaPixels[rgbaIndex + 1];
      rgbPixels[rgbIndex + 2] = rgbaPixels[rgbaIndex + 2];
    }
    
    await writeFrame(Buffer.from(rgbPixels));
  }
  
  ffmpegProcess.stdin.end();
}

renderAnimation();
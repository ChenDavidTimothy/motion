import { createCanvas } from 'canvas';
import { spawn } from 'child_process';

// Video settings
const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 60;
const DURATION = 3; // seconds
const TOTAL_FRAMES = FPS * DURATION;

// Create canvas
const canvas = createCanvas(WIDTH, HEIGHT);
const ctx = canvas.getContext('2d');

// Setup FFmpeg process
const ffmpegArgs = [
  '-f', 'rawvideo',
  '-pix_fmt', 'rgb24',
  '-s', `${WIDTH}x${HEIGHT}`,
  '-r', FPS.toString(),
  '-i', 'pipe:0',
  '-pix_fmt', 'yuv420p',
  '-c:v', 'libx264',
  '-y', // overwrite output file
  'triangle_animation.mp4'
];

const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);

ffmpegProcess.stdout.on('data', (data) => {
  console.log(`FFmpeg: ${data}`);
});

ffmpegProcess.stderr.on('data', (data) => {
  // FFmpeg outputs to stderr by default
  console.log(`FFmpeg: ${data}`);
});

ffmpegProcess.on('close', (code) => {
  if (code === 0) {
    console.log('Video generated: triangle_animation.mp4');
  } else {
    console.error(`FFmpeg exited with code ${code}`);
  }
});

// Triangle drawing function
function drawTriangle(x, y, size, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - size);           // top
  ctx.lineTo(x - size, y + size);    // bottom left  
  ctx.lineTo(x + size, y + size);    // bottom right
  ctx.closePath();
  ctx.fill();
}

// Render frames
for (let frame = 0; frame < TOTAL_FRAMES; frame++) {
  // Clear canvas (black background)
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  
  // Calculate triangle position (left to right)
  const progress = frame / (TOTAL_FRAMES - 1);
  const triangleX = 100 + (progress * (WIDTH - 200)); // Move from 100 to WIDTH-100
  const triangleY = HEIGHT / 2;
  
  // Draw triangle
  drawTriangle(triangleX, triangleY, 50, 'red');
  
  // Get pixel data
  const imageData = ctx.getImageData(0, 0, WIDTH, HEIGHT);
  const pixels = imageData.data; // RGBA format
  
  // Convert RGBA to RGB for FFmpeg
  const rgbPixels = new Uint8Array(WIDTH * HEIGHT * 3);
  for (let i = 0; i < WIDTH * HEIGHT; i++) {
    rgbPixels[i * 3] = pixels[i * 4];         // R
    rgbPixels[i * 3 + 1] = pixels[i * 4 + 1]; // G  
    rgbPixels[i * 3 + 2] = pixels[i * 4 + 2]; // B
  }
  
  // Write frame to FFmpeg stdin
  ffmpegProcess.stdin.write(Buffer.from(rgbPixels));
  
  console.log(`Frame ${frame + 1}/${TOTAL_FRAMES} rendered`);
}

// Close FFmpeg stdin
ffmpegProcess.stdin.end();
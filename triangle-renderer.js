import { createCanvas } from 'canvas';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execAsync = promisify(exec);

const CONFIG = {
  WIDTH: 1920,
  HEIGHT: 1080,
  FPS: 120,
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

async function latexToSvg(equation) {
  if (!fs.existsSync('temp')) fs.mkdirSync('temp');
  
  const latexContent = `\\documentclass[preview,border=2pt]{standalone}
\\usepackage{amsmath}
\\usepackage{amsfonts}
\\begin{document}
$\\displaystyle ${equation}$
\\end{document}`;
  
  fs.writeFileSync('temp/eq.tex', latexContent);
  
  await execAsync('latex -interaction=nonstopmode eq.tex', { cwd: 'temp' });
  await execAsync('dvisvgm eq.dvi -o eq.svg', { cwd: 'temp' });
  
  const svgContent = fs.readFileSync('temp/eq.svg', 'utf8');
  fs.rmSync('temp', { recursive: true, force: true });
  
  return svgContent;
}

function renderSVGPath(ctx, pathData) {
  if (!pathData) return;
  
  const commands = [];
  let i = 0;
  while (i < pathData.length) {
    if (/[MmLlHhVvCcSsQqTtAaZz]/.test(pathData[i])) {
      let j = i + 1;
      while (j < pathData.length && !/[MmLlHhVvCcSsQqTtAaZz]/.test(pathData[j])) j++;
      commands.push(pathData.slice(i, j));
      i = j;
    } else i++;
  }
  
  ctx.beginPath();
  let currentX = 0, currentY = 0, startX = 0, startY = 0, lastControlX = 0, lastControlY = 0;
  
  for (const command of commands) {
    const type = command[0];
    const isRelative = type === type.toLowerCase();
    const coords = [...command.slice(1).trim().matchAll(/-?\d*\.?\d+/g)].map(m => parseFloat(m[0]));
    
    switch (type.toUpperCase()) {
      case 'M':
        currentX = isRelative ? currentX + coords[0] : coords[0];
        currentY = isRelative ? currentY + coords[1] : coords[1];
        startX = currentX; startY = currentY;
        ctx.moveTo(currentX, currentY);
        break;
      case 'L':
        currentX = isRelative ? currentX + coords[0] : coords[0];
        currentY = isRelative ? currentY + coords[1] : coords[1];
        ctx.lineTo(currentX, currentY);
        break;
      case 'H':
        currentX = isRelative ? currentX + coords[0] : coords[0];
        ctx.lineTo(currentX, currentY);
        break;
      case 'V':
        currentY = isRelative ? currentY + coords[0] : coords[0];
        ctx.lineTo(currentX, currentY);
        break;
      case 'C':
        const cp1x = isRelative ? currentX + coords[0] : coords[0];
        const cp1y = isRelative ? currentY + coords[1] : coords[1];
        const cp2x = isRelative ? currentX + coords[2] : coords[2];
        const cp2y = isRelative ? currentY + coords[3] : coords[3];
        currentX = isRelative ? currentX + coords[4] : coords[4];
        currentY = isRelative ? currentY + coords[5] : coords[5];
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, currentX, currentY);
        lastControlX = cp2x; lastControlY = cp2y;
        break;
      case 'S':
        const scp1x = 2 * currentX - lastControlX;
        const scp1y = 2 * currentY - lastControlY;
        const scp2x = isRelative ? currentX + coords[0] : coords[0];
        const scp2y = isRelative ? currentY + coords[1] : coords[1];
        currentX = isRelative ? currentX + coords[2] : coords[2];
        currentY = isRelative ? currentY + coords[3] : coords[3];
        ctx.bezierCurveTo(scp1x, scp1y, scp2x, scp2y, currentX, currentY);
        lastControlX = scp2x; lastControlY = scp2y;
        break;
      case 'Q':
        const qcp1x = isRelative ? currentX + coords[0] : coords[0];
        const qcp1y = isRelative ? currentY + coords[1] : coords[1];
        currentX = isRelative ? currentX + coords[2] : coords[2];
        currentY = isRelative ? currentY + coords[3] : coords[3];
        ctx.quadraticCurveTo(qcp1x, qcp1y, currentX, currentY);
        lastControlX = qcp1x; lastControlY = qcp1y;
        break;
      case 'T':
        const tcp1x = 2 * currentX - lastControlX;
        const tcp1y = 2 * currentY - lastControlY;
        currentX = isRelative ? currentX + coords[0] : coords[0];
        currentY = isRelative ? currentY + coords[1] : coords[1];
        ctx.quadraticCurveTo(tcp1x, tcp1y, currentX, currentY);
        lastControlX = tcp1x; lastControlY = tcp1y;
        break;
      case 'Z':
        ctx.lineTo(startX, startY);
        ctx.closePath();
        currentX = startX; currentY = startY;
        break;
    }
  }
  
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}

function parseSVGContent(svgContent) {
  const glyphs = new Map();
  
  for (const match of svgContent.matchAll(/<glyph[^>]*>/gs)) {
    const tag = match[0];
    const unicode = tag.match(/unicode=['"]([^'"]*)['"]/)?.[1];
    const width = parseFloat(tag.match(/horiz-adv-x=['"]([^'"]*)['"]/)?.[1] || '500');
    const path = tag.match(/d=['"]([^'"]*)['"]/s)?.[1];
    
    if (unicode && path) glyphs.set(unicode, { width, path });
  }
  
  const textElements = [];
  for (const match of svgContent.matchAll(/<text[^>]*>.*?<\/text>/gs)) {
    const x = parseFloat(match[0].match(/x=['"]([^'"]*)['"]/)?.[1] || '0');
    const y = parseFloat(match[0].match(/y=['"]([^'"]*)['"]/)?.[1] || '0');
    const content = match[0].match(/>([^<]+)</)?.[1];
    
    if (content) textElements.push({ x, y, content });
  }
  
  return { glyphs, textElements };
}

function renderLatex(ctx, latexData, x, y, scale = 1) {
  const { glyphs, textElements } = latexData;
  
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  
  for (const textElement of textElements) {
    let charX = textElement.x;
    for (const char of textElement.content) {
      const glyph = glyphs.get(char);
      if (glyph) {
        ctx.save();
        ctx.translate(charX, textElement.y);
        ctx.scale(0.01, -0.01);
        renderSVGPath(ctx, glyph.path);
        ctx.restore();
        charX += glyph.width * 0.01;
      }
    }
  }
  
  ctx.restore();
}

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

function writeFrame(frameData) {
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
  const svgContent = await latexToSvg('a^{2} + b^{2} = c^{2}');
  const latexData = parseSVGContent(svgContent);
  
  for (let frame = 0; frame < TOTAL_FRAMES; frame++) {
    const progress = frame / (TOTAL_FRAMES - 1);
    const easedProgress = easeInOutCubic(progress);
    
    const x = CONFIG.MARGIN + (easedProgress * MOVE_DISTANCE);
    const y = CONFIG.HEIGHT / 2;
    const rotation = easedProgress * Math.PI * 2 * CONFIG.ROTATIONS;
    
    ctx.fillStyle = CONFIG.BACKGROUND_COLOR;
    ctx.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
    
    drawTriangle(x, y, CONFIG.TRIANGLE_SIZE, rotation);
    renderLatex(ctx, latexData, CONFIG.WIDTH / 2, 150, 8);
    
    const imageData = ctx.getImageData(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
    const rgbPixels = new Uint8Array(CONFIG.WIDTH * CONFIG.HEIGHT * 3);
    
    for (let i = 0; i < CONFIG.WIDTH * CONFIG.HEIGHT; i++) {
      const rgbaIndex = i * 4;
      const rgbIndex = i * 3;
      rgbPixels[rgbIndex] = imageData.data[rgbaIndex];
      rgbPixels[rgbIndex + 1] = imageData.data[rgbaIndex + 1];
      rgbPixels[rgbIndex + 2] = imageData.data[rgbaIndex + 2];
    }
    
    await writeFrame(Buffer.from(rgbPixels));
  }
  
  ffmpegProcess.stdin.end();
}

renderAnimation().catch(console.error);
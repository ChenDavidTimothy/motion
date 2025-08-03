import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

export interface ParsedGlyph {
  width: number;
  path: string;
}

export interface ParsedTextElement {
  x: number;
  y: number;
  content: string;
}

export interface ParsedLatex {
  glyphs: Map<string, ParsedGlyph>;
  textElements: ParsedTextElement[];
}

export async function latexToSvg(equation: string): Promise<string> {
  const tempDir = path.join(process.cwd(), 'temp', `latex_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  try {
    // Strip existing math delimiters
    const cleanEquation = equation
      .replace(/^\\\(/, '')     // Remove \( at start
      .replace(/\\\)$/, '')     // Remove \) at end
      .replace(/^\$\$/, '')     // Remove $ at start
      .replace(/\$\$/, '')     // Remove $ at end
      .replace(/^\$/, '')       // Remove $ at start
      .replace(/\$/, '')       // Remove $ at end
      .trim();
    
    const latexContent = `\\documentclass[preview,border=2pt]{standalone}
\\usepackage{amsmath}
\\usepackage{amsfonts}
\\begin{document}
$\\displaystyle ${cleanEquation}$
\\end{document}`;
    
    fs.writeFileSync(path.join(tempDir, 'eq.tex'), latexContent);
    
    await execAsync('latex -interaction=nonstopmode eq.tex', { cwd: tempDir });
    await execAsync('dvisvgm eq.dvi -o eq.svg', { cwd: tempDir });
    
    const svgContent = fs.readFileSync(path.join(tempDir, 'eq.svg'), 'utf8');
    
    return svgContent;
  } finally {
    // Cleanup temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

export function parseSVGContent(svgContent: string): ParsedLatex {
  const glyphs = new Map<string, ParsedGlyph>();
  
  // Parse glyphs from SVG font definitions
  for (const match of svgContent.matchAll(/<glyph[^>]*>/gs)) {
    const tag = match[0];
    const unicode = tag.match(/unicode=['"]([^'"]*)['"]/)?.[1];
    const width = parseFloat(tag.match(/horiz-adv-x=['"]([^'"]*)['"]/)?.[1] || '500');
    const pathData = tag.match(/d=['"]([^'"]*)['"]/s)?.[1];
    
    if (unicode && pathData) {
      glyphs.set(unicode, { width, path: pathData });
    }
  }
  
  // Parse text elements
  const textElements: ParsedTextElement[] = [];
  for (const match of svgContent.matchAll(/<text[^>]*>.*?<\/text>/gs)) {
    const x = parseFloat(match[0].match(/x=['"]([^'"]*)['"]/)?.[1] || '0');
    const y = parseFloat(match[0].match(/y=['"]([^'"]*)['"]/)?.[1] || '0');
    const content = match[0].match(/>([^<]+)</)?.[1];
    
    if (content) {
      textElements.push({ x, y, content });
    }
  }
  
  return { glyphs, textElements };
}

export function renderSVGPath(ctx: CanvasRenderingContext2D, pathData: string): void {
  if (!pathData) return;
  
  const commands: string[] = [];
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

export function renderLatex(
  ctx: CanvasRenderingContext2D, 
  latexData: ParsedLatex, 
  x: number, 
  y: number, 
  scale: number = 1
): void {
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
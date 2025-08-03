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
  glyphs: Map<string, ParsedGlyph>;
  textElements: ParsedTextElement[];
  pathElements: ParsedPathElement[];
  lineElements: ParsedLineElement[];
  rectElements: ParsedRectElement[];
}

export async function latexToSvg(equation: string): Promise<string> {
  const tempDir = path.join(process.cwd(), 'temp', `latex_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  try {
    // Strip existing math delimiters
    const cleanEquation = equation
      .replace(/^\\\[/, '')     // ADD: Remove \[ at start
      .replace(/\\\]$/, '')     // ADD: Remove \] at end
      .replace(/^\\\(/, '')     // Remove \( at start
      .replace(/\\\)$/, '')     // Remove \) at end
      .replace(/^\$\$/, '')     // Remove $$ at start
      .replace(/\$\$$/, '')     // Remove $$ at end
      .replace(/^\$/, '')       // Remove $ at start
      .replace(/\$$/, '')       // Remove $ at end
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

function parseAttributeValue(tag: string, attribute: string): string | undefined {
  const match = tag.match(new RegExp(`${attribute}=['"]([^'"]*)['"]\|${attribute}=([^\\s>]*)`));
  return match?.[1] || match?.[2];
}

function parseNumericAttribute(tag: string, attribute: string): number {
  const value = parseAttributeValue(tag, attribute);
  return value ? parseFloat(value) : 0;
}

export function parseSVGContent(svgContent: string): ParsedLatex {
  const glyphs = new Map<string, ParsedGlyph>();
  const textElements: ParsedTextElement[] = [];
  const pathElements: ParsedPathElement[] = [];
  const lineElements: ParsedLineElement[] = [];
  const rectElements: ParsedRectElement[] = [];
  
  // Parse glyphs from SVG font definitions
  for (const match of svgContent.matchAll(/<glyph[^>]*>/gs)) {
    const tag = match[0];
    const unicode = parseAttributeValue(tag, 'unicode');
    const width = parseNumericAttribute(tag, 'horiz-adv-x') || 500;
    const pathData = parseAttributeValue(tag, 'd');
    
    if (unicode && pathData) {
      glyphs.set(unicode, { width, path: pathData });
    }
  }
  
  // Parse text elements
  for (const match of svgContent.matchAll(/<text[^>]*>.*?<\/text>/gs)) {
    const x = parseNumericAttribute(match[0], 'x');
    const y = parseNumericAttribute(match[0], 'y');
    const content = match[0].match(/>([^<]+)</)?.[1];
    
    if (content) {
      textElements.push({ x, y, content });
    }
  }
  
  // Parse path elements (fraction lines, radicals, etc.)
  for (const match of svgContent.matchAll(/<path[^>]*\/?>|<path[^>]*>.*?<\/path>/gs)) {
    const tag = match[0];
    const d = parseAttributeValue(tag, 'd');
    
    if (d) {
      pathElements.push({
        d,
        stroke: parseAttributeValue(tag, 'stroke'),
        strokeWidth: parseNumericAttribute(tag, 'stroke-width'),
        fill: parseAttributeValue(tag, 'fill'),
        transform: parseAttributeValue(tag, 'transform')
      });
    }
  }
  
  // Parse line elements
  for (const match of svgContent.matchAll(/<line[^>]*\/?>|<line[^>]*>.*?<\/line>/gs)) {
    const tag = match[0];
    
    lineElements.push({
      x1: parseNumericAttribute(tag, 'x1'),
      y1: parseNumericAttribute(tag, 'y1'),
      x2: parseNumericAttribute(tag, 'x2'),
      y2: parseNumericAttribute(tag, 'y2'),
      stroke: parseAttributeValue(tag, 'stroke'),
      strokeWidth: parseNumericAttribute(tag, 'stroke-width'),
      transform: parseAttributeValue(tag, 'transform')
    });
  }
  
  // Parse rect elements
  for (const match of svgContent.matchAll(/<rect[^>]*\/?>|<rect[^>]*>.*?<\/rect>/gs)) {
    const tag = match[0];
    
    rectElements.push({
      x: parseNumericAttribute(tag, 'x'),
      y: parseNumericAttribute(tag, 'y'),
      width: parseNumericAttribute(tag, 'width'),
      height: parseNumericAttribute(tag, 'height'),
      fill: parseAttributeValue(tag, 'fill'),
      stroke: parseAttributeValue(tag, 'stroke'),
      strokeWidth: parseNumericAttribute(tag, 'stroke-width'),
      transform: parseAttributeValue(tag, 'transform')
    });
  }
  
  return { glyphs, textElements, pathElements, lineElements, rectElements };
}

function applyTransform(ctx: CanvasRenderingContext2D, transform?: string): void {
  if (!transform) return;
  
  // Parse basic transforms: translate(x,y), scale(x,y), rotate(angle)
  const translateMatch = transform.match(/translate\(([^,]+),([^)]+)\)/);
  if (translateMatch) {
    ctx.translate(parseFloat(translateMatch[1]), parseFloat(translateMatch[2]));
  }
  
  const scaleMatch = transform.match(/scale\(([^,]+)(?:,([^)]+))?\)/);
  if (scaleMatch) {
    const sx = parseFloat(scaleMatch[1]);
    const sy = scaleMatch[2] ? parseFloat(scaleMatch[2]) : sx;
    ctx.scale(sx, sy);
  }
  
  const rotateMatch = transform.match(/rotate\(([^)]+)\)/);
  if (rotateMatch) {
    ctx.rotate(parseFloat(rotateMatch[1]) * Math.PI / 180);
  }
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
}

export function renderLatex(
  ctx: CanvasRenderingContext2D, 
  latexData: ParsedLatex, 
  x: number, 
  y: number, 
  scale: number = 1
): void {
  const { glyphs, textElements, pathElements, lineElements, rectElements } = latexData;
  
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  
  // Render paths (fraction lines, radicals, etc.)
  for (const pathElement of pathElements) {
    ctx.save();
    applyTransform(ctx, pathElement.transform);
    
    renderSVGPath(ctx, pathElement.d);
    
    if (pathElement.fill && pathElement.fill !== 'none') {
      ctx.fillStyle = pathElement.fill;
      ctx.fill();
    }
    
    if (pathElement.stroke && pathElement.stroke !== 'none') {
      ctx.strokeStyle = pathElement.stroke;
      ctx.lineWidth = pathElement.strokeWidth || 1;
      ctx.stroke();
    } else {
      // Default to white fill for visibility
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
    
    ctx.restore();
  }
  
  // Render lines
  for (const lineElement of lineElements) {
    ctx.save();
    applyTransform(ctx, lineElement.transform);
    
    ctx.beginPath();
    ctx.moveTo(lineElement.x1, lineElement.y1);
    ctx.lineTo(lineElement.x2, lineElement.y2);
    
    ctx.strokeStyle = lineElement.stroke || '#ffffff';
    ctx.lineWidth = lineElement.strokeWidth || 1;
    ctx.stroke();
    
    ctx.restore();
  }
  
  // Render rectangles
  for (const rectElement of rectElements) {
    ctx.save();
    applyTransform(ctx, rectElement.transform);
    
    if (rectElement.fill && rectElement.fill !== 'none') {
      ctx.fillStyle = rectElement.fill;
      ctx.fillRect(rectElement.x, rectElement.y, rectElement.width, rectElement.height);
    }
    
    if (rectElement.stroke && rectElement.stroke !== 'none') {
      ctx.strokeStyle = rectElement.stroke;
      ctx.lineWidth = rectElement.strokeWidth || 1;
      ctx.strokeRect(rectElement.x, rectElement.y, rectElement.width, rectElement.height);
    } else if (!rectElement.fill || rectElement.fill === 'none') {
      // Default to white fill for visibility
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(rectElement.x, rectElement.y, rectElement.width, rectElement.height);
    }
    
    ctx.restore();
  }
  
  // Render text elements
  for (const textElement of textElements) {
    let charX = textElement.x;
    for (const char of textElement.content) {
      const glyph = glyphs.get(char);
      if (glyph) {
        ctx.save();
        ctx.translate(charX, textElement.y);
        ctx.scale(0.01, -0.01);
        renderSVGPath(ctx, glyph.path);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.restore();
        charX += glyph.width * 0.01;
      }
    }
  }
  
  ctx.restore();
}